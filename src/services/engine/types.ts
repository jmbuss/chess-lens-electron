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

export interface UCIInfoLine {
  depth: number
  seldepth?: number
  multipv?: number
  score: UCIScore
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
 * Numeric Annotation Glyphs (NAG) from PGN standard.
 * Used to classify move quality.
 */
export enum NAG {
  Brilliant = 3, // !!
  Good = 1, // !
  Interesting = 5, // !?
  Neutral = 0, // (no annotation)
  Dubious = 6, // ?!
  Mistake = 2, // ?
  Blunder = 4, // ??
}

export const NAG_SYMBOLS: Record<NAG, string> = {
  [NAG.Brilliant]: '!!',
  [NAG.Good]: '!',
  [NAG.Interesting]: '!?',
  [NAG.Neutral]: '',
  [NAG.Dubious]: '?!',
  [NAG.Mistake]: '?',
  [NAG.Blunder]: '??',
}

export interface MoveNAG {
  moveIndex: number
  move: string
  nag: NAG
  symbol: string
  winRateBefore: number
  winRateAfter: number
  winRateLoss: number
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
