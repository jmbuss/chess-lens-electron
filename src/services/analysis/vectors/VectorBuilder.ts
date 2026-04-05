import type { PositionOutput } from '../machines/positionMachine'
import type { PositionalFeatures, EvalTerm } from 'src/database/analysis/types'
import { POSITIONAL_VECTOR_DIM, STRUCTURAL_VECTOR_DIM } from 'src/database/vectors'

const EVAL_TERMS = [
  'material', 'imbalance', 'pawns', 'knights', 'bishops', 'rooks', 'queens',
  'mobility', 'kingSafety', 'threats', 'passed', 'space', 'winnable',
] as const

const EVAL_CLAMP = 10
const WDL_SCALE = 1000

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Build a 33-dim positional vector from engine analysis data.
 * Returns null if positional features or engine result is missing.
 *
 * Dimensions:
 *   [0..25]  13 eval terms x (total.mg, total.eg)  -- normalized to [-1, 1]
 *   [26]     finalEvaluation                        -- normalized to [-1, 1]
 *   [27]     evalCp                                 -- normalized to [-1, 1]
 *   [28..30] WDL (win, draw, loss)                  -- normalized to [0, 1]
 *   [31]     phaseScore                             -- normalized to [0, 1]
 *   [32]     criticalityScore                       -- already [0, 1]
 */
export function buildPositionalVector(result: PositionOutput): Float32Array | null {
  if (!result.positionalFeatures || !result.engineResult) return null

  const vec = new Float32Array(POSITIONAL_VECTOR_DIM)
  const pf = result.positionalFeatures
  let idx = 0

  for (const termName of EVAL_TERMS) {
    const term = pf[termName] as EvalTerm
    const mg = term?.total?.mg ?? 0
    const eg = term?.total?.eg ?? 0
    vec[idx++] = clamp(mg / EVAL_CLAMP, -1, 1)
    vec[idx++] = clamp(eg / EVAL_CLAMP, -1, 1)
  }

  vec[idx++] = clamp(pf.finalEvaluation / EVAL_CLAMP, -1, 1)

  const evalCp = result.engineResult.evalCp ?? 0
  vec[idx++] = clamp(evalCp / 1000, -1, 1)

  const wdl = result.engineResult.wdl
  vec[idx++] = wdl ? wdl.win / WDL_SCALE : 0.5
  vec[idx++] = wdl ? wdl.draw / WDL_SCALE : 0
  vec[idx++] = wdl ? wdl.loss / WDL_SCALE : 0.5

  const phase = result.phaseResult
  vec[idx++] = phase ? clamp(phase.phaseScore / 128, 0, 1) : 0.5

  // criticalityScore isn't on PositionOutput directly -- it's game-context.
  // Defaults to 0 here; the caller can override if available.
  vec[idx++] = 0

  return vec
}

// Piece-type plane ordering for the 768-dim bitboard vector
const PIECE_PLANE_MAP: Record<string, number> = {
  'P': 0, 'N': 1, 'B': 2, 'R': 3, 'Q': 4, 'K': 5,
  'p': 6, 'n': 7, 'b': 8, 'r': 9, 'q': 10, 'k': 11,
}

/**
 * Build a 768-dim structural vector from a FEN string.
 * 12 planes of 64 squares each (wP, wN, wB, wR, wQ, wK, bP, bN, bB, bR, bQ, bK).
 * Square ordering: a1=0, b1=1, ..., h1=7, a2=8, ..., h8=63.
 *
 * Always succeeds for any valid FEN -- pure string parsing, no chess library.
 */
export function buildStructuralVector(fen: string): Float32Array {
  const vec = new Float32Array(STRUCTURAL_VECTOR_DIM)
  const piecePlacement = fen.split(' ')[0]
  const ranks = piecePlacement.split('/')

  // FEN ranks are top-to-bottom (rank 8 first), but our square index is bottom-to-top
  for (let rankIdx = 0; rankIdx < 8; rankIdx++) {
    const rank = ranks[rankIdx]
    const boardRank = 7 - rankIdx
    let file = 0

    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') {
        file += parseInt(ch, 10)
      } else {
        const plane = PIECE_PLANE_MAP[ch]
        if (plane !== undefined) {
          const squareIdx = boardRank * 8 + file
          vec[plane * 64 + squareIdx] = 1.0
        }
        file++
      }
    }
  }

  return vec
}
