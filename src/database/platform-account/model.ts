import type Database from 'better-sqlite3'
import { isoNow } from '../isoTimestamps'
import type { BaseModel } from '../models/BaseModel'
import type { PlatformAccountData, PlatformType } from './types'

/**
 * PlatformAccount model for managing platform-specific accounts
 * (e.g., chess.com accounts linked to users)
 */
export class PlatformAccountModel implements BaseModel {
  // eslint-disable-next-line class-methods-use-this
  initializeTables(db: Database.Database): void {
    // Create table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS platform_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        platform TEXT NOT NULL,
        platformUsername TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(userId, platform)
      )
    `)

    // Migrate existing table: check for missing columns and add them
    const tableInfo = db.pragma('table_info(platform_accounts)') as Array<{ name: string }>
    const existingColumns = new Set(tableInfo.map(col => col.name))

    // Add userId if missing (with default for existing rows)
    if (!existingColumns.has('userId')) {
      db.exec('ALTER TABLE platform_accounts ADD COLUMN userId INTEGER NOT NULL DEFAULT 0')
    }

    // Add platform if missing (with default for existing rows)
    if (!existingColumns.has('platform')) {
      db.exec("ALTER TABLE platform_accounts ADD COLUMN platform TEXT NOT NULL DEFAULT ''")
    }

    // Add platformUsername if missing (with default for existing rows)
    if (!existingColumns.has('platformUsername')) {
      db.exec("ALTER TABLE platform_accounts ADD COLUMN platformUsername TEXT NOT NULL DEFAULT ''")
    }

    // Add createdAt if missing
    if (!existingColumns.has('createdAt')) {
      db.exec(
        "ALTER TABLE platform_accounts ADD COLUMN createdAt TEXT NOT NULL DEFAULT (datetime('now'))"
      )
    }

    // Add updatedAt if missing
    if (!existingColumns.has('updatedAt')) {
      db.exec(
        "ALTER TABLE platform_accounts ADD COLUMN updatedAt TEXT NOT NULL DEFAULT (datetime('now'))"
      )
    }

    // Create indexes for faster lookups
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_platform_accounts_userId ON platform_accounts(userId)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_platform_accounts_platform ON platform_accounts(platform)
    `)
  }

  /**
   * Create a new platform account
   */
  static create(
    db: Database.Database,
    accountData: Omit<PlatformAccountData, 'id' | 'createdAt' | 'updatedAt'>
  ): PlatformAccountData {
    const now = isoNow()
    const stmt = db.prepare(`
      INSERT INTO platform_accounts (userId, platform, platformUsername, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      accountData.userId,
      accountData.platform,
      accountData.platformUsername,
      now,
      now,
    )

    return this.findById(db, result.lastInsertRowid as number)!
  }

  /**
   * Find platform account by ID
   */
  static findById(db: Database.Database, id: number): PlatformAccountData | null {
    const stmt = db.prepare('SELECT * FROM platform_accounts WHERE id = ?')
    return stmt.get(id) as PlatformAccountData | null
  }

  /**
   * Find platform account by user ID and platform
   */
  static findByUserAndPlatform(
    db: Database.Database,
    userId: number,
    platform: PlatformType
  ): PlatformAccountData | null {
    const stmt = db.prepare('SELECT * FROM platform_accounts WHERE userId = ? AND platform = ?')
    return stmt.get(userId, platform) as PlatformAccountData | null
  }

  /**
   * Find all platform accounts for a user
   */
  static findByUserId(db: Database.Database, userId: number): PlatformAccountData[] {
    const stmt = db.prepare(
      'SELECT * FROM platform_accounts WHERE userId = ? ORDER BY createdAt DESC'
    )
    return stmt.all(userId) as PlatformAccountData[]
  }

  /**
   * Update platform account information
   */
  static update(
    db: Database.Database,
    id: number,
    updates: Partial<Omit<PlatformAccountData, 'id' | 'userId' | 'createdAt'>>
  ): PlatformAccountData | null {
    const fields: string[] = []
    const values: any[] = []

    if (updates.platform !== undefined) {
      fields.push('platform = ?')
      values.push(updates.platform)
    }
    if (updates.platformUsername !== undefined) {
      fields.push('platformUsername = ?')
      values.push(updates.platformUsername)
    }

    if (fields.length === 0) {
      return this.findById(db, id)
    }

    fields.push('updatedAt = ?')
    values.push(isoNow())
    values.push(id)

    const stmt = db.prepare(`
      UPDATE platform_accounts 
      SET ${fields.join(', ')}
      WHERE id = ?
    `)

    stmt.run(...values)
    return this.findById(db, id)
  }

  /**
   * Delete a platform account
   */
  static delete(db: Database.Database, id: number): boolean {
    const stmt = db.prepare('DELETE FROM platform_accounts WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * Get all platform accounts
   */
  static findAll(db: Database.Database): PlatformAccountData[] {
    const stmt = db.prepare('SELECT * FROM platform_accounts ORDER BY createdAt DESC')
    return stmt.all() as PlatformAccountData[]
  }
}
