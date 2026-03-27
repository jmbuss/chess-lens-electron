import type { IpcMainEvent } from 'electron'
import { IpcHandler, IpcRequest, IpcResponse } from './base-handler'

/**
 * Request parameters for initiating a sync
 */
export interface SyncStartRequest {
  username: string
  platform: 'chesscom' | 'lichess'
}

/**
 * Response data for sync status
 */
export interface SyncStatusResponse {
  username: string
  platform: 'chesscom' | 'lichess'
  status: 'idle' | 'in_progress' | 'paused' | 'completed'
  totalMonths: number
  completedMonths: number
  currentMonth?: string
  currentMonthComplete: boolean
  lastSyncedTimestamp?: number
  lastSyncedMonth?: string
}

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
  static readonly channel = 'sync:start'

  async handle(
    event: IpcMainEvent,
    request: IpcRequest<SyncStartRequest>
  ): Promise<IpcResponse<SyncStatusResponse>> {
    try {
      const { username, platform } = request.params!

      // 1. Get or create sync_metadata for this user-platform
      // const metadata = await db.get('SELECT * FROM sync_metadata WHERE username = ? AND platform = ?', [username, platform])

      // 2. Determine sync type
      // if (!metadata || metadata.last_synced_month === null) {
      //   // First sync - build full queue
      //   await buildFullQueue(username, platform)
      // } else {
      //   // Incremental sync - add months since last sync
      //   const currentMonth = getCurrentMonth() // 'YYYY-MM'
      //   await buildIncrementalQueue(username, platform, metadata.last_synced_month, currentMonth)
      // }

      // 3. Reset any 'in_progress' items to 'pending' (resume from interruption)
      // await db.run('UPDATE sync_queue SET status = ? WHERE username = ? AND platform = ? AND status = ?',
      //   ['pending', username, platform, 'in_progress'])

      // 4. Update sync_metadata status to 'in_progress'
      // await db.run('UPDATE sync_metadata SET sync_status = ?, updated_at = ? WHERE username = ? AND platform = ?',
      //   ['in_progress', Date.now(), username, platform])

      // 5. Start sync worker (this runs in background)
      // syncWorker.start(username, platform, (progress) => {
      //   // Send progress updates via IPC
      //   event.sender.send('sync:progress', { username, platform, ...progress })
      // })

      // 6. Get initial queue stats
      // const stats = await getQueueStats(username, platform)
      
      return {
        success: true,
        data: {
          username,
          platform,
          status: 'in_progress',
          totalMonths: 0, // stats.total
          completedMonths: 0, // stats.completed
          currentMonthComplete: false, // stats.current_month_done
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
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
  static readonly channel = 'sync:status'

  async handle(
    event: IpcMainEvent,
    request: IpcRequest<SyncStartRequest>
  ): Promise<IpcResponse<SyncStatusResponse>> {
    try {
      const { username, platform } = request.params!

      // 1. Get sync_metadata
      // const metadata = await db.get('SELECT * FROM sync_metadata WHERE username = ? AND platform = ?',
      //   [username, platform])

      // 2. Get queue stats
      // const stats = await db.get(`
      //   SELECT 
      //     COUNT(*) as total,
      //     SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      //     MAX(CASE WHEN priority = 1 AND status = 'completed' THEN 1 ELSE 0 END) as current_month_done
      //   FROM sync_queue
      //   WHERE username = ? AND platform = ?
      // `, [username, platform])

      // 3. Get current month being synced (if any)
      // const currentTask = await db.get(
      //   'SELECT month FROM sync_queue WHERE username = ? AND platform = ? AND status = ? ORDER BY priority ASC LIMIT 1',
      //   [username, platform, 'in_progress']
      // )

      return {
        success: true,
        data: {
          username,
          platform,
          status: 'idle', // metadata?.sync_status || 'idle'
          totalMonths: 0, // stats?.total || 0
          completedMonths: 0, // stats?.completed || 0
          currentMonth: undefined, // currentTask?.month
          currentMonthComplete: false, // !!stats?.current_month_done
          lastSyncedTimestamp: undefined, // metadata?.last_synced_timestamp
          lastSyncedMonth: undefined, // metadata?.last_synced_month
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
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
  static readonly channel = 'sync:pause'

  async handle(
    event: IpcMainEvent,
    request: IpcRequest<SyncStartRequest>
  ): Promise<IpcResponse<void>> {
    try {
      const { username, platform } = request.params!

      // 1. Stop the sync worker
      // syncWorker.stop(username, platform)

      // 2. Update sync_metadata status to 'paused'
      // await db.run('UPDATE sync_metadata SET sync_status = ?, updated_at = ? WHERE username = ? AND platform = ?',
      //   ['paused', Date.now(), username, platform])

      // 3. Any 'in_progress' queue items will be reset to 'pending' on next app start

      return {
        success: true
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
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
  static readonly channel = 'sync:resume'

  async handle(
    event: IpcMainEvent,
    request: IpcRequest<SyncStartRequest>
  ): Promise<IpcResponse<SyncStatusResponse>> {
    try {
      const { username, platform } = request.params!

      // 1. Check if there's a paused sync
      // const metadata = await db.get('SELECT * FROM sync_metadata WHERE username = ? AND platform = ?',
      //   [username, platform])
      
      // if (!metadata || metadata.sync_status !== 'paused') {
      //   throw new Error('No paused sync found')
      // }

      // 2. Reset any 'in_progress' items to 'pending'
      // await db.run('UPDATE sync_queue SET status = ? WHERE username = ? AND platform = ? AND status = ?',
      //   ['pending', username, platform, 'in_progress'])

      // 3. Update sync_metadata status to 'in_progress'
      // await db.run('UPDATE sync_metadata SET sync_status = ?, updated_at = ? WHERE username = ? AND platform = ?',
      //   ['in_progress', Date.now(), username, platform])

      // 4. Restart sync worker
      // syncWorker.start(username, platform, (progress) => {
      //   event.sender.send('sync:progress', { username, platform, ...progress })
      // })

      // 5. Get current stats
      // const stats = await getQueueStats(username, platform)

      return {
        success: true,
        data: {
          username,
          platform,
          status: 'in_progress',
          totalMonths: 0, // stats.total
          completedMonths: 0, // stats.completed
          currentMonthComplete: false, // stats.current_month_done
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
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
export interface QueueItem {
  id: number
  month: string
  priority: number
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  attempts: number
  lastAttemptAt?: number
  completedAt?: number
  errorMessage?: string
}

export class SyncQueueHandler extends IpcHandler {
  static readonly channel = 'sync:queue'

  async handle(
    event: IpcMainEvent,
    request: IpcRequest<SyncStartRequest>
  ): Promise<IpcResponse<QueueItem[]>> {
    try {
      const { username, platform } = request.params!

      // Get all queue items for this user-platform
      // const items = await db.all(`
      //   SELECT id, month, priority, status, attempts, last_attempt_at, completed_at, error_message
      //   FROM sync_queue
      //   WHERE username = ? AND platform = ?
      //   ORDER BY priority ASC
      // `, [username, platform])

      return {
        success: true,
        data: [] // items
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
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
  static readonly channel = 'sync:retry-failed'

  async handle(
    event: IpcMainEvent,
    request: IpcRequest<SyncStartRequest>
  ): Promise<IpcResponse<number>> {
    try {
      const { username, platform } = request.params!

      // Reset failed items to pending and clear attempts
      // const result = await db.run(`
      //   UPDATE sync_queue 
      //   SET status = 'pending', attempts = 0, error_message = NULL
      //   WHERE username = ? AND platform = ? AND status = 'failed'
      // `, [username, platform])

      // const updatedCount = result.changes || 0

      // If sync is not running, could optionally restart it here
      // const metadata = await db.get('SELECT sync_status FROM sync_metadata WHERE username = ? AND platform = ?',
      //   [username, platform])
      
      // if (metadata?.sync_status === 'idle' && updatedCount > 0) {
      //   // Restart sync to process the newly pending items
      //   syncWorker.start(username, platform, (progress) => {
      //     event.sender.send('sync:progress', { username, platform, ...progress })
      //   })
      // }

      return {
        success: true,
        data: 0 // updatedCount
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}