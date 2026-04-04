import type Database from 'better-sqlite3'
import type { WebContents } from 'electron'

import type { EventBus } from '../../events'
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

  constructor(
    private db: Database.Database,
    private bus: EventBus,
    private positionQueueManager: PositionQueueManager,
    private webContents: WebContents,
    private userRating: number = 1500,
  ) {
    // Reset any rows that were left in_progress from a previous crash/shutdown
    // so they re-enter the queue and get analyzed on this run.
    GameAnalysisQueueModel.resetStaleLocks(this.db)

    this.bus.on('app:started', () => void this.evaluateQueue())
    this.bus.on('game:queue:updated', (p) => {
      if (p.reason === 'priority_changed' && p.gameId) {
        console.log(`[AnalysisOrchestrator] Game marked high priority: ${p.gameId}`)
      }
      void this.evaluateQueue(p.gameId)
    })
    this.bus.on('game:analysis:complete', (p) => void this.onGameComplete(p.gameId))
    this.bus.on('position:queue:updated', (p) => this.forwardPositionUpdate(p))
  }

  /**
   * Look at the head of the pending queue and decide whether to start a new
   * game, preempt the current one, or do nothing.
   *
   * @param prioritizedGameId — when set, the user explicitly prioritized this
   *   game. If a different game is active, preempt it regardless of numeric
   *   priority so the user's intent is honored immediately.
   */
  private async evaluateQueue(prioritizedGameId?: string): Promise<void> {
    const head = GameAnalysisQueueModel.fetchHead(this.db)
    if (!head) return

    if (!this.activeCoordinator) {
      await this.startGame(head)
      return
    }

    // Already processing this game — nothing to do.
    if (head.game_id === this.activeGameId) return

    // Force preemption when the user explicitly prioritized a different game,
    // even if numeric priorities are equal (both at 1).
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

  /**
   * Start analyzing a game from the queue. Populates the position queue,
   * creates a GameCoordinator, and begins analysis.
   */
  private async startGame(queueItem: GameAnalysisQueueRow): Promise<void> {
    GameAnalysisQueueModel.markInProgress(this.db, queueItem.game_id)

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
      this.webContents as any,
      game.id,
      game.pgn,
      'fast',
      this.userRating,
      this.bus,
    )

    coordinator.initialize()

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

  /**
   * Called when a game's analysis finishes. Tears down the active coordinator
   * and picks up the next pending game from the queue.
   */
  private async onGameComplete(gameId: string): Promise<void> {
    if (this.activeGameId !== gameId) return

    console.log(`[AnalysisOrchestrator] Game ${gameId} analysis complete, moving to next`)
    if (this.activeCoordinator) {
      await this.activeCoordinator.stop()
    }
    this.activeCoordinator = null
    this.activeGameId = null
    void this.evaluateQueue()
  }

  /**
   * Forward position priority changes to the active coordinator so the
   * game machine can re-evaluate which position to analyze next.
   */
  private forwardPositionUpdate(payload: { reason: string }): void {
    if (!this.activeCoordinator) return
    if (payload.reason === 'priority_changed') {
      this.activeCoordinator.sendPriorityChanged()
    }
  }

  /**
   * Returns the active coordinator for a game ID, if one is running.
   * Used by IPC handlers that need to send navigate/insertNode events.
   */
  getActiveCoordinator(gameId: string): GameCoordinator | null {
    if (this.activeGameId === gameId) return this.activeCoordinator
    return null
  }

  /**
   * Stop the active coordinator for a specific game. If the given gameId is
   * not currently active, this is a no-op. After stopping, re-evaluates the
   * queue so the next pending game starts automatically.
   */
  async stopGame(gameId: string): Promise<void> {
    if (this.activeGameId !== gameId) return
    if (this.activeCoordinator) {
      await this.activeCoordinator.stop()
      this.activeCoordinator = null
      this.activeGameId = null
      void this.evaluateQueue()
    }
  }

  /**
   * Stop the currently active coordinator (if any) and clear state.
   */
  async stopActive(): Promise<void> {
    if (this.activeCoordinator) {
      await this.activeCoordinator.stop()
      this.activeCoordinator = null
      this.activeGameId = null
    }
  }

  private getActiveConfigHash(): string {
    const config: AnalysisModeConfig = {
      mode: 'pipeline',
      preset: 'fast',
      ...ANALYSIS_PRESETS.fast,
    }
    return buildConfigHash(config)
  }
}
