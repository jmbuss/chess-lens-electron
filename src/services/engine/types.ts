// ==================== Engine Configuration ====================

export type EngineName = 'stockfish' | 'maia'

export type EngineStatus = 'idle' | 'initializing' | 'ready' | 'analyzing' | 'error' | 'quit'

export interface EngineConfig {
  name: EngineName
  binaryPath: string
  args?: string[]
  options?: Record<string, string | number | boolean>
}

export interface MaiaEngineConfig extends EngineConfig {
  name: 'maia'
  networkPath: string
  targetRating: number
}

// ==================== UCI Protocol Types ====================

export type ScoreType = 'cp' | 'mate'

export interface UCIScore {
  type: ScoreType
  value: number
}

/** Win/Draw/Loss probabilities from Stockfish (per-mille, 0-1000). */
export interface WDL {
  win: number
  draw: number
  loss: number
}

export interface UCIInfoLine {
  depth: number
  seldepth?: number
  multipv?: number
  score: UCIScore
  wdl?: WDL
  nodes?: number
  nps?: number
  time?: number
  pv: string[]
  tbhits?: number
  hashfull?: number
}

export interface UCIBestMove {
  move: string
  ponder?: string
}

export interface UCIOption {
  name: string
  type: 'check' | 'spin' | 'combo' | 'button' | 'string'
  default?: string
  min?: number
  max?: number
  vars?: string[]
}

// ==================== Analysis Types ====================

export interface AnalysisOptions {
  depth?: number
  timeMs?: number
  nodes?: number
  multipv?: number
  /** Restrict search to these UCI moves */
  searchmoves?: string[]
}

export interface AnalysisLine {
  multipv: number
  depth: number
  score: UCIScore
  wdl?: WDL
  pv: string[]
  nodes?: number
  nps?: number
  time?: number
}

export interface PositionAnalysis {
  fen: string
  moveIndex: number
  movePlayed?: string
  lines: AnalysisLine[]
  bestMove: string
}

// ==================== NAG Types ====================

/**
 * Move quality classifications.
 *
 * EP-based classifications (assigned by the classifier using Expected Points Loss):
 *   Best, Excellent, Good, Inaccuracy, Mistake, Blunder
 *
 * Special classifications (future — require rules beyond EPL):
 *   Brilliant, Great, Interesting, Miss
 */
export enum NAG {
  Brilliant = 3,    // !! (special — future)
  Great = 7,        // (special — future)
  Best = 8,
  Excellent = 9,
  Good = 1,         // !
  Interesting = 5,  // !? (special — future)
  Neutral = 0,
  Inaccuracy = 6,   // ?!
  Mistake = 2,      // ?
  Blunder = 4,      // ??
  Miss = 10,        // (special — future)
  BookMove = 11,    // Opening book move
}

export const NAG_SYMBOLS: Record<NAG, string> = {
  [NAG.Brilliant]: '!!',
  [NAG.Great]: '',
  [NAG.Best]: '',
  [NAG.Excellent]: '',
  [NAG.Good]: '!',
  [NAG.Interesting]: '!?',
  [NAG.Neutral]: '',
  [NAG.Inaccuracy]: '?!',
  [NAG.Mistake]: '?',
  [NAG.Blunder]: '??',
  [NAG.Miss]: '',
  [NAG.BookMove]: '',
}

export interface MoveNAG {
  moveIndex: number
  move: string
  nag: NAG
  symbol: string
  bestMove: string
  isBestMove: boolean
}

// ==================== Human Move Types ====================

export interface HumanMovePrediction {
  move: string
  rating: number
  /** 1-based rank when returning multiple predictions (1 = most likely) */
  rank?: number
  /** lc0 Q value (cp) — kept for backward compat and softmax fallback */
  score?: number
  /** Raw Maia policy probability [0, 1] parsed from lc0 VerboseMoveStats. When present,
   *  use this directly for display instead of softmaxing Q values. */
  policyProb?: number
}

// ==================== Engine Events ====================

export interface EngineEvents {
  ready: []
  info: [info: UCIInfoLine]
  /** Raw text after "info string " — emitted for engine-specific string lines (e.g. lc0 VerboseMoveStats). */
  stringInfo: [line: string]
  bestmove: [bestmove: UCIBestMove]
  error: [error: Error]
  exit: [code: number | null]
}
