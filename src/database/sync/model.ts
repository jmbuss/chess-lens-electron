import type Database from 'better-sqlite3'
import { isoNow } from '../isoTimestamps'
import type { BaseModel } from '../models/BaseModel'
import type {
  SyncMetadata,
  SyncQueueItem,
  SyncPlatform,
  SyncStatus,
  QueueItemStatus,
  QueueStats,
  CreateQueueItemParams,
  UpdateSyncMetadataParams,
} from './types'

/**
 * SyncModel handles both sync_metadata and sync_queue tables
 * for tracking and managing the game sync process
 */
export class SyncModel implements BaseModel {
  // eslint-disable-next-line class-methods-use-this
  initializeTables(db: Database.Database): void {
    // SQLite has no native DATE type - we use TEXT with ISO8601 strings (same as chess_games)
    // Create sync_metadata table
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        platform TEXT NOT NULL,
        last_synced_timestamp TEXT,
        last_synced_month TEXT,
        sync_status TEXT DEFAULT 'idle',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(username, platform)
      )
    `)

    // Create sync_queue table
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        platform TEXT NOT NULL,
        month TEXT NOT NULL,
        priority INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        archive_url TEXT,
        last_attempt_at TEXT,
        completed_at TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(username, platform, month)
      )
    `)

    // Create index for efficient sync worker queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status 
        ON sync_queue(username, platform, status, priority)
    `)

    // Create index for metadata lookups
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sync_metadata_user_platform 
        ON sync_metadata(username, platform)
    `)
  }

  // ==================== SYNC METADATA METHODS ====================

  /**
   * Get or create sync metadata for a user-platform pair
   */
  static getOrCreate(
    db: Database.Database,
    username: string,
    platform: SyncPlatform
  ): SyncMetadata {
    const existing = this.getMetadata(db, username, platform)
    if (existing) {
      return existing
    }

    const now = isoNow()
    const stmt = db.prepare(`
      INSERT INTO sync_metadata (username, platform, sync_status, created_at, updated_at)
      VALUES (?, ?, 'idle', ?, ?)
    `)
    stmt.run(username.toLowerCase(), platform, now, now)

    return this.getMetadata(db, username, platform)!
  }

  /**
   * Get sync metadata for a user-platform pair
   */
  static getMetadata(
    db: Database.Database,
    username: string,
    platform: SyncPlatform
  ): SyncMetadata | null {
    const stmt = db.prepare('SELECT * FROM sync_metadata WHERE username = ? AND platform = ?')
    const row = stmt.get(username.toLowerCase(), platform) as any

    if (!row) {
      return null
    }

    return this.parseMetadataRow(row)
  }

  /**
   * Update sync metadata
   */
  static updateMetadata(
    db: Database.Database,
    username: string,
    platform: SyncPlatform,
    params: UpdateSyncMetadataParams
  ): void {
    const updates: string[] = ['updated_at = ?']
    const values: any[] = [isoNow()]

    if (params.lastSyncedTimestamp !== undefined) {
      updates.push('last_synced_timestamp = ?')
      values.push(params.lastSyncedTimestamp)
    }

    if (params.lastSyncedMonth !== undefined) {
      updates.push('last_synced_month = ?')
      values.push(params.lastSyncedMonth)
    }

    if (params.syncStatus !== undefined) {
      updates.push('sync_status = ?')
      values.push(params.syncStatus)
    }

    values.push(username.toLowerCase(), platform)

    const stmt = db.prepare(`
      UPDATE sync_metadata 
      SET ${updates.join(', ')}
      WHERE username = ? AND platform = ?
    `)
    stmt.run(...values)
  }

  /**
   * Update sync status
   */
  static updateSyncStatus(
    db: Database.Database,
    username: string,
    platform: SyncPlatform,
    status: SyncStatus
  ): void {
    this.updateMetadata(db, username, platform, { syncStatus: status })
  }

  // ==================== SYNC QUEUE METHODS ====================

  /**
   * Add a queue item (or update if exists)
   */
  static addQueueItem(db: Database.Database, params: CreateQueueItemParams): SyncQueueItem {
    const now = isoNow()
    const stmt = db.prepare(`
      INSERT INTO sync_queue (username, platform, month, priority, archive_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(username, platform, month) 
      DO UPDATE SET priority = excluded.priority, archive_url = excluded.archive_url
    `)
    stmt.run(
      params.username.toLowerCase(),
      params.platform,
      params.month,
      params.priority,
      params.archiveUrl || null,
      now
    )

    return this.getQueueItem(db, params.username, params.platform, params.month)!
  }

  /**
   * Add multiple queue items in a batch
   * @param monthsToReset - Months to reset to pending when re-added (e.g. current month for incremental sync).
   *                        When a conflict occurs for these months, also resets status, last_attempt_at, completed_at.
   */
  static addQueueItemsBatch(
    db: Database.Database,
    items: CreateQueueItemParams[],
    monthsToReset: string[] = []
  ): number {
    // TODO: monthsToReset doesn't actually work as intended, it needs to update the timestamps
    const now = isoNow()
    const resetMonthsSet = new Set(monthsToReset)

    const stmtNormal = db.prepare(`
      INSERT INTO sync_queue (username, platform, month, priority, archive_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(username, platform, month) 
      DO UPDATE SET priority = excluded.priority, archive_url = excluded.archive_url
    `)

    const stmtWithReset = db.prepare(`
      INSERT INTO sync_queue (username, platform, month, priority, archive_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(username, platform, month) 
      DO UPDATE SET 
        priority = excluded.priority, 
        archive_url = excluded.archive_url,
        status = 'pending',
        last_attempt_at = NULL,
        completed_at = NULL,
        error_message = NULL,
        attempts = 0
    `)

    const insertMany = db.transaction((itemsToInsert: CreateQueueItemParams[]) => {
      let count = 0
      for (const item of itemsToInsert) {
        const stmt = resetMonthsSet.has(item.month) ? stmtWithReset : stmtNormal
        stmt.run(
          item.username.toLowerCase(),
          item.platform,
          item.month,
          item.priority,
          item.archiveUrl || null,
          now
        )
        count++
      }
      return count
    })

    return insertMany(items)
  }

  /**
   * Get a specific queue item
   */
  static getQueueItem(
    db: Database.Database,
    username: string,
    platform: SyncPlatform,
    month: string
  ): SyncQueueItem | null {
    const stmt = db.prepare(
      'SELECT * FROM sync_queue WHERE username = ? AND platform = ? AND month = ?'
    )
    const row = stmt.get(username.toLowerCase(), platform, month) as any

    if (!row) {
      return null
    }

    return this.parseQueueRow(row)
  }

  /**
   * Get all queue items for a user-platform pair
   */
  static getQueueItems(
    db: Database.Database,
    username: string,
    platform: SyncPlatform
  ): SyncQueueItem[] {
    const stmt = db.prepare(
      'SELECT * FROM sync_queue WHERE username = ? AND platform = ? ORDER BY priority ASC'
    )
    const rows = stmt.all(username.toLowerCase(), platform) as any[]

    return rows.map(row => this.parseQueueRow(row))
  }

  /**
   * Get the next pending queue item (highest priority = lowest number)
   */
  static getNextPendingItem(
    db: Database.Database,
    username: string,
    platform: SyncPlatform
  ): SyncQueueItem | null {
    const stmt = db.prepare(`
      SELECT * FROM sync_queue 
      WHERE username = ? AND platform = ? AND status = 'pending'
      ORDER BY priority ASC 
      LIMIT 1
    `)
    const row = stmt.get(username.toLowerCase(), platform) as any

    if (!row) {
      return null
    }

    return this.parseQueueRow(row)
  }

  /**
   * Get the current in-progress item (if any)
   */
  static getInProgressItem(
    db: Database.Database,
    username: string,
    platform: SyncPlatform
  ): SyncQueueItem | null {
    const stmt = db.prepare(`
      SELECT * FROM sync_queue 
      WHERE username = ? AND platform = ? AND status = 'in_progress'
      ORDER BY priority ASC 
      LIMIT 1
    `)
    const row = stmt.get(username.toLowerCase(), platform) as any

    if (!row) {
      return null
    }

    return this.parseQueueRow(row)
  }

  /**
   * Update queue item status
   */
  static updateQueueItemStatus(
    db: Database.Database,
    id: number,
    status: QueueItemStatus,
    errorMessage?: string
  ): void {
    const now = isoNow()
    let completedAt: string | null = null

    if (status === 'completed') {
      completedAt = now
    }

    const stmt = db.prepare(`
      UPDATE sync_queue 
      SET status = ?, 
          last_attempt_at = ?,
          completed_at = ?,
          error_message = ?,
          attempts = attempts + CASE WHEN ? IN ('in_progress') THEN 1 ELSE 0 END
      WHERE id = ?
    `)
    stmt.run(status, now, completedAt, errorMessage || null, status, id)
  }

  /**
   * Mark queue item as in progress
   */
  static markInProgress(db: Database.Database, id: number): void {
    this.updateQueueItemStatus(db, id, 'in_progress')
  }

  /**
   * Mark queue item as completed
   */
  static markCompleted(db: Database.Database, id: number): void {
    this.updateQueueItemStatus(db, id, 'completed')
  }

  /**
   * Mark queue item as failed
   */
  static markFailed(db: Database.Database, id: number, errorMessage: string): void {
    this.updateQueueItemStatus(db, id, 'failed', errorMessage)
  }

  /**
   * Reset all in_progress items to pending (for recovery after crash/interruption)
   */
  static resetInProgressItems(
    db: Database.Database,
    username: string,
    platform: SyncPlatform
  ): number {
    const stmt = db.prepare(`
      UPDATE sync_queue 
      SET status = 'pending'
      WHERE username = ? AND platform = ? AND status = 'in_progress'
    `)
    const result = stmt.run(username.toLowerCase(), platform)
    return result.changes
  }

  /**
   * Reset all failed items to pending for retry
   */
  static resetFailedItems(db: Database.Database, username: string, platform: SyncPlatform): number {
    const stmt = db.prepare(`
      UPDATE sync_queue 
      SET status = 'pending', attempts = 0, error_message = NULL
      WHERE username = ? AND platform = ? AND status = 'failed'
    `)
    const result = stmt.run(username.toLowerCase(), platform)
    return result.changes
  }

  /**
   * Get queue statistics
   */
  static getQueueStats(
    db: Database.Database,
    username: string,
    platform: SyncPlatform
  ): QueueStats {
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        MAX(CASE WHEN priority = 1 AND status = 'completed' THEN 1 ELSE 0 END) as current_month_done
      FROM sync_queue
      WHERE username = ? AND platform = ?
    `)
    const row = stmt.get(username.toLowerCase(), platform) as any

    return {
      total: row?.total || 0,
      pending: row?.pending || 0,
      inProgress: row?.in_progress || 0,
      completed: row?.completed || 0,
      failed: row?.failed || 0,
      currentMonthComplete: !!row?.current_month_done,
    }
  }

  /**
   * Check if there are any pending or in_progress items
   */
  static hasWorkRemaining(
    db: Database.Database,
    username: string,
    platform: SyncPlatform
  ): boolean {
    const stats = this.getQueueStats(db, username, platform)
    return stats.pending > 0 || stats.inProgress > 0
  }

  /**
   * Clear queue items for a user-platform pair
   */
  static clearQueue(db: Database.Database, username: string, platform: SyncPlatform): number {
    const stmt = db.prepare('DELETE FROM sync_queue WHERE username = ? AND platform = ?')
    const result = stmt.run(username.toLowerCase(), platform)
    return result.changes
  }

  /**
   * Reset a queue item to pending so it gets re-fetched (e.g. current month)
   * Used when we need to re-sync a month that was previously completed
   */
  static resetQueueItemToPending(
    db: Database.Database,
    username: string,
    platform: SyncPlatform,
    month: string
  ): boolean {
    const stmt = db.prepare(`
      UPDATE sync_queue 
      SET status = 'pending', attempts = 0, error_message = NULL, 
          completed_at = NULL, last_attempt_at = NULL
      WHERE username = ? AND platform = ? AND month = ? AND status = 'completed'
    `)
    const result = stmt.run(username.toLowerCase(), platform, month)
    return result.changes > 0
  }

  /**
   * Delete completed queue items older than a certain age
   */
  static pruneCompletedItems(
    db: Database.Database,
    username: string,
    platform: SyncPlatform,
    olderThanMs: number = 7 * 24 * 60 * 60 * 1000 // 7 days default
  ): number {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString()
    const stmt = db.prepare(`
      DELETE FROM sync_queue 
      WHERE username = ? AND platform = ? AND status = 'completed' AND completed_at < ?
    `)
    const result = stmt.run(username.toLowerCase(), platform, cutoff)
    return result.changes
  }

  // ==================== PRIVATE HELPERS ====================

  private static parseMetadataRow(row: any): SyncMetadata {
    return {
      id: row.id,
      username: row.username,
      platform: row.platform as SyncPlatform,
      lastSyncedTimestamp: row.last_synced_timestamp,
      lastSyncedMonth: row.last_synced_month,
      syncStatus: row.sync_status as SyncStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private static parseQueueRow(row: any): SyncQueueItem {
    return {
      id: row.id,
      username: row.username,
      platform: row.platform as SyncPlatform,
      month: row.month,
      priority: row.priority,
      status: row.status as QueueItemStatus,
      attempts: row.attempts,
      archiveUrl: row.archive_url,
      lastAttemptAt: row.last_attempt_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    }
  }
}
