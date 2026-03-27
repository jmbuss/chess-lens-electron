/**
 * Transforms Chess.com API responses to internal ChessGame format
 */
import type { ChessComGame } from './types'
import type { ChessGame, Player, TimeControl } from '../../database/chess/types'
import {
  ChessPlatform,
  GameVariant,
  TimeClass,
  GameResult,
  GameTermination,
  PlayerColor,
  GameStatus,
} from '../../database/chess/types'

/**
 * Parse PGN headers into a map
 * PGN headers are in the format: [Key "Value"]
 */
function parsePgnHeaders(pgn: string): Map<string, string> {
  const headers = new Map<string, string>()
  const headerRegex = /\[([^\s]+)\s+"([^"]+)"]/g
  let match

  while ((match = headerRegex.exec(pgn)) !== null) {
    const key = match[1]
    const value = match[2]
    headers.set(key, value)
  }

  return headers
}

/**
 * Extract start time from PGN headers
 * Looks for UTCDate/UTCTime or Date/Time headers
 */
function extractStartTime(pgn: string): Date | undefined {
  const headers = parsePgnHeaders(pgn)

  // Try UTC date/time first
  let dateStr = headers.get('UTCDate')
  let timeStr = headers.get('UTCTime')

  // Fall back to regular date/time
  if (!dateStr) {
    dateStr = headers.get('Date')
  }
  if (!timeStr) {
    timeStr = headers.get('Time')
  }

  if (!dateStr) {
    return undefined
  }

  // PGN date format: YYYY.MM.DD (e.g., "2025.01.17")
  // PGN time format: HH:MM:SS (e.g., "14:30:00")
  try {
    if (timeStr) {
      const [year, month, day] = dateStr.split('.').map(Number)
      const [hour, minute, second] = timeStr.split(':').map(Number)
      return new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0))
    } else {
      // Only date, no time - set to midnight UTC
      const [year, month, day] = dateStr.split('.').map(Number)
      return new Date(Date.UTC(year, month - 1, day))
    }
  } catch (error) {
    // Invalid date/time format
    return undefined
  }
}

/**
 * Extract game ID from Chess.com URL
 * e.g., "https://www.chess.com/game/live/12345678" -> "12345678"
 */
export function extractGameId(url: string): string {
  const matches = url.match(/\/(\d+)(?:\?|$)/)
  if (matches && matches[1]) {
    return matches[1]
  }
  // Fallback: use full URL hash
  return url.split('/').pop() || String(Date.now())
}

/**
 * Map Chess.com result to our GameResult enum
 */
function mapResult(result: string): GameResult {
  const resultMap: Record<string, GameResult> = {
    win: GameResult.WIN,
    lose: GameResult.LOSS,
    checkmated: GameResult.CHECKMATE,
    resigned: GameResult.RESIGNED,
    timeout: GameResult.TIMEOUT,
    agreed: GameResult.AGREED,
    stalemate: GameResult.STALEMATE,
    repetition: GameResult.REPETITION,
    insufficient: GameResult.INSUFFICIENT,
    '50move': GameResult.FIFTY_MOVE,
    abandoned: GameResult.ABANDONED,
    timevsinsufficient: GameResult.DRAW,
    // Draw results
    draw: GameResult.DRAW,
  }
  return resultMap[result] || GameResult.WIN
}

/**
 * Map Chess.com time_class to our TimeClass enum
 */
function mapTimeClass(timeClass: string): TimeClass {
  const timeClassMap: Record<string, TimeClass> = {
    bullet: TimeClass.BULLET,
    blitz: TimeClass.BLITZ,
    rapid: TimeClass.RAPID,
    classical: TimeClass.CLASSICAL,
    daily: TimeClass.DAILY,
  }
  return timeClassMap[timeClass] || TimeClass.BLITZ
}

/**
 * Map Chess.com rules to our GameVariant enum
 */
