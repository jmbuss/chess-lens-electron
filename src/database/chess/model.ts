import type Database from 'better-sqlite3'
import type { BaseModel } from '../models/BaseModel'
import type { ChessGameData, ChessGameDataWithAnalysis, ChessGame } from './types'
import { PlayerColor } from './types'

export class ChessGameModel implements BaseModel {
  // eslint-disable-next-line class-methods-use-this
  initializeTables(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chess_games (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        url TEXT NOT NULL,

        -- White player (flattened for querying)
        whiteUsername TEXT NOT NULL,
        whiteRating INTEGER,
        whiteResult TEXT,

        -- Black player (flattened for querying)
        blackUsername TEXT NOT NULL,
        blackRating INTEGER,
        blackResult TEXT,

        variant TEXT NOT NULL,
        rated INTEGER NOT NULL DEFAULT 0,

        -- Time control (flattened for querying)
        timeControlBase INTEGER NOT NULL DEFAULT 0,
        timeControlIncrement INTEGER NOT NULL DEFAULT 0,
        timeClass TEXT NOT NULL,

        status TEXT NOT NULL,
        termination TEXT,
        pgn TEXT NOT NULL,
        fen TEXT NOT NULL,

        -- Opening (flattened for querying)
        openingEco TEXT,
        openingName TEXT,

        -- Derived game stats
        moveCount INTEGER,

        -- Timestamps
        startTime TEXT,
        endTime TEXT,
        importedAt TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS idx_chess_games_platform           ON chess_games(platform)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chess_games_whiteUsername      ON chess_games(whiteUsername)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chess_games_blackUsername      ON chess_games(blackUsername)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chess_games_whiteRating        ON chess_games(whiteRating)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chess_games_blackRating        ON chess_games(blackRating)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chess_games_whiteResult        ON chess_games(whiteResult)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chess_games_blackResult        ON chess_games(blackResult)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chess_games_termination        ON chess_games(termination)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chess_games_timeClass          ON chess_games(timeClass)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chess_games_openingEco         ON chess_games(openingEco)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chess_games_startTime          ON chess_games(startTime)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chess_games_moveCount          ON chess_games(moveCount)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chess_games_importedAt         ON chess_games(importedAt)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chess_games_platform_startTime ON chess_games(platform, startTime DESC)`)
  }

  // ---------------------------------------------------------------------------
  // Conversions
  // ---------------------------------------------------------------------------

  private static gameToData(game: ChessGame): ChessGameData {
    return {
      ...game,
      startTime: game.startTime?.toISOString(),
      endTime: game.endTime?.toISOString(),
      importedAt: game.importedAt.toISOString(),
    }
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  static create(db: Database.Database, game: ChessGame): ChessGameData {
    const d = this.gameToData(game)

    db.prepare(`
      INSERT INTO chess_games (
        id, platform, url,
        whiteUsername, whiteRating, whiteResult,
        blackUsername, blackRating, blackResult,
        variant, rated,
        timeControlBase, timeControlIncrement, timeClass,
        status, termination, pgn, fen,
        openingEco, openingName,
        moveCount,
        startTime, endTime, importedAt
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?,
        ?, ?, ?
      )
    `).run(
      d.id, d.platform, d.url,
      d.white.username, d.white.rating ?? null, d.white.result ?? null,
      d.black.username, d.black.rating ?? null, d.black.result ?? null,
      d.variant, d.rated ? 1 : 0,
      d.timeControl.base, d.timeControl.increment, d.timeControl.timeClass,
      d.status, d.termination ?? null, d.pgn, d.fen,
      d.opening?.eco ?? null, d.opening?.name ?? null,
      d.moveCount ?? null,
      d.startTime ?? null, d.endTime ?? null, d.importedAt
    )

    return this.findById(db, d.id)!
  }

  static createBatch(db: Database.Database, games: ChessGame[]): number {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO chess_games (
        id, platform, url,
        whiteUsername, whiteRating, whiteResult,
        blackUsername, blackRating, blackResult,
        variant, rated,
        timeControlBase, timeControlIncrement, timeClass,
        status, termination, pgn, fen,
        openingEco, openingName,
        moveCount,
        startTime, endTime, importedAt
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?,
        ?, ?, ?
      )
    `)

    const insertMany = db.transaction((batch: ChessGame[]) => {
      let inserted = 0
      for (const game of batch) {
        const d = this.gameToData(game)
        const result = stmt.run(
          d.id, d.platform, d.url,
          d.white.username, d.white.rating ?? null, d.white.result ?? null,
          d.black.username, d.black.rating ?? null, d.black.result ?? null,
          d.variant, d.rated ? 1 : 0,
          d.timeControl.base, d.timeControl.increment, d.timeControl.timeClass,
          d.status, d.termination ?? null, d.pgn, d.fen,
          d.opening?.eco ?? null, d.opening?.name ?? null,
          d.moveCount ?? null,
          d.startTime ?? null, d.endTime ?? null, d.importedAt
        )
        if (result.changes > 0) inserted++
      }
      return inserted
    })

    return insertMany(games)
  }

