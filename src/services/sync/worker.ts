/**
 * SyncWorker - Handles the queue-based sync process for chess platforms
 *
 * This worker:
 * 1. Builds the sync queue (full or incremental)
 * 2. Processes queue items one at a time
 * 3. Reports progress via callbacks
 * 4. Handles errors and retries
 */
import type Database from 'better-sqlite3'
import { SyncModel, type SyncPlatform, type CreateQueueItemParams } from '../../database/sync'
import { ChessGameModel } from '../../database/chess'
import { GamePositionsModel } from '../../database/game-positions'
import { fetchArchivesList } from '../chesscom'
import { findOpening } from '@chess-openings/eco.json'
import { getOpeningBookSingleton } from '../../utils/chess/openingBook'
import { parseGameTree, getMoveList, collectMainlineFens } from '../../utils/chess/GameTree'
import { eventBus } from '../../events'
import './events'
import type {
  SyncProgress,
  SyncProgressCallback,
  GamesAddedCallback,
  MonthSyncResult,
  SyncWorkerConfig,
  SyncWorkerKey,
} from './types'
import { syncWorkerKeyToString } from './types'

const CHESS_COM_API_BASE = 'https://api.chess.com/pub'
const DEFAULT_DELAY_MS = 500
const MAX_RETRIES = 3

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Get current month in YYYY-MM format
 */
function getCurrentMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/**
 * Parse month from Chess.com archive URL
 * e.g., "https://api.chess.com/pub/player/hikaru/games/2024/01" -> "2024-01"
 */
function parseMonthFromArchiveUrl(url: string): string {
  const match = url.match(/\/games\/(\d{4})\/(\d{2})$/)
  if (!match) {
    throw new Error(`Invalid archive URL: ${url}`)
  }
  return `${match[1]}-${match[2]}`
}

/**
 * Generate months between two dates (inclusive)
 * Returns array of 'YYYY-MM' strings from startMonth to endMonth
 */
function getMonthsBetween(startMonth: string, endMonth: string): string[] {
  const months: string[] = []
  const [startYear, startMon] = startMonth.split('-').map(Number)
  const [endYear, endMon] = endMonth.split('-').map(Number)

  let year = startYear
  let month = startMon

  while (year < endYear || (year === endYear && month <= endMon)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)
    month++
    if (month > 12) {
      month = 1
      year++
    }
  }

  return months
}

/**
 * Calculate priority for a month (lower = higher priority)
 * Current month gets priority 1, previous month gets 2, etc.
 */
function calculatePriority(month: string): number {
  const current = getCurrentMonth()
  const [currentYear, currentMon] = current.split('-').map(Number)
  const [targetYear, targetMon] = month.split('-').map(Number)

  const monthsDiff = (currentYear - targetYear) * 12 + (currentMon - targetMon)
  return Math.max(1, monthsDiff + 1)
}

/**
 * Build archive URL for Chess.com
 */
function buildArchiveUrl(username: string, month: string): string {
  const [year, mon] = month.split('-')
  return `${CHESS_COM_API_BASE}/player/${username.toLowerCase()}/games/${year}/${mon}`
}

// ==================== SYNC WORKER CLASS ====================

/**
 * SyncWorker manages the sync process for a single user-platform pair
 */
export class SyncWorker {
  private db: Database.Database
  private username: string
  private platform: SyncPlatform
  private config: SyncWorkerConfig
  private progressCallback?: SyncProgressCallback
  private gamesAddedCallback?: GamesAddedCallback
  private isRunning: boolean = false
  private shouldStop: boolean = false

  constructor(
    db: Database.Database,
    username: string,
    platform: SyncPlatform,
    config: Partial<SyncWorkerConfig> = {}
  ) {
    this.db = db
    this.username = username.toLowerCase()
    this.platform = platform
    this.config = {
      delayBetweenRequests: config.delayBetweenRequests ?? DEFAULT_DELAY_MS,
      maxRetries: config.maxRetries ?? MAX_RETRIES,
    }
  }