function mapVariant(rules: string): GameVariant {
  const variantMap: Record<string, GameVariant> = {
    chess: GameVariant.STANDARD,
    chess960: GameVariant.CHESS960,
    crazyhouse: GameVariant.CRAZYHOUSE,
    kingofthehill: GameVariant.KING_OF_THE_HILL,
    threecheck: GameVariant.THREE_CHECK,
    bughouse: GameVariant.BUGHOUSE,
  }
  return variantMap[rules] || GameVariant.STANDARD
}

/**
 * Parse Chess.com time_control string into TimeControl object
 * Format examples: "600" (10 min), "180+2" (3 min + 2 sec increment), "1/86400" (daily)
 */
function parseTimeControl(timeControl: string, timeClass: string): TimeControl {
  let base = 0
  let increment = 0

  if (timeControl.includes('/')) {
    // Daily format: "1/86400" means 1 day per move
    const parts = timeControl.split('/')
    base = parseInt(parts[1], 10) || 86400
    increment = 0
  } else if (timeControl.includes('+')) {
    // Standard format with increment: "180+2"
    const parts = timeControl.split('+')
    base = parseInt(parts[0], 10) || 0
    increment = parseInt(parts[1], 10) || 0
  } else {
    // Just base time: "600"
    base = parseInt(timeControl, 10) || 0
    increment = 0
  }

  return {
    base,
    increment,
    timeClass: mapTimeClass(timeClass),
  }
}

const CHECKMATE_RESULTS = new Set([GameResult.CHECKMATE])
const RESIGNATION_RESULTS = new Set([GameResult.RESIGNED])
const TIMEOUT_RESULTS = new Set([GameResult.TIMEOUT])
const DRAW_RESULTS = new Set([
  GameResult.AGREED,
  GameResult.STALEMATE,
  GameResult.REPETITION,
  GameResult.INSUFFICIENT,
  GameResult.FIFTY_MOVE,
  GameResult.DRAW,
])

/**
 * Derive how a game ended from the two players' result codes.
 * Inspects the losing (or drawing) side's result to classify the termination.
 */
function deriveTermination(
  whiteResult: GameResult,
  blackResult: GameResult
): GameTermination {
  const results = [whiteResult, blackResult]

  if (results.some(r => r === GameResult.ABORTED)) return GameTermination.ABORTED
  if (results.some(r => r === GameResult.ABANDONED)) return GameTermination.ABANDONED
  if (results.some(r => CHECKMATE_RESULTS.has(r))) return GameTermination.CHECKMATE
  if (results.some(r => TIMEOUT_RESULTS.has(r))) return GameTermination.TIMEOUT
  if (results.some(r => DRAW_RESULTS.has(r))) return GameTermination.DRAW
  if (results.some(r => RESIGNATION_RESULTS.has(r))) return GameTermination.RESIGNATION

  return GameTermination.RESIGNATION
}

/**
 * Transform a Chess.com game to our internal ChessGame format
 */
export function transformChessComGame(game: ChessComGame): ChessGame {
  const id = extractGameId(game.url)

  const white: Player = {
    username: game.white.username,
    rating: game.white.rating,
    result: mapResult(game.white.result),
    color: PlayerColor.WHITE,
  }

  const black: Player = {
    username: game.black.username,
    rating: game.black.rating,
    result: mapResult(game.black.result),
    color: PlayerColor.BLACK,
  }

  const endTime = new Date(game.end_time * 1000)
  const startTime = extractStartTime(game.pgn)

  if (!startTime) {
    console.warn(`[ChessCom] No startTime found for game ${id}`)
  }

  const termination = white.result && black.result
    ? deriveTermination(white.result, black.result)
    : undefined

  return {
    id,
    platform: ChessPlatform.CHESS_COM,
    url: game.url,
    white,
    black,
    variant: mapVariant(game.rules),
    rated: game.rated,
    timeControl: parseTimeControl(game.time_control, game.time_class),
    status: GameStatus.FINISHED,
    termination,
    pgn: game.pgn,
    fen: game.fen,
    startTime,
    endTime,
    importedAt: new Date(),
  }
}

/**
 * Transform multiple Chess.com games
 */
export function transformChessComGames(games: ChessComGame[]): ChessGame[] {
  return games.map(transformChessComGame)
}
