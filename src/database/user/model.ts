import type Database from 'better-sqlite3'
import type { BaseModel } from '../models/BaseModel'
import type { UserData } from './types'

/**
 * User model for managing user information
 */
export class UserModel implements BaseModel {
  // eslint-disable-next-line class-methods-use-this
  initializeTables(db: Database.Database): void {
    // Create table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    // Migrate existing table: check for missing columns and add them
    const tableInfo = db.pragma('table_info(users)') as Array<{ name: string }>
    const existingColumns = new Set(tableInfo.map(col => col.name))

    // Add firstName if missing (with default for existing rows)
    if (!existingColumns.has('firstName')) {
      db.exec('ALTER TABLE users ADD COLUMN firstName TEXT NOT NULL DEFAULT ""')
    }

    // Add lastName if missing (with default for existing rows)
    if (!existingColumns.has('lastName')) {
      db.exec('ALTER TABLE users ADD COLUMN lastName TEXT NOT NULL DEFAULT ""')
    }

    // Add email if missing (with default for existing rows)
    if (!existingColumns.has('email')) {
      db.exec('ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ""')
    }

    // Add createdAt if missing
    if (!existingColumns.has('createdAt')) {
      db.exec("ALTER TABLE users ADD COLUMN createdAt TEXT NOT NULL DEFAULT (datetime('now'))")
    }

    // Add updatedAt if missing
    if (!existingColumns.has('updatedAt')) {
      db.exec("ALTER TABLE users ADD COLUMN updatedAt TEXT NOT NULL DEFAULT (datetime('now'))")
    }

    // Create index on email for faster lookups
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `)
  }

  /**
   * Create a new user
   */
  static create(
    db: Database.Database,
    userData: Omit<UserData, 'id' | 'createdAt' | 'updatedAt'>
  ): UserData {
    const stmt = db.prepare(`
      INSERT INTO users (firstName, lastName, email)
      VALUES (?, ?, ?)
    `)

    const result = stmt.run(userData.firstName, userData.lastName, userData.email)
    return this.findById(db, result.lastInsertRowid as number)!
  }

  /**
   * Find user by ID
   */
  static findById(db: Database.Database, id: number): UserData | null {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?')
    return stmt.get(id) as UserData | null
  }

  /**
   * Find user by email
   */
  static findByEmail(db: Database.Database, email: string): UserData | null {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?')
    return stmt.get(email) as UserData | null
  }

  /**
   * Update user information
   */
  static update(
    db: Database.Database,
    id: number,
    updates: Partial<Omit<UserData, 'id' | 'createdAt'>>
  ): UserData | null {
    const fields: string[] = []
    const values: any[] = []

    if (updates.firstName !== undefined) {
      fields.push('firstName = ?')
      values.push(updates.firstName)
    }
    if (updates.lastName !== undefined) {
      fields.push('lastName = ?')
      values.push(updates.lastName)
    }
    if (updates.email !== undefined) {
      fields.push('email = ?')
      values.push(updates.email)
    }

    if (fields.length === 0) {
      return this.findById(db, id)
    }

    fields.push("updatedAt = datetime('now')")
    values.push(id)

    const stmt = db.prepare(`
      UPDATE users 
      SET ${fields.join(', ')}
      WHERE id = ?
    `)

    stmt.run(...values)
    return this.findById(db, id)
  }

  /**
   * Delete a user
   */
  static delete(db: Database.Database, id: number): boolean {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * Get all users
   */
  static findAll(db: Database.Database): UserData[] {
    const stmt = db.prepare('SELECT * FROM users ORDER BY createdAt DESC')
    return stmt.all() as UserData[]
  }
}
