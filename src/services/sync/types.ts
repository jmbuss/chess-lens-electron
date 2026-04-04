import type { SyncPlatform, SyncStatus, QueueStats } from '../../database/sync'

/**
 * Progress callback data sent during sync
 */
export interface SyncProgress {
  username: string
  platform: SyncPlatform
  status: SyncStatus
  totalMonths: number
  completedMonths: number
  currentMonth?: string
  currentMonthComplete: boolean
  lastSyncedTimestamp?: string // ISO8601
  lastSyncedMonth?: string
  gamesAddedThisMonth?: number
  error?: string
}

/**
 * Callback function type for progress updates
 */
export type SyncProgressCallback = (progress: SyncProgress) => void

/**
 * Callback fired after a month sync inserts new games.
 * Receives the IDs of the newly added games.
 */
export type GamesAddedCallback = (gameIds: string[]) => void

/**
 * Result of a single month sync operation
 */
export interface MonthSyncResult {
  month: string
  success: boolean
  gamesFound: number
  gamesAdded: number
  newGameIds: string[]
  error?: string
}

/**
 * Options for building a sync queue
 */
export interface BuildQueueOptions {
  username: string
  platform: SyncPlatform
  /** If true, only add months since last sync. If false, build full queue from all archives. */
  incremental: boolean
}

/**
 * Sync worker configuration options
 */
export interface SyncWorkerConfig {
  /** Delay between API requests in ms (default: 500) */
  delayBetweenRequests: number
  /** Maximum number of retry attempts per month (default: 3) */
  maxRetries: number
}

/**
 * Key used to identify a sync worker instance
 */
export interface SyncWorkerKey {
  username: string
  platform: SyncPlatform
}

/**
 * Convert SyncWorkerKey to string for Map keys
 */
export function syncWorkerKeyToString(key: SyncWorkerKey): string {
  return `${key.platform}:${key.username.toLowerCase()}`
}
