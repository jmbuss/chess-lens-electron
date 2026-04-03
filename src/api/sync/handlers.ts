/**
 * Sync API Handlers
 *
 * Provides IPC handlers for managing the sync queue and process
 */
import type { IpcMainEvent } from 'electron'
import type Database from 'better-sqlite3'
import { IpcHandler } from '../../ipc/IPCHandler'
import type { IpcRequest, IpcResponse } from '../../ipc/types'
import { SyncModel, type SyncPlatform, type SyncQueueItem } from '../../database/sync'
import { syncWorkerManager, type SyncProgress } from '../../services/sync'

// ==================== TYPE DEFINITIONS ====================

/**
 * Request parameters for sync operations
 */
export interface SyncRequest {
  username: string
  platform: SyncPlatform
}

/**
 * Response data for sync status
 */
export interface SyncStatusResponse {
  username: string
  platform: SyncPlatform
  status: 'idle' | 'in_progress' | 'paused' | 'completed'
  totalMonths: number
  completedMonths: number
  currentMonth?: string
  currentMonthComplete: boolean
  lastSyncedTimestamp?: string // ISO8601
  lastSyncedMonth?: string
  failedMonths?: number
}

/**
 * Queue item response (matches database type but with camelCase)
 */
export interface QueueItemResponse {
  id: number
  month: string
  priority: number
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  attempts: number
  lastAttemptAt?: string // ISO8601
  completedAt?: string // ISO8601
  errorMessage?: string
}

// ==================== TYPE AUGMENTATION ====================

