/**
 * Platform types supported for syncing
 */
export type SyncPlatform = 'chess.com' | 'lichess'

/**
 * Status of the overall sync process for a user-platform pair
 */
export type SyncStatus = 'idle' | 'in_progress' | 'paused' | 'completed'

/**
 * Status of individual queue items
 */
export type QueueItemStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

/**
 * Sync metadata - tracks the overall sync state for each user-platform pair
 * Date fields use ISO8601 strings (TEXT in SQLite) - same as chess_games
 */
export interface SyncMetadata {
  id: number
  username: string
  platform: SyncPlatform
  lastSyncedTimestamp: string | null // ISO8601
  lastSyncedMonth: string | null // 'YYYY-MM' format
  syncStatus: SyncStatus
  createdAt: string // ISO8601
  updatedAt: string // ISO8601
}

/**
 * Sync queue item - represents a single month to be synced
 * Date fields use ISO8601 strings (TEXT in SQLite) - same as chess_games
 */
export interface SyncQueueItem {
  id: number
  username: string
  platform: SyncPlatform
  month: string // 'YYYY-MM' format
  priority: number // Lower = higher priority (1 = current month)
  status: QueueItemStatus
  attempts: number
  archiveUrl: string | null // Chess.com only
  lastAttemptAt: string | null // ISO8601
  completedAt: string | null // ISO8601
  errorMessage: string | null
  createdAt: string // ISO8601
}

/**
 * Queue statistics for a user-platform pair
 */
export interface QueueStats {
  total: number
  pending: number
  inProgress: number
  completed: number
  failed: number
  currentMonthComplete: boolean
}

/**
 * Parameters for creating a new queue item
 */
export interface CreateQueueItemParams {
  username: string
  platform: SyncPlatform
  month: string
  priority: number
  archiveUrl?: string
}

/**
 * Parameters for updating sync metadata
 */
export interface UpdateSyncMetadataParams {
  lastSyncedTimestamp?: string // ISO8601
  lastSyncedMonth?: string
  syncStatus?: SyncStatus
}
