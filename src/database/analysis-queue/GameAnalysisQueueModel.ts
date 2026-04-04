import type Database from 'better-sqlite3'
import type { BaseModel } from '../models/BaseModel'
import type { GameAnalysisQueueAggregates, GameAnalysisQueueRow } from './types'
import { isoNow } from '../isoTimestamps'

export class GameAnalysisQueueModel implements BaseModel {
  initializeTables(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS game_analysis_queue (
        game_id      TEXT NOT NULL PRIMARY KEY REFERENCES chess_games(id),
        priority     INTEGER NOT NULL DEFAULT 3,
        status       TEXT NOT NULL DEFAULT 'pending',
        queued_at    TEXT NOT NULL DEFAULT (datetime('now')),
        started_at   TEXT,
        completed_at TEXT,

        accuracy_white   REAL,
        accuracy_black   REAL,
        white_stats_json TEXT,
        black_stats_json TEXT,
        eval_curve_json  TEXT,
        node_results_json       TEXT,
        radar_data_json         TEXT,
        maia_floor_curve_json   TEXT,
        maia_ceiling_curve_json TEXT
      )
    `)

    db.exec(`DROP INDEX IF EXISTS idx_gaq_status_priority`)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_gaq_status_priority
        ON game_analysis_queue(status, priority ASC, queued_at DESC)
    `)

    // Pending rows: tie-break by actual game time (newest first — see fetchHead ORDER BY)
    db.exec(`
      UPDATE game_analysis_queue
      SET queued_at = COALESCE(
        (SELECT NULLIF(TRIM(cg.endTime), '') FROM chess_games cg WHERE cg.id = game_analysis_queue.game_id),
        (SELECT NULLIF(TRIM(cg.startTime), '') FROM chess_games cg WHERE cg.id = game_analysis_queue.game_id),
        (SELECT cg.importedAt FROM chess_games cg WHERE cg.id = game_analysis_queue.game_id),
        queued_at
      )
      WHERE status = 'pending'
    `)

    // Migration: add new columns if they don't exist (for existing databases)
    const cols = db.pragma('table_info(game_analysis_queue)') as { name: string }[]
    const colNames = new Set(cols.map(c => c.name))
    if (!colNames.has('node_results_json')) {
      db.exec('ALTER TABLE game_analysis_queue ADD COLUMN node_results_json TEXT')
    }
    if (!colNames.has('radar_data_json')) {
      db.exec('ALTER TABLE game_analysis_queue ADD COLUMN radar_data_json TEXT')
    }
    if (!colNames.has('maia_floor_curve_json')) {
      db.exec('ALTER TABLE game_analysis_queue ADD COLUMN maia_floor_curve_json TEXT')
    }
    if (!colNames.has('maia_ceiling_curve_json')) {
      db.exec('ALTER TABLE game_analysis_queue ADD COLUMN maia_ceiling_curve_json TEXT')
    }
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  /**
   * @param queuedAt ISO time used to order pending games at the same priority
   *   (`fetchHead` uses `queued_at DESC` — newer = sooner). Defaults to now.
   */
  static enqueue(
    db: Database.Database,
    gameId: string,
    priority: number = 3,
    queuedAt: string = isoNow(),
  ): void {
    db.prepare(`
      INSERT OR IGNORE INTO game_analysis_queue (game_id, priority, queued_at)
      VALUES (?, ?, ?)
    `).run(gameId, priority, queuedAt)
  }

  /**
   * Reset any rows stuck in `in_progress` back to `pending`. Called on
   * startup to recover from a previous crash or unclean shutdown.
   */
  static resetStaleLocks(db: Database.Database): void {
    db.prepare(`
      UPDATE game_analysis_queue
      SET status = 'pending', started_at = NULL
      WHERE status = 'in_progress'
    `).run()
  }

  static markInProgress(db: Database.Database, gameId: string): void {
    db.prepare(`
      UPDATE game_analysis_queue
      SET status = 'in_progress', started_at = ?
      WHERE game_id = ?
    `).run(isoNow(), gameId)
  }

  static markPending(db: Database.Database, gameId: string): void {
    db.prepare(`
      UPDATE game_analysis_queue
      SET status = 'pending', started_at = NULL
      WHERE game_id = ?
    `).run(gameId)
  }

