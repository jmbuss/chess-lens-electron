import type Database from 'better-sqlite3'
import type { BaseModel } from '../models/BaseModel'
import type { PositionAnalysisRow, PositionAnalysisUpsertRow } from './types'
import { isoNow } from '../isoTimestamps'

export class PositionAnalysisModel implements BaseModel {
  static readonly MAX_RETRIES = 3

  initializeTables(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS position_analysis (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        fen         TEXT NOT NULL,
        config_hash TEXT NOT NULL,
        priority    INTEGER NOT NULL DEFAULT 3,
        status      TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
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

    // Migration: add retry_count column for existing databases
    const cols = db.pragma('table_info(position_analysis)') as { name: string }[]
    const colNames = new Set(cols.map(c => c.name))
    if (!colNames.has('retry_count')) {
      db.exec('ALTER TABLE position_analysis ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0')
    }
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
    queuedAt: string = isoNow(),
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
        END,
        queued_at = CASE
          WHEN position_analysis.status = 'pending'
            AND excluded.queued_at < position_analysis.queued_at
          THEN excluded.queued_at
          ELSE position_analysis.queued_at
        END
    `).run(fen, configHash, priority, queuedAt)
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

  static markPending(db: Database.Database, id: number): void {
    db.prepare(`
      UPDATE position_analysis SET status = 'pending' WHERE id = ?
    `).run(id)
  }

  static markFailed(db: Database.Database, id: number): void {
    db.prepare(`
      UPDATE position_analysis SET status = 'failed' WHERE id = ?
    `).run(id)
  }

  /**
   * Retry a failed position: increment retry_count and mark back as pending
   * if under the retry limit, otherwise mark as permanently failed.
   * Returns true if the position was re-queued, false if it exhausted retries.
   */
  static retryOrFail(db: Database.Database, id: number): boolean {
    const row = db.prepare(
      'SELECT retry_count FROM position_analysis WHERE id = ?',
    ).get(id) as { retry_count: number } | undefined

    const retryCount = (row?.retry_count ?? 0) + 1
    if (retryCount >= PositionAnalysisModel.MAX_RETRIES) {
      db.prepare(`
        UPDATE position_analysis
        SET status = 'failed', retry_count = ?
        WHERE id = ?
      `).run(retryCount, id)
      return false
    }

    db.prepare(`
      UPDATE position_analysis
      SET status = 'pending', retry_count = ?
      WHERE id = ?
    `).run(retryCount, id)
    return true
  }

  /**
   * Reset all position rows for a given set of FENs back to pending so they
   * will be re-evaluated from scratch. Clears result_json, depth, and resets
   * retry_count so transient failures get a fresh chance.
   */
  static resetByFens(
    db: Database.Database,
    fens: string[],
    configHash: string,
  ): void {
    if (fens.length === 0) return
    const placeholders = fens.map(() => '?').join(',')
    db.prepare(`
      UPDATE position_analysis
      SET status      = 'pending',
          result_json = NULL,
          depth       = NULL,
          analyzed_at = NULL,
          retry_count = 0,
          priority    = 3
      WHERE fen IN (${placeholders})
        AND config_hash = ?
    `).run(...fens, configHash)
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
        END,
        queued_at = CASE
          WHEN position_analysis.status = 'pending'
            AND excluded.queued_at < position_analysis.queued_at
          THEN excluded.queued_at
          ELSE position_analysis.queued_at
        END
    `)

    const insertMany = db.transaction((items: PositionAnalysisUpsertRow[]) => {
      for (const row of items) {
        stmt.run(row.fen, row.config_hash, row.priority, row.queued_at ?? isoNow())
      }
    })

    insertMany(rows)
  }

  /**
   * Full re-prioritization for a game based on PGN-derived FENs.
   * - Demote all pending rows NOT in fenSet to priority 3
   * - Set all pending rows IN fenSet (except focusedFen) to priority 2
   * - Set focusedFen to priority 1
   */
  static reprioritizeForGame(
    db: Database.Database,
    fenSet: Set<string>,
    focusedFen: string,
    configHash: string,
  ): void {
    const fens = [...fenSet]

    db.transaction(() => {
      // Demote everything pending that's not in this game's FEN set
      if (fens.length > 0) {
        const placeholders = fens.map(() => '?').join(',')
        db.prepare(`
          UPDATE position_analysis
          SET priority = 3
          WHERE config_hash = ?
            AND status = 'pending'
            AND priority < 3
            AND fen NOT IN (${placeholders})
        `).run(configHash, ...fens)
      }

      // Set all in-game FENs to priority 2
      for (const fen of fens) {
        db.prepare(`
          UPDATE position_analysis
          SET priority = 2
          WHERE fen = ? AND config_hash = ? AND status = 'pending'
        `).run(fen, configHash)
      }

      // Set focused FEN to priority 1
      db.prepare(`
        UPDATE position_analysis
        SET priority = 1
        WHERE fen = ? AND config_hash = ? AND status = 'pending'
      `).run(focusedFen, configHash)
    })()
  }

  /**
   * Demote all pending positions whose FEN is NOT in the provided set to
   * priority 3. Uses PGN-derived FEN set instead of game_positions join.
   */
  static demotePositionsNotInFenSet(
    db: Database.Database,
    fenSet: Set<string>,
    configHash: string,
  ): void {
    const fens = [...fenSet]
    if (fens.length === 0) return

    const placeholders = fens.map(() => '?').join(',')
    db.prepare(`
      UPDATE position_analysis
      SET priority = 3
      WHERE fen NOT IN (${placeholders})
        AND config_hash = ?
        AND status = 'pending'
        AND priority < 3
    `).run(...fens, configHash)
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  /**
   * Head of the pending queue filtered to a specific set of FENs.
   * Replaces the old fetchHeadForGame that joined on game_positions.
   * PGN-derived FEN set is the source of truth.
   */
  static fetchHeadForFens(
    db: Database.Database,
    fens: string[],
    configHash: string,
  ): PositionAnalysisRow | null {
    if (fens.length === 0) return null
    const placeholders = fens.map(() => '?').join(',')
    return (
      (db
        .prepare(`
        SELECT *
        FROM position_analysis
        WHERE fen IN (${placeholders})
          AND config_hash = ?
          AND status = 'pending'
        ORDER BY priority ASC, queued_at ASC
        LIMIT 1
      `)
        .get(...fens, configHash) as PositionAnalysisRow | undefined) ?? null
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

  /**
   * Fetch all position_analysis rows for a set of FENs (PGN-derived).
   * Replaces the old findAllForGame that joined on game_positions.
   */
  static findAllByFens(
    db: Database.Database,
    fens: string[],
    configHash: string,
  ): PositionAnalysisRow[] {
    if (fens.length === 0) return []
    const placeholders = fens.map(() => '?').join(',')
    return db
      .prepare(`
        SELECT *
        FROM position_analysis
        WHERE fen IN (${placeholders})
          AND config_hash = ?
      `)
      .all(...fens, configHash) as PositionAnalysisRow[]
  }
}
