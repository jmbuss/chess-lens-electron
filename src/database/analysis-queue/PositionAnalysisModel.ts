import type Database from 'better-sqlite3'
import type { BaseModel } from '../models/BaseModel'
import type { PositionAnalysisRow, PositionAnalysisUpsertRow } from './types'
import { isoNow } from '../isoTimestamps'

// ==================== Positional Column Definitions ====================

const EVALRAW_PER_COLOR_FEATURES = [
  'pawn_count', 'knight_count', 'bishop_count', 'rook_count', 'queen_count',
  'passed_pawns', 'isolated_pawns', 'doubled_pawns', 'backward_pawns',
  'connected_pawns', 'supported_pawns', 'phalanx_pawns', 'blocked_pawns',
  'knight_mobility', 'bishop_mobility', 'rook_mobility', 'queen_mobility',
  'knight_outpost', 'bishop_outpost', 'reachable_outpost', 'bad_outpost',
  'bishop_long_diagonal', 'bishop_pair', 'bishop_pawns_same_color',
  'bishop_xray_pawns', 'minor_behind_pawn', 'rook_on_open_file',
  'rook_on_semiopen_file', 'rook_on_queen_file', 'rook_on_king_ring',
  'bishop_on_king_ring', 'trapped_rook', 'weak_queen', 'queen_infiltration',
  'king_attackers_count', 'king_attackers_weight', 'king_attacks_count',
  'king_danger', 'king_flank_attack', 'king_flank_defense', 'unsafe_checks',
  'king_ring_weak', 'blockers_for_king', 'king_pawnless_flank',
  'weak_pieces', 'hanging_pieces', 'restricted_pieces',
  'threat_by_safe_pawn', 'threat_by_pawn_push', 'threat_by_king',
  'knight_on_queen', 'slider_on_queen', 'weak_queen_protection',
  'passed_pawn_best_rank', 'free_passed_pawns',
  'space_count',
  'can_castle_kingside', 'can_castle_queenside', 'non_pawn_material',
] as const

const EVALRAW_GLOBAL_FEATURES = [
  'phase', 'complexity', 'scale_factor', 'outflanking',
  'pawns_on_both_flanks', 'almost_unwinnable', 'infiltration',
  'opposite_bishops', 'side_to_move', 'rule50_count', 'final_eval',
] as const

const EVAL_TERM_COL_NAMES = [
  'material', 'imbalance', 'pawns', 'knights', 'bishops', 'rooks', 'queens',
  'mobility', 'kingsafety', 'threats', 'passed', 'space', 'winnable',
] as const

/** All evalraw column names (per-color _w/_b + globals). */
const EVALRAW_COLUMNS = [
  ...EVALRAW_PER_COLOR_FEATURES.flatMap(f => [`${f}_w`, `${f}_b`]),
  ...EVALRAW_GLOBAL_FEATURES,
]

/** All eval column names (term × side × phase + eval_final). */
const EVAL_COLUMNS = [
  ...EVAL_TERM_COL_NAMES.flatMap(t => [
    `eval_${t}_white_mg`, `eval_${t}_white_eg`,
    `eval_${t}_black_mg`, `eval_${t}_black_eg`,
    `eval_${t}_total_mg`, `eval_${t}_total_eg`,
  ]),
  'eval_final',
]

const ALL_POSITIONAL_COLUMNS = new Set([...EVALRAW_COLUMNS, ...EVAL_COLUMNS])

function buildPositionalColumnsSQL(): string {
  const evalrawDefs = EVALRAW_COLUMNS.map(col => `${col} INTEGER`)
  const evalDefs = EVAL_COLUMNS.map(col => `${col} REAL`)
  return [...evalrawDefs, ...evalDefs].join(',\n        ')
}

export { EVALRAW_PER_COLOR_FEATURES, EVALRAW_GLOBAL_FEATURES, EVAL_TERM_COL_NAMES }

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

        ${buildPositionalColumnsSQL()},

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
    positionalColumns?: Record<string, number | null>,
  ): void {
    const sets = ["status = 'complete'", 'result_json = ?', 'depth = ?', 'analyzed_at = ?']
    const params: (string | number | null)[] = [resultJson, depth, isoNow()]

    if (positionalColumns) {
      for (const [col, val] of Object.entries(positionalColumns)) {
        if (!ALL_POSITIONAL_COLUMNS.has(col)) continue
        sets.push(`${col} = ?`)
        params.push(val)
      }
    }

    params.push(id)
    db.prepare(
      `UPDATE position_analysis SET ${sets.join(', ')} WHERE id = ?`,
    ).run(...params)
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