  /**
   * Build the sync queue for this user-platform pair
   * Returns the number of queue items created
   */
  async buildQueue(incremental: boolean = true): Promise<number> {
    if (this.platform !== 'chess.com') {
      throw new Error(`Platform ${this.platform} not yet supported`)
    }

    const metadata = SyncModel.getOrCreate(this.db, this.username, this.platform)

    let queueItems: CreateQueueItemParams[] = []

    if (!incremental || !metadata.lastSyncedMonth) {
      // Full sync - get all archives from API
      const archives = await fetchArchivesList(this.username)

      queueItems = archives.map(archiveUrl => {
        const month = parseMonthFromArchiveUrl(archiveUrl)
        return {
          username: this.username,
          platform: this.platform,
          month,
          priority: calculatePriority(month),
          archiveUrl,
        }
      })
    } else {
      // Incremental sync - months since last sync, always including current month
      // (Chess.com API only allows per-month fetch, so we must re-fetch current month
      // each time to get games played since the last sync)
      const currentMonth = getCurrentMonth()
      const monthsToSync = getMonthsBetween(metadata.lastSyncedMonth, currentMonth)

      // Ensure current month is always included (handles edge cases like empty range)
      if (!monthsToSync.includes(currentMonth)) {
        monthsToSync.push(currentMonth)
      }

      queueItems = monthsToSync.map(month => ({
        username: this.username,
        platform: this.platform,
        month,
        priority: calculatePriority(month),
        archiveUrl: buildArchiveUrl(this.username, month),
      }))

      // Pass current month so it gets reset to pending when re-added (Chess.com API
      // only allows per-month fetch, so we must re-fetch current month each time)
      if (queueItems.length > 0) {
        return SyncModel.addQueueItemsBatch(this.db, queueItems, [currentMonth])
      }
    }

    if (queueItems.length > 0) {
      return SyncModel.addQueueItemsBatch(this.db, queueItems)
    }

    return 0
  }

