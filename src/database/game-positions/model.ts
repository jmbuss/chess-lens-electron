import type Database from 'better-sqlite3'
import type { BaseModel } from '../models/BaseModel'
import type { GamePositionRow } from './types'

export class GamePositionsModel implements BaseModel {
  initializeTables(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS game_positions (
        game_id TEXT NOT NULL REFERENCES chess_games(id) ON DELETE CASCADE,
        fen     TEXT NOT NULL,
        ply     INTEGER NOT NULL,
        PRIMARY KEY (game_id, fen)
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_gp_game_id ON game_positions(game_id)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_gp_fen ON game_positions(fen)
    `)
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  /**
   * Bulk insert positions for a game within a single transaction.
   * Uses INSERT OR IGNORE so re-syncing the same game is safe.
   */
  static bulkInsert(db: Database.Database, rows: GamePositionRow[]): void {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO game_positions (game_id, fen, ply)
      VALUES (?, ?, ?)
    `)

    const insertMany = db.transaction((items: GamePositionRow[]) => {
      for (const row of items) {
        stmt.run(row.game_id, row.fen, row.ply)
      }
    })

    insertMany(rows)
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  static findByGameId(db: Database.Database, gameId: string): GamePositionRow[] {
    return db
      .prepare('SELECT * FROM game_positions WHERE game_id = ? ORDER BY ply ASC')
      .all(gameId) as GamePositionRow[]
  }

  static findGamesByFen(db: Database.Database, fen: string): string[] {
    const rows = db
      .prepare('SELECT game_id FROM game_positions WHERE fen = ?')
      .all(fen) as { game_id: string }[]
    return rows.map((r) => r.game_id)
  }

  static findFensByGameId(db: Database.Database, gameId: string): string[] {
    const rows = db
      .prepare('SELECT fen FROM game_positions WHERE game_id = ? ORDER BY ply ASC')
      .all(gameId) as { fen: string }[]
    return rows.map((r) => r.fen)
  }
}
