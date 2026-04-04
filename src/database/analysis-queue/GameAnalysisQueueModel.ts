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
        eval_curve_json  TEXT
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_gaq_status_priority
        ON game_analysis_queue(status, priority DESC, queued_at ASC)
    `)
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  static enqueue(db: Database.Database, gameId: string, priority: number = 3): void {
    db.prepare(`
      INSERT OR IGNORE INTO game_analysis_queue (game_id, priority, queued_at)
      VALUES (?, ?, ?)
    `).run(gameId, priority, isoNow())
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
          eval_curve_json = ?
      WHERE game_id = ?
    `).run(
      isoNow(),
      aggregates.accuracy_white,
      aggregates.accuracy_black,
      aggregates.white_stats_json,
      aggregates.black_stats_json,
      aggregates.eval_curve_json,
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

  static updatePriority(db: Database.Database, gameId: string, priority: number): void {
    db.prepare(`
      UPDATE game_analysis_queue
      SET priority = ?
      WHERE game_id = ?
    `).run(priority, gameId)
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
        ORDER BY priority ASC, queued_at ASC
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
