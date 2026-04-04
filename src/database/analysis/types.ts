import type { NAG, AnalysisLine, HumanMovePrediction, UCIScore, WDL } from 'src/services/engine/types'

// ==================== Game FSM ====================

export type GameFSMState = 'UNANALYZED' | 'ANALYZING' | 'COMPLETE'

// ==================== Node FSM State ====================

export type NodeFsmState = 'UNANALYZED' | 'NAG_COMPLETE' | 'FAILED'

// ==================== Positional Features ====================

/**
 * A single MG/EG score pair from Stockfish's static eval output.
 * Values are in pawns (e.g. 0.5 = half a pawn advantage).
 */
export interface EvalTermScore {
  /** Middlegame component */
  mg: number
  /** Endgame component */
  eg: number
}

/**
 * One row from Stockfish's eval table: per-side (white/black) and total scores.
 * `null` means the engine reported "----" (not applicable for this side/term).
 */
export interface EvalTerm {
  white: EvalTermScore | null
  black: EvalTermScore | null
  total: EvalTermScore | null
}

/**
 * Positional features derived from Stockfish Classic's static `eval` command.
 * All scores are in pawns from White's perspective (positive = White better).
 * Individual EvalTerm values are White-perspective: white.mg is White's contribution
 * to its own score; total.mg = white.mg − black.mg.
 */
export interface PositionalFeatures {
  material:   EvalTerm
  imbalance:  EvalTerm
  pawns:      EvalTerm
  knights:    EvalTerm
  bishops:    EvalTerm
  rooks:      EvalTerm
  queens:     EvalTerm
  mobility:   EvalTerm
  kingSafety: EvalTerm
  threats:    EvalTerm
  passed:     EvalTerm
  space:      EvalTerm
  winnable:   EvalTerm
  /**
   * Final interpolated evaluation in pawns, White-perspective.
   * Positive = White is winning, negative = Black is winning.
   */
  finalEvaluation: number
}

// ==================== Positional Radar (runtime-only) ====================

/** Per-axis radar value, split by side. */
export interface RadarAxisValue {
  white: number
  black: number
}

/**
 * Aggregated positional radar data for the whole game.
 * Computed at runtime by the game machine; not persisted.
 */
export interface PositionalRadarData {
  axes: {
    pawnStructure: RadarAxisValue
    space: RadarAxisValue
    mobility: RadarAxisValue
    kingSafety: RadarAxisValue
    threats: RadarAxisValue
    imbalance: RadarAxisValue
  }
  whiteMaterial: number
  blackMaterial: number
  hasData: boolean
}

// ==================== Analysis Mode ====================

export type AnalysisPreset = 'fast' | 'deep' | 'study'

export interface AnalysisModeConfig {
  mode: 'pipeline' | 'focus'
  preset?: AnalysisPreset

  depth?: number
  timeMs?: number
  nodes?: number
  multipv?: number

  /** Focus mode: minimum depth gain over previous result to persist */
  depthThreshold?: number

  /** The player's rating used to select Maia engines for human-like analysis. */
  userRating?: number
}

// ==================== Maia Analysis ====================

export interface MaiaAnalysisResult {
  rating: number
  predictions: HumanMovePrediction[]
}

export const ANALYSIS_PRESETS: Record<AnalysisPreset, Partial<AnalysisModeConfig>> = {
  fast: { multipv: 6, timeMs: 1500 },
  deep: { multipv: 5, depth: 20 },
  study: { multipv: 5, depth: 40 },
}

// ==================== Augmented Maia Results ====================

export interface AugmentedHumanMovePrediction extends HumanMovePrediction {
  /** Stockfish eval (cp, White-perspective) for this specific move. Null if eval failed. */
  stockfishEval: number | null
  /** Full Stockfish score for this move (includes mate scores). */
  stockfishScore: UCIScore | null
}

export interface AugmentedMaiaResult {
  rating: number
  predictions: AugmentedHumanMovePrediction[]
}

// ==================== Mistake Probability ====================

export interface MistakeProbability {
  /** Probability the player finds a move losing < 30cp */
  goodMoveProb: number
  /** Probability of losing 30–80cp */
  inaccuracyProb: number
  /** Probability of losing 80–200cp */
  mistakeProb: number
  /** Probability of losing ≥ 200cp */
  blunderProb: number
}

// ==================== Analysis Node ====================

