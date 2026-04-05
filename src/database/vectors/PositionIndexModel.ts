import type Database from 'better-sqlite3'
import type { BaseModel } from '../models/BaseModel'
import type { PositionIndexRow, PositionIndexInsertRow } from './types'

export class PositionIndexModel implements BaseModel {
  initializeTables(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS position_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        ply INTEGER NOT NULL,
        fen TEXT NOT NULL,
        san TEXT,
        uci_move TEXT,
        color TEXT NOT NULL,
        move_number INTEGER,
        nag TEXT,
        eval_cp INTEGER,
        eval_mate INTEGER,
        wdl_win INTEGER,
        wdl_draw INTEGER,
        wdl_loss INTEGER,
        criticality_score REAL,
        phase_score INTEGER,
        is_best_move INTEGER,
        move_accuracy REAL,
        index_reason TEXT NOT NULL,
        opening_eco TEXT,
        opening_name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES chess_games(id) ON DELETE CASCADE,
        UNIQUE(game_id, ply)
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS idx_pi_nag ON position_index(nag)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_pi_index_reason ON position_index(index_reason)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_pi_criticality ON position_index(criticality_score DESC)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_pi_game_id ON position_index(game_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_pi_fen ON position_index(fen)`)
  }

  static bulkInsert(db: Database.Database, rows: PositionIndexInsertRow[]): number[] {
    const stmt = db.prepare(`
      INSERT INTO position_index (
        game_id, ply, fen, san, uci_move, color, move_number, nag,
        eval_cp, eval_mate, wdl_win, wdl_draw, wdl_loss,
        criticality_score, phase_score, is_best_move, move_accuracy,
        index_reason, opening_eco, opening_name
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
    `)

    const ids: number[] = []
    for (const row of rows) {
      const result = stmt.run(
        row.game_id, row.ply, row.fen, row.san, row.uci_move, row.color, row.move_number, row.nag,
        row.eval_cp, row.eval_mate, row.wdl_win, row.wdl_draw, row.wdl_loss,
        row.criticality_score, row.phase_score, row.is_best_move, row.move_accuracy,
        row.index_reason, row.opening_eco, row.opening_name,
      )
      // sqlite-vec vec0 requires INTEGER PK; better-sqlite3 may return BigInt for lastInsertRowid
      ids.push(Number(result.lastInsertRowid))
    }
    return ids
  }

  static findAll(
    db: Database.Database,
    filters: {
      indexReason?: string
      nag?: string
      color?: string
      gameId?: string
    } = {},
    pagination: { page: number; pageSize: number } = { page: 1, pageSize: 20 },
    sort: { sortBy: string; sortDir: 'asc' | 'desc' } = { sortBy: 'created_at', sortDir: 'desc' },
  ): { positions: PositionIndexRow[]; total: number } {
    const conditions: string[] = []
    const params: (string | number)[] = []

    if (filters.indexReason) {
      conditions.push('pi.index_reason = ?')
      params.push(filters.indexReason)
    }
    if (filters.nag) {
      conditions.push('pi.nag = ?')
      params.push(filters.nag)
    }
    if (filters.color) {
      conditions.push('pi.color = ?')
      params.push(filters.color)
    }
    if (filters.gameId) {
      conditions.push('pi.game_id = ?')
      params.push(filters.gameId)
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    const allowedSortColumns: Record<string, string> = {
      criticality_score: 'pi.criticality_score',
      created_at: 'pi.created_at',
      ply: 'pi.ply',
      move_number: 'pi.move_number',
      index_reason: 'pi.index_reason',
    }
    const sortColumn = allowedSortColumns[sort.sortBy] ?? 'pi.created_at'
    const sortDir = sort.sortDir === 'asc' ? 'ASC' : 'DESC'

    const countRow = db.prepare(
      `SELECT COUNT(*) as total FROM position_index pi ${whereClause}`,
    ).get(...params) as { total: number }

    const offset = (pagination.page - 1) * pagination.pageSize
    const positions = db.prepare(`
      SELECT pi.*
      FROM position_index pi
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDir}
      LIMIT ? OFFSET ?
    `).all(...params, pagination.pageSize, offset) as PositionIndexRow[]

    return { positions, total: countRow.total }
  }

  static findByGameId(db: Database.Database, gameId: string): PositionIndexRow[] {
    return db.prepare(
      'SELECT * FROM position_index WHERE game_id = ? ORDER BY ply ASC',
    ).all(gameId) as PositionIndexRow[]
  }

  static deleteByGameId(db: Database.Database, gameId: string): void {
    db.prepare('DELETE FROM position_index WHERE game_id = ?').run(gameId)
  }

  static findByIds(db: Database.Database, ids: number[]): PositionIndexRow[] {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    return db.prepare(
      `SELECT * FROM position_index WHERE id IN (${placeholders})`,
    ).all(...ids) as PositionIndexRow[]
  }
}