  static updatePgn(db: Database.Database, id: string, pgn: string): void {
    db.prepare('UPDATE chess_games SET pgn = ? WHERE id = ?').run(pgn, id)
  }

  static delete(db: Database.Database, id: string): boolean {
    return db.prepare('DELETE FROM chess_games WHERE id = ?').run(id).changes > 0
  }

  static deleteAll(db: Database.Database): number {
    return db.prepare('DELETE FROM chess_games').run().changes
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  static findById(db: Database.Database, id: string): ChessGameData | null {
    const row = db.prepare('SELECT * FROM chess_games WHERE id = ?').get(id) as any
    return row ? this.parseRow(row) : null
  }

  static exists(db: Database.Database, id: string): boolean {
    return db.prepare('SELECT 1 FROM chess_games WHERE id = ? LIMIT 1').get(id) != null
  }

  static findAll(db: Database.Database): ChessGameData[] {
    return (
      db.prepare('SELECT * FROM chess_games ORDER BY startTime DESC').all() as any[]
    ).map(row => this.parseRow(row))
  }

  static findAllWithAnalysisStatus(db: Database.Database): ChessGameDataWithAnalysis[] {
    const rows = db.prepare(`
      SELECT cg.*,
             json_extract(ga.state, '$.gameFsmState') as analysisFsmState
      FROM chess_games cg
      LEFT JOIN game_analyses ga ON cg.id = ga.game_id
      ORDER BY cg.startTime DESC
    `).all() as any[]
    return rows.map(row => ({
      ...this.parseRow(row),
      analysisStatus: row.analysisFsmState ?? null,
    }))
  }

  static findByPlatform(db: Database.Database, platform: string): ChessGameData[] {
    return (
      db
        .prepare('SELECT * FROM chess_games WHERE platform = ? ORDER BY startTime DESC')
        .all(platform) as any[]
    ).map(row => this.parseRow(row))
  }

  static countByPlatform(db: Database.Database, platform: string): number {
    return (
      db
        .prepare('SELECT COUNT(*) as count FROM chess_games WHERE platform = ?')
        .get(platform) as { count: number }
    ).count
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private static parseRow(row: any): ChessGameData {
    return {
      id: row.id,
      platform: row.platform,
      url: row.url,
      white: {
        username: row.whiteUsername,
        rating: row.whiteRating ?? undefined,
        result: row.whiteResult ?? undefined,
        color: PlayerColor.WHITE,
      },
      black: {
        username: row.blackUsername,
        rating: row.blackRating ?? undefined,
        result: row.blackResult ?? undefined,
        color: PlayerColor.BLACK,
      },
      variant: row.variant,
      rated: Boolean(row.rated),
      timeControl: {
        base: row.timeControlBase,
        increment: row.timeControlIncrement,
        timeClass: row.timeClass,
      },
      status: row.status,
      termination: row.termination ?? undefined,
      pgn: row.pgn,
      fen: row.fen,
      opening:
        row.openingEco || row.openingName
          ? { eco: row.openingEco ?? undefined, name: row.openingName ?? undefined }
          : undefined,
      moveCount: row.moveCount ?? undefined,
      startTime: row.startTime ?? undefined,
      endTime: row.endTime ?? undefined,
      importedAt: row.importedAt,
    }
  }
}
