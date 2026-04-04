/**
 * Chess Game Data Models
 * Interfaces for storing and querying games from Chess.com and Lichess
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum ChessPlatform {
  CHESS_COM = 'chess.com',
  LICHESS = 'lichess.org',
  OTHER = 'other',
}

export enum GameVariant {
  STANDARD = 'chess',
  CHESS960 = 'chess960',
  CRAZYHOUSE = 'crazyhouse',
  KING_OF_THE_HILL = 'kingofthehill',
  THREE_CHECK = 'threecheck',
  ANTICHESS = 'antichess',
  ATOMIC = 'atomic',
  HORDE = 'horde',
  RACING_KINGS = 'racingkings',
  BUGHOUSE = 'bughouse',
}

export enum TimeClass {
  ULTRA_BULLET = 'ultraBullet',
  BULLET = 'bullet',
  BLITZ = 'blitz',
  RAPID = 'rapid',
  CLASSICAL = 'classical',
  DAILY = 'daily',
}

export enum GameResult {
  WIN = 'win',
  LOSS = 'lose',
  DRAW = 'draw',
  CHECKMATE = 'checkmated',
  RESIGNED = 'resigned',
  TIMEOUT = 'timeout',
  AGREED = 'agreed',
  STALEMATE = 'stalemate',
  REPETITION = 'repetition',
  INSUFFICIENT = 'insufficient',
  FIFTY_MOVE = '50move',
  ABANDONED = 'abandoned',
  ABORTED = 'aborted',
}

export enum PlayerColor {
  WHITE = 'white',
  BLACK = 'black',
}

export enum GameStatus {
  IN_PROGRESS = 'inProgress',
  FINISHED = 'finished',
  ABORTED = 'aborted',
}

/**
 * How a game ended, independent of who won.
 * Derived from the losing (or drawing) player's result at sync time.
 */
export enum GameTermination {
  CHECKMATE = 'checkmate',
  RESIGNATION = 'resignation',
  TIMEOUT = 'timeout',
  DRAW = 'draw',
  ABANDONED = 'abandoned',
  ABORTED = 'aborted',
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface TimeControl {
  base: number
  increment: number
  timeClass: TimeClass
}

export interface Player {
  username: string
  rating?: number
  result?: GameResult
  color: PlayerColor
}

export interface Opening {
  eco?: string
  name?: string
}

/**
 * Runtime representation of a chess game (Date objects for timestamps)
 */
export interface ChessGame {
  id: string
  platform: ChessPlatform
  url: string
  white: Player
  black: Player
  variant: GameVariant
  rated: boolean
  timeControl: TimeControl
  status: GameStatus
  termination?: GameTermination
  pgn: string
  fen: string
  opening?: Opening
  moveCount?: number
  startTime?: Date
  endTime?: Date
  importedAt: Date
}

/**
 * Runtime game with additional metadata from joined tables (favorites, analysis).
 */
export interface ChessGameWithMeta extends ChessGame {
  isFavorite: boolean
  analysisStatus: 'UNANALYZED' | 'PENDING' | 'ANALYZING' | 'COMPLETE' | null
}

/**
 * Database representation of a chess game (string timestamps for SQLite)
 */
export interface ChessGameData {
  id: string
  platform: ChessPlatform
  url: string
  white: Player
  black: Player
  variant: GameVariant
  rated: boolean
  timeControl: TimeControl
  status: GameStatus
  termination?: GameTermination
  pgn: string
  fen: string
  opening?: Opening
  moveCount?: number
  startTime?: string
  endTime?: string
  importedAt: string
}

/**
 * Database representation with analysis status: `game_analysis_queue` when
 * present, else FSM from `game_analyses.state`.
 */
export interface ChessGameDataWithAnalysis extends ChessGameData {
  analysisStatus: 'UNANALYZED' | 'PENDING' | 'ANALYZING' | 'COMPLETE' | null
}