declare module '../../ipc/handlers' {
  export interface IpcChannels {
    'sync:start': {
      request: SyncRequest
      response: SyncStatusResponse
    }
    'sync:status': {
      request: SyncRequest
      response: SyncStatusResponse
    }
    'sync:pause': {
      request: SyncRequest
      response: void
    }
    'sync:resume': {
      request: SyncRequest
      response: SyncStatusResponse
    }
    'sync:queue': {
      request: SyncRequest
      response: QueueItemResponse[]
    }
    'sync:retry-failed': {
      request: SyncRequest
      response: number
    }
    'sync:progress': {
      push: SyncProgress
    }
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Build SyncStatusResponse from database state
 */
function buildStatusResponse(
  db: Database.Database,
  username: string,
  platform: SyncPlatform
): SyncStatusResponse {
  const metadata = SyncModel.getMetadata(db, username, platform)
  const stats = SyncModel.getQueueStats(db, username, platform)
  const inProgress = SyncModel.getInProgressItem(db, username, platform)

  return {
    username,
    platform,
    status: metadata?.syncStatus || 'idle',
    totalMonths: stats.total,
    completedMonths: stats.completed,
    currentMonth: inProgress?.month,
    currentMonthComplete: stats.currentMonthComplete,
    lastSyncedTimestamp: metadata?.lastSyncedTimestamp || undefined,
    lastSyncedMonth: metadata?.lastSyncedMonth || undefined,
    failedMonths: stats.failed > 0 ? stats.failed : undefined,
  }
}

/**
 * Convert SyncQueueItem to QueueItemResponse
 */
function toQueueItemResponse(item: SyncQueueItem): QueueItemResponse {
  return {
    id: item.id,
    month: item.month,
    priority: item.priority,
    status: item.status,
    attempts: item.attempts,
    lastAttemptAt: item.lastAttemptAt || undefined,
    completedAt: item.completedAt || undefined,
    errorMessage: item.errorMessage || undefined,
  }
}

// ==================== HANDLERS ====================

/**
 * Handler to start sync for a user-platform combination
 * Channel: 'sync:start'
 *
 * Initiates the sync process:
 * 1. Checks sync_metadata to determine if this is first sync or incremental
 * 2. Builds or updates the sync_queue
 * 3. Starts the sync worker
 * 4. Returns initial sync status
 */
export class SyncStartHandler extends IpcHandler {
  static readonly channel = 'sync:start' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    event: IpcMainEvent,
    request: IpcRequest<SyncRequest>
  ): Promise<IpcResponse<SyncStatusResponse>> {
    try {
      if (!request.params) {
        return { success: false, error: 'No parameters provided' }
      }

      const { username, platform } = request.params
      console.log('starting sync for', username, platform)

      if (!username || typeof username !== 'string') {
        return { success: false, error: 'Username is required' }
      }

      if (platform !== 'chess.com') {
        return { success: false, error: 'Only chess.com is currently supported' }
      }

      // Check if already running
      if (syncWorkerManager.isRunning(username, platform)) {
        return {
          success: true,
          data: buildStatusResponse(this.db, username, platform),
        }
      }

      // Get or create sync metadata
      const metadata = SyncModel.getOrCreate(this.db, username, platform)

      // Determine if this is incremental or full sync
      const isIncremental = metadata.lastSyncedMonth !== null

      // Get or create worker
      const worker = syncWorkerManager.getOrCreate(this.db, username, platform)

      // Update status to in_progress immediately
      SyncModel.updateSyncStatus(this.db, username, platform, 'in_progress')

      // Run the entire sync operation in background (fire-and-forget)
      // This includes building the queue and processing it
      void (async () => {
        try {
          // Build queue (this fetches archives list from API for full syncs)
          await worker.buildQueue(isIncremental)

          // Reset any interrupted in-progress items
          SyncModel.resetInProgressItems(this.db, username, platform)

          // Start processing the queue
          await worker.start((progress: SyncProgress) => {
            event.sender.send('sync:progress', progress)
          })
        } catch (error) {
          // Send error as progress update
          event.sender.send('sync:progress', {
            username,
            platform,
            status: 'idle',
            totalMonths: 0,
            completedMonths: 0,
            currentMonthComplete: false,
            error: error instanceof Error ? error.message : 'Sync failed',
          } as SyncProgress)

          // Reset status on error
          SyncModel.updateSyncStatus(this.db, username, platform, 'idle')
        }
      })()

      // Return immediately with initial status
      return {
        success: true,
        data: buildStatusResponse(this.db, username, platform),
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}

/**
 * Handler to get sync status for a user-platform combination
 * Channel: 'sync:status'
 *
 * Returns current sync state without starting a new sync
 */
export class SyncStatusHandler extends IpcHandler {
  static readonly channel = 'sync:status' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<SyncRequest>
  ): Promise<IpcResponse<SyncStatusResponse>> {
    try {
      if (!request.params) {
        return { success: false, error: 'No parameters provided' }
      }

      const { username, platform } = request.params

      if (!username || typeof username !== 'string') {
        return { success: false, error: 'Username is required' }
      }

      return {
        success: true,
        data: buildStatusResponse(this.db, username, platform),
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}

/**
 * Handler to pause an ongoing sync
 * Channel: 'sync:pause'
 *
 * Stops the sync worker gracefully, allowing it to finish current month
 */
export class SyncPauseHandler extends IpcHandler {
  static readonly channel = 'sync:pause' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(_event: IpcMainEvent, request: IpcRequest<SyncRequest>): Promise<IpcResponse<void>> {
    try {
      if (!request.params) {
        return { success: false, error: 'No parameters provided' }
      }

      const { username, platform } = request.params

      if (!username || typeof username !== 'string') {
        return { success: false, error: 'Username is required' }
      }

      // Stop the worker
      syncWorkerManager.stop(username, platform)

      // Update status to paused
      SyncModel.updateSyncStatus(this.db, username, platform, 'paused')

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}

/**
 * Handler to resume a paused sync
 * Channel: 'sync:resume'
 *
 * Restarts the sync worker for a paused sync
 */
export class SyncResumeHandler extends IpcHandler {
  static readonly channel = 'sync:resume' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    event: IpcMainEvent,
    request: IpcRequest<SyncRequest>
  ): Promise<IpcResponse<SyncStatusResponse>> {
    try {
      if (!request.params) {
        return { success: false, error: 'No parameters provided' }
      }

      const { username, platform } = request.params

      if (!username || typeof username !== 'string') {
        return { success: false, error: 'Username is required' }
      }

      // Check if there's a paused sync
      const metadata = SyncModel.getMetadata(this.db, username, platform)

      if (!metadata) {
        return { success: false, error: 'No sync found for this user/platform' }
      }

      if (metadata.syncStatus !== 'paused') {
        return { success: false, error: 'Sync is not paused' }
      }

      // Check if already running
      if (syncWorkerManager.isRunning(username, platform)) {
        return {
          success: true,
          data: buildStatusResponse(this.db, username, platform),
        }
      }

      // Reset any in-progress items
      SyncModel.resetInProgressItems(this.db, username, platform)

      // Get or create worker and start it (fire-and-forget, don't await)
      const worker = syncWorkerManager.getOrCreate(this.db, username, platform)

      void worker.start((progress: SyncProgress) => {
        event.sender.send('sync:progress', progress)
      })

      return {
        success: true,
        data: buildStatusResponse(this.db, username, platform),
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}

/**
 * Handler to get detailed queue information
 * Channel: 'sync:queue'
 *
 * Returns all queue items for debugging or detailed UI
 */
export class SyncQueueHandler extends IpcHandler {
  static readonly channel = 'sync:queue' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<SyncRequest>
  ): Promise<IpcResponse<QueueItemResponse[]>> {
    try {
      if (!request.params) {
        return { success: false, error: 'No parameters provided' }
      }

      const { username, platform } = request.params

      if (!username || typeof username !== 'string') {
        return { success: false, error: 'Username is required' }
      }

      const items = SyncModel.getQueueItems(this.db, username, platform)

      return {
        success: true,
        data: items.map(toQueueItemResponse),
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}

/**
 * Handler to retry failed queue items
 * Channel: 'sync:retry-failed'
 *
 * Resets failed queue items to pending so they can be retried
 */
export class SyncRetryFailedHandler extends IpcHandler {
  static readonly channel = 'sync:retry-failed' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    event: IpcMainEvent,
    request: IpcRequest<SyncRequest>
  ): Promise<IpcResponse<number>> {
    try {
      if (!request.params) {
        return { success: false, error: 'No parameters provided' }
      }

      const { username, platform } = request.params

      if (!username || typeof username !== 'string') {
        return { success: false, error: 'Username is required' }
      }

      // Reset failed items
      const updatedCount = SyncModel.resetFailedItems(this.db, username, platform)

      // If sync is idle and we reset some items, optionally restart
      const metadata = SyncModel.getMetadata(this.db, username, platform)

      if (updatedCount > 0 && metadata?.syncStatus === 'idle') {
        // Restart sync to process the newly pending items (fire-and-forget)
        const worker = syncWorkerManager.getOrCreate(this.db, username, platform)
        void worker.start((progress: SyncProgress) => {
          event.sender.send('sync:progress', progress)
        })
      }

      return {
        success: true,
        data: updatedCount,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}