  static markComplete(
    db: Database.Database,
    gameId: string,
    aggregates: GameAnalysisQueueAggregates,
  ): void {
    db.prepare(`
      UPDATE game_analysis_queue
      SET status = 'complete',
          completed_at = ?,
          accuracy_white = ?,
          accuracy_black = ?,
          white_stats_json = ?,
          black_stats_json = ?,
          eval_curve_json = ?,
          node_results_json = ?,
          radar_data_json = ?,
          maia_floor_curve_json = ?,
          maia_ceiling_curve_json = ?
      WHERE game_id = ?
    `).run(
      isoNow(),
      aggregates.accuracy_white,
      aggregates.accuracy_black,
      aggregates.white_stats_json,
      aggregates.black_stats_json,
      aggregates.eval_curve_json,
      aggregates.node_results_json,
      aggregates.radar_data_json,
      aggregates.maia_floor_curve_json,
      aggregates.maia_ceiling_curve_json,
      gameId,
    )
  }

  /**
   * Write incremental aggregates without marking complete. Called after each
   * position finishes so the renderer sees partial results.
   */
  static updateAggregates(
    db: Database.Database,
    gameId: string,
    aggregates: GameAnalysisQueueAggregates,
  ): void {
    db.prepare(`
      UPDATE game_analysis_queue
      SET accuracy_white = ?,
          accuracy_black = ?,
          white_stats_json = ?,
          black_stats_json = ?,
          eval_curve_json = ?,
          node_results_json = ?,
          radar_data_json = ?,
          maia_floor_curve_json = ?,
          maia_ceiling_curve_json = ?
      WHERE game_id = ?
    `).run(
      aggregates.accuracy_white,
      aggregates.accuracy_black,
      aggregates.white_stats_json,
      aggregates.black_stats_json,
      aggregates.eval_curve_json,
      aggregates.node_results_json,
      aggregates.radar_data_json,
      aggregates.maia_floor_curve_json,
      aggregates.maia_ceiling_curve_json,
      gameId,
    )
  }

  static markFailed(db: Database.Database, gameId: string): void {
    db.prepare(`
      UPDATE game_analysis_queue
      SET status = 'failed', completed_at = ?
      WHERE game_id = ?
    `).run(isoNow(), gameId)
  }

  /**
   * Reset a game's analysis row so it runs from scratch: clear all aggregate
   * columns, set status back to pending, and bump to priority 1.
   */
  static resetForReanalysis(db: Database.Database, gameId: string, queuedAt: string): void {
    db.prepare(`
      UPDATE game_analysis_queue
      SET status                  = 'pending',
          priority                = 1,
          queued_at               = ?,
          started_at              = NULL,
          completed_at            = NULL,
          accuracy_white          = NULL,
          accuracy_black          = NULL,
          white_stats_json        = NULL,
          black_stats_json        = NULL,
          eval_curve_json         = NULL,
          node_results_json       = NULL,
          radar_data_json         = NULL,
          maia_floor_curve_json   = NULL,
          maia_ceiling_curve_json = NULL
      WHERE game_id = ?
    `).run(queuedAt, gameId)
  }

  static updatePriority(
    db: Database.Database,
    gameId: string,
    priority: number,
    queuedAt?: string,
  ): void {
    if (queuedAt !== undefined) {
      db.prepare(`
        UPDATE game_analysis_queue
        SET priority = ?, queued_at = ?
        WHERE game_id = ?
      `).run(priority, queuedAt, gameId)
    } else {
      db.prepare(`
        UPDATE game_analysis_queue
        SET priority = ?
        WHERE game_id = ?
      `).run(priority, gameId)
    }
  }

  /**
   * Demote all other pending games (not the given gameId) back to background
   * priority 3. Called when a game is user-focused so previously-boosted games
   * don't compete at the same priority level.
   */
  static demoteOthers(db: Database.Database, gameId: string): void {
    db.prepare(`
      UPDATE game_analysis_queue
      SET priority = 3
      WHERE game_id != ? AND priority < 3 AND status = 'pending'
    `).run(gameId)
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  static fetchHead(db: Database.Database): GameAnalysisQueueRow | null {
    return (
      (db
        .prepare(`
        SELECT * FROM game_analysis_queue
        WHERE status = 'pending'
        ORDER BY priority ASC, queued_at DESC
        LIMIT 1
      `)
        .get() as GameAnalysisQueueRow | undefined) ?? null
    )
  }

  static findByGameId(db: Database.Database, gameId: string): GameAnalysisQueueRow | null {
    return (
      (db
        .prepare('SELECT * FROM game_analysis_queue WHERE game_id = ?')
        .get(gameId) as GameAnalysisQueueRow | undefined) ?? null
    )
  }

  static exists(db: Database.Database, gameId: string): boolean {
    const row = db
      .prepare('SELECT 1 FROM game_analysis_queue WHERE game_id = ?')
      .get(gameId)
    return row !== undefined
  }
}
