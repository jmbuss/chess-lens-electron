import type Database from 'better-sqlite3'
import type { WebContents } from 'electron'

import type { EventBus } from '../../events'
import { pushToRenderer } from '../../ipc/push'
import 'src/ipc/channels/chessGamesInvalidate'
import { GameAnalysisQueueModel } from '../../database/analysis-queue'
import type { GameAnalysisQueueRow } from '../../database/analysis-queue'
import { ChessGameModel } from '../../database/chess/model'
import { GameCoordinator } from './GameCoordinator'
import type { PositionQueueManager } from './PositionQueueManager'
import { buildConfigHash } from './PositionQueueManager'
import { ANALYSIS_PRESETS } from 'src/database/analysis/types'
import type { AnalysisModeConfig } from 'src/database/analysis/types'

import '../../events/app'
import './events'

/**
 * Singleton that manages the lifecycle of GameCoordinator instances based on
 * the game_analysis_queue priority. Replaces GameCoordinatorRegistry's role
 * of tracking the active coordinator.
 *
 * Listens to:
 * - app:started — evaluate queue so pending work resumes after launch
 * - game:queue:updated — re-evaluate which game should be active
 * - position:queue:updated — forward priority changes to the active coordinator
 */
export class AnalysisOrchestrator {
  private activeCoordinator: GameCoordinator | null = null
  private activeGameId: string | null = null
  private activePriority: number = 0
  private newItemsInvalidateTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private db: Database.Database,
    private bus: EventBus,
    private positionQueueManager: PositionQueueManager,
    private webContents: WebContents,
    private userRating: number = 1500,
  ) {
    GameAnalysisQueueModel.resetStaleLocks(this.db)

    this.bus.on('app:started', () => void this.evaluateQueue())
    this.bus.on('game:queue:updated', (p) => {
      if (p.reason === 'priority_changed' && p.gameId) {
        console.log(`[AnalysisOrchestrator] Game marked high priority: ${p.gameId}`)
      }
      if (p.reason === 'priority_changed') {
        this.pushChessGamesInvalidate()
      } else if (p.reason === 'new_items') {
        this.scheduleChessGamesInvalidateForNewItems()
      }
      void this.evaluateQueue(p.gameId)
    })
    this.bus.on('game:analysis:complete', (p) => void this.onGameComplete(p.gameId))
    this.bus.on('position:queue:updated', (p) => this.forwardPositionUpdate(p))
  }

  /**
   * Look at the head of the pending queue and decide whether to start a new
   * game, preempt the current one, or do nothing.
   */
  private async evaluateQueue(prioritizedGameId?: string): Promise<void> {
    const head = GameAnalysisQueueModel.fetchHead(this.db)
    if (!head) return

    if (!this.activeCoordinator) {
      await this.startGame(head)
      return
    }

    if (head.game_id === this.activeGameId) return

    const forcePreempt =
      prioritizedGameId != null &&
      prioritizedGameId !== this.activeGameId &&
      head.game_id === prioritizedGameId

    if (forcePreempt || head.priority < this.activePriority) {
      const preemptedId = this.activeGameId!
      console.log(
        `[AnalysisOrchestrator] Preempting ${preemptedId} for higher-priority game ${head.game_id} (priority ${head.priority}, active ${this.activePriority}, forced=${forcePreempt})`,
      )
      await this.activeCoordinator.stop()
      GameAnalysisQueueModel.markPending(this.db, preemptedId)
      GameAnalysisQueueModel.updatePriority(this.db, preemptedId, 3)
      this.activeCoordinator = null
      this.activeGameId = null
      await this.startGame(head)
    }
  }

  private async startGame(queueItem: GameAnalysisQueueRow): Promise<void> {
    GameAnalysisQueueModel.markInProgress(this.db, queueItem.game_id)
    this.pushChessGamesInvalidate()

    const game = ChessGameModel.findById(this.db, queueItem.game_id)
    if (!game) {
      GameAnalysisQueueModel.markFailed(this.db, queueItem.game_id)
      return
    }

    console.log(
      `[AnalysisOrchestrator] Starting analysis for game ${game.id} (${game.white.username} vs ${game.black.username}, ${game.platform}), queue priority ${queueItem.priority}`,
    )

    const configHash = this.getActiveConfigHash()
    this.positionQueueManager.populateFromPgn(game.pgn, configHash)

    const coordinator = new GameCoordinator(
      this.db,
      this.webContents,
      game.id,
      this.userRating,
      this.bus,
    )

    this.activeCoordinator = coordinator
    this.activeGameId = queueItem.game_id
    this.activePriority = queueItem.priority

    coordinator.start().catch((err) => {
      console.error('[AnalysisOrchestrator] Coordinator error:', err)
      GameAnalysisQueueModel.markFailed(this.db, queueItem.game_id)
      this.activeCoordinator = null
      this.activeGameId = null
      void this.evaluateQueue()
    })
  }

  private async onGameComplete(gameId: string): Promise<void> {
    if (this.activeGameId !== gameId) return

    this.pushChessGamesInvalidate()

    console.log(`[AnalysisOrchestrator] Game ${gameId} analysis complete, moving to next`)
    if (this.activeCoordinator) {
      await this.activeCoordinator.stop()
    }
    this.activeCoordinator = null
    this.activeGameId = null
    void this.evaluateQueue()
  }

  /**
   * Forward position priority changes to the active coordinator so it can
   * preempt the current position if the queue head changed.
   */
  private forwardPositionUpdate(payload: { reason: string }): void {
    if (!this.activeCoordinator) return
    if (payload.reason === 'priority_changed') {
      void this.activeCoordinator.onPriorityChanged()
    }
  }

  getActiveCoordinator(gameId: string): GameCoordinator | null {
    if (this.activeGameId === gameId) return this.activeCoordinator
    return null
  }

  async stopGame(gameId: string): Promise<void> {
    if (this.activeGameId !== gameId) return
    if (this.activeCoordinator) {
      await this.activeCoordinator.stop()
      this.activeCoordinator = null
      this.activeGameId = null
      void this.evaluateQueue()
    }
  }

  async stopActive(): Promise<void> {
    if (this.activeCoordinator) {
      await this.activeCoordinator.stop()
      this.activeCoordinator = null
      this.activeGameId = null
    }
  }

  private pushChessGamesInvalidate(): void {
    pushToRenderer(this.webContents, 'chess-games:invalidate', {})
  }

  /** Batches rapid `new_items` events (e.g. many games synced) into one list refresh. */
  private scheduleChessGamesInvalidateForNewItems(): void {
    if (this.newItemsInvalidateTimer != null) {
      clearTimeout(this.newItemsInvalidateTimer)
    }
    this.newItemsInvalidateTimer = setTimeout(() => {
      this.newItemsInvalidateTimer = null
      this.pushChessGamesInvalidate()
    }, 400)
  }

  getActiveConfigHash(): string {
    const config: AnalysisModeConfig = {
      mode: 'pipeline',
      preset: 'fast',
      ...ANALYSIS_PRESETS.fast,
    }
    return buildConfigHash(config)
  }
}
