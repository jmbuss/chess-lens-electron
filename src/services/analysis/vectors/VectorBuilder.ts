import type { PositionOutput } from '../machines/positionMachine'
import type { EvalRawFeatures } from 'src/database/analysis/types'
import { POSITIONAL_VECTOR_DIM } from 'src/database/vectors'

// ==================== Normalization Maps ====================

const PER_COLOR_NORMALIZATION: Record<string, { max: number; shift?: number }> = {
  pawn_count:              { max: 8 },
  knight_count:            { max: 2 },
  bishop_count:            { max: 2 },
  rook_count:              { max: 2 },
  queen_count:             { max: 1 },
  passed_pawns:            { max: 8 },
  isolated_pawns:          { max: 8 },
  doubled_pawns:           { max: 7 },
  backward_pawns:          { max: 8 },
  connected_pawns:         { max: 8 },
  supported_pawns:         { max: 8 },
  phalanx_pawns:           { max: 8 },
  blocked_pawns:           { max: 8 },
  knight_mobility:         { max: 16 },
  bishop_mobility:         { max: 26 },
  rook_mobility:           { max: 28 },
  queen_mobility:          { max: 27 },
  knight_outpost:          { max: 2 },
  bishop_pair:             { max: 1 },
  bishop_pawns_same_color: { max: 16 },
  bishop_long_diagonal:    { max: 2 },
  rook_on_open_file:       { max: 2 },
  rook_on_semiopen_file:   { max: 2 },
  rook_on_king_ring:       { max: 2 },
  king_attackers_count:    { max: 7 },
  king_attacks_count:      { max: 20 },
  king_flank_attack:       { max: 30 },
  king_flank_defense:      { max: 30 },
  king_pawnless_flank:     { max: 1 },
  weak_pieces:             { max: 10 },
  hanging_pieces:          { max: 6 },
  restricted_pieces:       { max: 12 },
  space_count:             { max: 24 },
  passed_pawn_best_rank:   { max: 7 },
  free_passed_pawns:       { max: 8 },
}

const GLOBAL_NORMALIZATION: Record<string, { max: number; shift?: number }> = {
  phase:                { max: 128 },
  opposite_bishops:     { max: 1 },
  pawns_on_both_flanks: { max: 1 },
  scale_factor:         { max: 128 },
  side_to_move:         { max: 1 },
}

/**
 * Per-color features included in the similarity vector, in insertion order.
 * Each produces 2 dims (_w and _b).
 */
const VECTOR_PER_COLOR_FEATURES = Object.keys(PER_COLOR_NORMALIZATION)

/** Global features included in the similarity vector. */
const VECTOR_GLOBAL_FEATURES = Object.keys(GLOBAL_NORMALIZATION)

function normalize(raw: number, norm: { max: number; shift?: number }): number {
  const shifted = raw + (norm.shift ?? 0)
  return Math.max(0, Math.min(1, shifted / norm.max))
}

/**
 * Build a 75-dim positional vector from evalraw features.
 * Returns null if evalRawFeatures is missing or empty.
 *
 * Dimensions:
 *   [0..69]  35 curated per-color features × 2 sides (_w, _b)
 *   [70..74] 5 global features
 *
 * All values normalized to [0, 1] using shift/max maps.
 */
export function buildPositionalVector(result: PositionOutput): Float32Array | null {
  const raw = result.evalRawFeatures
  if (!raw || Object.keys(raw).length === 0) return null

  const vec = new Float32Array(POSITIONAL_VECTOR_DIM)
  let idx = 0

  for (const feat of VECTOR_PER_COLOR_FEATURES) {
    const norm = PER_COLOR_NORMALIZATION[feat]
    vec[idx++] = normalize(raw[`${feat}_w`] ?? 0, norm)
    vec[idx++] = normalize(raw[`${feat}_b`] ?? 0, norm)
  }

  for (const feat of VECTOR_GLOBAL_FEATURES) {
    const norm = GLOBAL_NORMALIZATION[feat]
    vec[idx++] = normalize(raw[feat] ?? 0, norm)
  }

  return vec
}