  /**
   * Start the sync worker
   */
  async start(progressCallback?: SyncProgressCallback, gamesAddedCallback?: GamesAddedCallback): Promise<void> {
    if (this.isRunning) {
      console.log(`SyncWorker already running for ${this.username}@${this.platform}`)
      return
    }

    this.isRunning = true
    this.shouldStop = false
    this.progressCallback = progressCallback
    this.gamesAddedCallback = gamesAddedCallback

    try {
      // Reset any interrupted in-progress items
      SyncModel.resetInProgressItems(this.db, this.username, this.platform)

      // Update status to in_progress
      SyncModel.updateSyncStatus(this.db, this.username, this.platform, 'in_progress')

      // Send initial progress
      this.sendProgress()

      // Process the queue
      await this.processQueue()

      // Check if we completed everything or were stopped
      const stats = SyncModel.getQueueStats(this.db, this.username, this.platform)

      if (stats.pending === 0 && stats.inProgress === 0) {
        // All done - update metadata
        const lastCompletedMonth = this.getLastCompletedMonth()
        SyncModel.updateMetadata(this.db, this.username, this.platform, {
          syncStatus: 'completed',
          lastSyncedTimestamp: new Date().toISOString(),
          lastSyncedMonth: lastCompletedMonth || getCurrentMonth(),
        })
      } else if (this.shouldStop) {
        // Paused
        SyncModel.updateSyncStatus(this.db, this.username, this.platform, 'paused')
      }

      // Send final progress
      this.sendProgress()
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Stop the sync worker gracefully
   */
  stop(): void {
    this.shouldStop = true
  }

  /**
   * Check if the worker is currently running
   */
  getIsRunning(): boolean {
    return this.isRunning
  }

  /**
   * Process the sync queue
   */
  private async processQueue(): Promise<void> {
    while (!this.shouldStop) {
      // Get next pending item
      const item = SyncModel.getNextPendingItem(this.db, this.username, this.platform)

      if (!item) {
        // No more work to do
        break
      }

      // Check if we've exceeded max retries
      if (item.attempts >= this.config.maxRetries) {
        SyncModel.markFailed(this.db, item.id, `Max retries (${this.config.maxRetries}) exceeded`)
        continue
      }

      // Mark as in progress
      SyncModel.markInProgress(this.db, item.id)
      this.sendProgress(item.month)

      // Process this month
      const result = await this.syncMonth(item.month, item.archiveUrl)

      if (result.success) {
        SyncModel.markCompleted(this.db, item.id)
      } else {
        if (item.attempts + 1 >= this.config.maxRetries) {
          SyncModel.markFailed(this.db, item.id, result.error || 'Unknown error')
        } else {
          SyncModel.updateQueueItemStatus(this.db, item.id, 'pending', result.error)
        }
      }

      this.sendProgress(undefined, result.gamesAdded)

      if (result.newGameIds.length > 0 && this.gamesAddedCallback) {
        this.gamesAddedCallback(result.newGameIds)
      }

      // Delay before next request
      if (!this.shouldStop) {
        await sleep(this.config.delayBetweenRequests)
      }
    }
  }

  /**
   * Sync a single month
   */
  private async syncMonth(month: string, archiveUrl: string | null): Promise<MonthSyncResult> {
    const result: MonthSyncResult = {
      month,
      success: false,
      gamesFound: 0,
      gamesAdded: 0,
      newGameIds: [],
    }

    try {
      if (this.platform !== 'chess.com') {
        throw new Error(`Platform ${this.platform} not yet supported`)
      }

      const url = archiveUrl || buildArchiveUrl(this.username, month)

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Chess-Lens-App/1.0',
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          result.success = true
          return result
        }
        throw new Error(`Chess.com API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as { games: any[] }
      result.gamesFound = data.games?.length || 0

      if (data.games && data.games.length > 0) {
        const { transformChessComGames } = await import('../chesscom')
        const games = transformChessComGames(data.games)

        const newGames = games.filter(game => !ChessGameModel.exists(this.db, game.id))

        if (newGames.length > 0) {
          const { book, positionBook } = await getOpeningBookSingleton()

          const enrichedGames = newGames.map(game => {
            let moveCount: number | undefined
            let eco: string | undefined
            let name: string | undefined
            const positions: { fen: string; ply: number }[] = []
            try {
              const { root } = parseGameTree(game.pgn)
              moveCount = Math.ceil(getMoveList(root).length / 2)

              const fens = collectMainlineFens(root)
              positions.push(...fens)

              for (let i = fens.length - 1; i >= 0; i--) {
                const opening = findOpening(book, fens[i].fen, positionBook)
                if (opening) {
                  eco = opening.eco
                  name = opening.name
                  break
                }
              }
            } catch {
              // Leave moveCount, opening, and positions empty if parsing fails
            }

            return {
              ...game,
              moveCount,
              opening: eco || name ? { eco, name } : undefined,
              positions,
            }
          })

          result.gamesAdded = ChessGameModel.createBatch(this.db, enrichedGames)
          result.newGameIds = enrichedGames.map(g => g.id)

          for (const game of enrichedGames) {
            if (game.positions.length > 0) {
              GamePositionsModel.bulkInsert(
                this.db,
                game.positions.map(p => ({ game_id: game.id, fen: p.fen, ply: p.ply })),
              )
            }
          }

          for (const game of enrichedGames) {
            const endIso =
              game.endTime == null
                ? null
                : typeof game.endTime === 'string'
                  ? game.endTime
                  : game.endTime.toISOString()
            const startIso =
              game.startTime == null
                ? null
                : typeof game.startTime === 'string'
                  ? game.startTime
                  : game.startTime.toISOString()
            const playedAt = endIso ?? startIso ?? new Date().toISOString()

            eventBus.emit('game:synced', {
              gameId: game.id,
              playedAt,
              platform: this.platform,
            })
          }
        }
      }

      result.success = true
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
    }

    return result
  }

  /**
   * Get the most recently completed month
   */
  private getLastCompletedMonth(): string | null {
    const items = SyncModel.getQueueItems(this.db, this.username, this.platform)
    const completedItems = items.filter(item => item.status === 'completed')

    if (completedItems.length === 0) {
      return null
    }

    // Sort by month descending and return the most recent
    completedItems.sort((a, b) => b.month.localeCompare(a.month))
    return completedItems[0].month
  }

  /**
   * Send progress update to callback
   */
  private sendProgress(currentMonth?: string, gamesAddedThisMonth?: number): void {
    if (!this.progressCallback) {
      return
    }

    const metadata = SyncModel.getMetadata(this.db, this.username, this.platform)
    const stats = SyncModel.getQueueStats(this.db, this.username, this.platform)
    const inProgress = SyncModel.getInProgressItem(this.db, this.username, this.platform)

    const progress: SyncProgress = {
      username: this.username,
      platform: this.platform,
      status: metadata?.syncStatus || 'idle',
      totalMonths: stats.total,
      completedMonths: stats.completed,
      currentMonth: currentMonth || inProgress?.month,
      currentMonthComplete: stats.currentMonthComplete,
      lastSyncedTimestamp: metadata?.lastSyncedTimestamp || undefined,
      lastSyncedMonth: metadata?.lastSyncedMonth || undefined,
      gamesAddedThisMonth,
    }

    this.progressCallback(progress)
  }
}

// ==================== SYNC WORKER MANAGER ====================

/**
 * Global manager for sync workers
 * Ensures only one worker per user-platform pair
 */
class SyncWorkerManager {
  private workers: Map<string, SyncWorker> = new Map()

  /**
   * Get or create a worker for a user-platform pair
   */
  getOrCreate(
    db: Database.Database,
    username: string,
    platform: SyncPlatform,
    config?: Partial<SyncWorkerConfig>
  ): SyncWorker {
    const key = syncWorkerKeyToString({ username, platform })

    let worker = this.workers.get(key)
    if (!worker) {
      worker = new SyncWorker(db, username, platform, config)
      this.workers.set(key, worker)
    }

    return worker
  }

  /**
   * Get an existing worker
   */
  get(username: string, platform: SyncPlatform): SyncWorker | undefined {
    const key = syncWorkerKeyToString({ username, platform })
    return this.workers.get(key)
  }

  /**
   * Stop a worker
   */
  stop(username: string, platform: SyncPlatform): void {
    const worker = this.get(username, platform)
    if (worker) {
      worker.stop()
    }
  }

  /**
   * Stop all workers
   */
  stopAll(): void {
    for (const worker of this.workers.values()) {
      worker.stop()
    }
  }

  /**
   * Check if a worker is running
   */
  isRunning(username: string, platform: SyncPlatform): boolean {
    const worker = this.get(username, platform)
    return worker?.getIsRunning() ?? false
  }
}

// Export singleton instance
export const syncWorkerManager = new SyncWorkerManager()
