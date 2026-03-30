import type Database from 'better-sqlite3'
import type { BaseModel } from '../models/BaseModel'

export class GameFavoritesModel implements BaseModel {
  initializeTables(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS game_favorites (
        game_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  static findAll(db: Database.Database): string[] {
    const rows = db.prepare('SELECT game_id FROM game_favorites').all() as { game_id: string }[]
    return rows.map(r => r.game_id)
  }

  static isFavorite(db: Database.Database, gameId: string): boolean {
    return db.prepare('SELECT 1 FROM game_favorites WHERE game_id = ? LIMIT 1').get(gameId) != null
  }

  static add(db: Database.Database, gameId: string): void {
    db.prepare('INSERT OR IGNORE INTO game_favorites (game_id) VALUES (?)').run(gameId)
  }

  static remove(db: Database.Database, gameId: string): boolean {
    return db.prepare('DELETE FROM game_favorites WHERE game_id = ?').run(gameId).changes > 0
  }

  static toggle(db: Database.Database, gameId: string): boolean {
    if (this.isFavorite(db, gameId)) {
      this.remove(db, gameId)
      return false
    }
    this.add(db, gameId)
    return true
  }
}
