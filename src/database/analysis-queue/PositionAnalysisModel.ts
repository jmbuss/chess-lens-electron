import type Database from 'better-sqlite3'
import type { BaseModel } from '../models/BaseModel'
import type { PositionAnalysisRow, PositionAnalysisUpsertRow } from './types'
import { isoNow } from '../isoTimestamps'

export class PositionAnalysisModel implements BaseModel {
  initializeTables(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS position_analysis (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        fen         TEXT NOT NULL,
        config_hash TEXT NOT NULL,
        priority    INTEGER NOT NULL DEFAULT 3,
        status      TEXT NOT NULL DEFAULT 'pending',
        queued_at   TEXT NOT NULL DEFAULT (datetime('now')),

        result_json TEXT,
        depth       INTEGER,
        analyzed_at TEXT,

        UNIQUE (fen, config_hash)
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pa_status_priority
        ON position_analysis(status, priority DESC, queued_at ASC)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pa_fen
        ON position_analysis(fen)
    `)
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  /**
   * Insert a pending row if none exists; update priority upward if the
   * incoming priority is numerically lower (higher urgency).
   */
  static upsertPending(
    db: Database.Database,
    fen: string,
    configHash: string,
    priority: number,
  ): void {
    db.prepare(`
      INSERT INTO position_analysis (fen, config_hash, priority, queued_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(fen, config_hash) DO UPDATE SET
        priority = CASE
          WHEN excluded.priority < position_analysis.priority
            AND position_analysis.status = 'pending'
          THEN excluded.priority
          ELSE position_analysis.priority
        END
    `).run(fen, configHash, priority, isoNow())
  }

  static markInProgress(db: Database.Database, id: number): void {
    db.prepare(`
      UPDATE position_analysis SET status = 'in_progress' WHERE id = ?
    `).run(id)
  }

  static markComplete(
    db: Database.Database,
    id: number,
    resultJson: string,
    depth: number,
  ): void {
    db.prepare(`
      UPDATE position_analysis
      SET status = 'complete',
          result_json = ?,
          depth = ?,
          analyzed_at = ?
      WHERE id = ?
    `).run(resultJson, depth, isoNow(), id)
  }

  static markFailed(db: Database.Database, id: number): void {
    db.prepare(`
      UPDATE position_analysis SET status = 'failed' WHERE id = ?
    `).run(id)
  }

  static updatePriority(
    db: Database.Database,
    fen: string,
    configHash: string,
    priority: number,
  ): void {
    db.prepare(`
      UPDATE position_analysis
      SET priority = ?
      WHERE fen = ? AND config_hash = ? AND status = 'pending'
    `).run(priority, fen, configHash)
  }

  /**
   * Bump all pending positions belonging to a game up to the given priority,
   * but only if their current priority is numerically higher (lower urgency).
   * Uses the game_positions join to scope by game.
   */
  static updatePriorityForGame(
    db: Database.Database,
    gameId: string,
    configHash: string,
    priority: number,
  ): void {
    db.prepare(`
      UPDATE position_analysis
      SET priority = ?
      WHERE fen IN (SELECT fen FROM game_positions WHERE game_id = ?)
        AND config_hash = ?
        AND status = 'pending'
        AND priority > ?
    `).run(priority, gameId, configHash, priority)
  }

  /**
   * Bulk upsert a batch of positions within a single transaction.
   */
  static bulkUpsert(db: Database.Database, rows: PositionAnalysisUpsertRow[]): void {
    const stmt = db.prepare(`
      INSERT INTO position_analysis (fen, config_hash, priority, queued_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(fen, config_hash) DO UPDATE SET
        priority = CASE
          WHEN excluded.priority < position_analysis.priority
            AND position_analysis.status = 'pending'
          THEN excluded.priority
          ELSE position_analysis.priority
        END
    `)

    const insertMany = db.transaction((items: PositionAnalysisUpsertRow[]) => {
      for (const row of items) {
        stmt.run(row.fen, row.config_hash, row.priority, isoNow())
      }
    })

    insertMany(rows)
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  /**
   * Head of the pending queue filtered to positions belonging to a specific
   * game (JOINed through game_positions on FEN).
   */
  static fetchHeadForGame(
    db: Database.Database,
    gameId: string,
    configHash: string,
  ): PositionAnalysisRow | null {
    return (
      (db
        .prepare(`
        SELECT pa.*
        FROM position_analysis pa
        INNER JOIN game_positions gp ON gp.fen = pa.fen
        WHERE gp.game_id = ?
          AND pa.config_hash = ?
          AND pa.status = 'pending'
        ORDER BY pa.priority DESC, pa.queued_at ASC
        LIMIT 1
      `)
        .get(gameId, configHash) as PositionAnalysisRow | undefined) ?? null
    )
  }

  static findByFen(
    db: Database.Database,
    fen: string,
    configHash: string,
  ): PositionAnalysisRow | null {
    return (
      (db
        .prepare('SELECT * FROM position_analysis WHERE fen = ? AND config_hash = ?')
        .get(fen, configHash) as PositionAnalysisRow | undefined) ?? null
    )
  }

  static findByFenAnyConfig(db: Database.Database, fen: string): PositionAnalysisRow[] {
    return db
      .prepare('SELECT * FROM position_analysis WHERE fen = ?')
      .all(fen) as PositionAnalysisRow[]
  }
}