/**
 * A node in the analysis tree. Mirrors the shape of `AugmentedNodeData` from
 * `GameTree` so the UI can render both structures with the same code.
 * `id` is the ply index and acts as the unique identifier within a tree.
 */
export interface AnalysisNode {
  /** Ply index — doubles as the unique node ID within the tree. */
  id: number
  ply: number
  fen: string
  uciMove: string | null
  /** SAN notation for the move that led to this position (e.g. "Nf3"). Null for the root. */
  san?: string
  /** Source square in algebraic notation (e.g. "g1"). Null for the root. */
  from?: string
  /** Destination square in algebraic notation (e.g. "f3"). Null for the root. */
  to?: string
  /** Piece type character: 'p', 'n', 'b', 'r', 'q', 'k'. Null for the root. */
  piece?: string
  /** Color that made the move: 'w' or 'b'. Null for the root. */
  color?: 'w' | 'b'
  /** Captured piece type, if any. */
  captured?: string
  /** Promotion piece type, if the move was a pawn promotion. */
  promotion?: string
  /** Full move number (1, 2, 3, …). Null for the root. */
  moveNumber?: number
  fsmState: NodeFsmState

  // ── Phase classification (per-position, from PhaseClassificationService) ──
  /** Raw composite phase score: 128 = pure opening, 64 = middlegame, 0 = pure endgame */
  phaseScore?: number
  /** Normalized opening likelihood 0–1 */
  openingScore?: number
  /** Normalized middlegame likelihood 0–1 */
  middlegameScore?: number
  /** Normalized endgame likelihood 0–1 */
  endgameScore?: number
  /** ECO opening code if this position is still in the book (e.g. "B20"), null otherwise */
  ecoCode?: string
  /** True if the move that led to this position is still within the opening book */
  isBookMove?: boolean

  // ── Positional features (per-position, from PositionalFeaturesService) ──
  positionalFeatures?: PositionalFeatures

  // ── Maia best-move evals (for human eval curves) ──
  /** Stockfish eval (cp, White-perspective) of the floor Maia model's top predicted move */
  maiaFloorBestEval?: number | null
  /** Stockfish eval (cp, White-perspective) of the ceiling Maia model's top predicted move */
  maiaCeilingBestEval?: number | null

  engineResult?: {
    evalCp: number | null
    evalMate: number | null
    /** White-normalized WDL from Stockfish (win = P(White wins), loss = P(White loses)). */
    wdl: WDL | null
    bestMove: string
    depth: number
    lines: AnalysisLine[]
  }
  criticalityScore?: number
  nag?: NAG
  isBestMove?: boolean
  /** Maia predictions at the floor rating (highest Maia level ≤ userRating). */
  maiaFloorResult?: MaiaAnalysisResult
  /** Maia predictions at the ceiling rating (lowest Maia level > userRating). */
  maiaCeilingResult?: MaiaAnalysisResult
  /** Augmented Maia floor predictions with Stockfish evals per move. */
  augmentedMaiaFloor?: AugmentedMaiaResult
  /** Augmented Maia ceiling predictions with Stockfish evals per move. */
  augmentedMaiaCeiling?: AugmentedMaiaResult
  /** Probability distribution of move quality at floor rating. */
  floorMistakeProb?: MistakeProbability
  /** Probability distribution of move quality at ceiling rating. */
  ceilingMistakeProb?: MistakeProbability
  /** Child nodes (variations). First child is the main line continuation. */
  children: AnalysisNode[]
}

// ==================== Game Analysis Record ====================

/**
 * The full analysis state for a single game. Stored as a JSON blob in the
 * `game_analysis_queue` table under the `state` column.
 */
export interface GameAnalysisData {
  gameId: string
  pgnHash: string
  schemaVersion: number
  gameFsmState: GameFSMState
  evalCurve: number[]
  /** Stockfish eval of the floor Maia model's top move at each mainline position. */
  maiaFloorEvalCurve: number[]
  /** Stockfish eval of the ceiling Maia model's top move at each mainline position. */
  maiaCeilingEvalCurve: number[]
  /** Root node of the analysis tree. Null if analysis has not started. */
  tree: AnalysisNode | null
  /** Next available ID for new nodes (e.g. user-played variations). */
  nextId: number
  /** The analysis preset used when this record was first created. */
  preset: AnalysisPreset
}
