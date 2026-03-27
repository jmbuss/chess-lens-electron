import type Database from 'better-sqlite3'
import type { BaseModel } from '../models/BaseModel'
import type { GameAnalysisData } from './types'

export class GameAnalysisModel implements BaseModel {
  initializeTables(db: Database.Database): void {
    // Drop and recreate to pick up schema changes — this is a dev-time convenience;
    // data loss is acceptable here as all analysis is re-runnable.
    db.exec(`DROP TABLE IF EXISTS game_analyses`)

    db.exec(`
      CREATE TABLE IF NOT EXISTS game_analyses (
        game_id    TEXT NOT NULL PRIMARY KEY,
        state      TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  /**
   * Persist (insert or replace) the full analysis state for a game.
   */
  static save(db: Database.Database, data: GameAnalysisData): void {
    db.prepare(`
      INSERT INTO game_analyses (game_id, state)
      VALUES (?, ?)
      ON CONFLICT(game_id) DO UPDATE SET
        state      = excluded.state,
        updated_at = datetime('now')
    `).run(data.gameId, JSON.stringify(data))
  }

  static delete(db: Database.Database, gameId: string): boolean {
    return db.prepare('DELETE FROM game_analyses WHERE game_id = ?').run(gameId).changes > 0
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  static findByGameId(db: Database.Database, gameId: string): GameAnalysisData | null {
    const row = db.prepare('SELECT state FROM game_analyses WHERE game_id = ?').get(gameId) as any
    if (!row) return null
    return JSON.parse(row.state) as GameAnalysisData
  }
}
