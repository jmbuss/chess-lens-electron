export interface PositionIndexRow {
  id: number
  game_id: string
  ply: number
  fen: string
  san: string | null
  uci_move: string | null
  color: string
  move_number: number | null
  nag: string | null
  eval_cp: number | null
  eval_mate: number | null
  wdl_win: number | null
  wdl_draw: number | null
  wdl_loss: number | null
  criticality_score: number | null
  phase_score: number | null
  is_best_move: number | null
  move_accuracy: number | null
  index_reason: string
  opening_eco: string | null
  opening_name: string | null
  created_at: string
}

export type IndexReason = 'blunder' | 'critical' | 'difficult' | 'suboptimal_plan'

export interface PositionIndexInsertRow {
  game_id: string
  ply: number
  fen: string
  san: string | null
  uci_move: string | null
  color: string
  move_number: number | null
  nag: string | null
  eval_cp: number | null
  eval_mate: number | null
  wdl_win: number | null
  wdl_draw: number | null
  wdl_loss: number | null
  criticality_score: number | null
  phase_score: number | null
  is_best_move: number | null
  move_accuracy: number | null
  index_reason: IndexReason
  opening_eco: string | null
  opening_name: string | null
}

export interface VectorInsertRow {
  positionIndexId: number
  vector: Float32Array
}

export interface KnnResult {
  position_index_id: number
  distance: number
}
