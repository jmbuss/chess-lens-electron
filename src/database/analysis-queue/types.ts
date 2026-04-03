export type AnalysisQueueStatus = 'pending' | 'in_progress' | 'complete' | 'failed'

export interface GameAnalysisQueueRow {
  game_id: string
  priority: number
  status: AnalysisQueueStatus
  queued_at: number
  started_at: number | null
  completed_at: number | null
  accuracy_white: number | null
  accuracy_black: number | null
  white_stats_json: string | null
  black_stats_json: string | null
  eval_curve_json: string | null
}

export interface GameAnalysisQueueAggregates {
  accuracy_white: number
  accuracy_black: number
  white_stats_json: string
  black_stats_json: string
  eval_curve_json: string
}

export interface PositionAnalysisRow {
  id: number
  fen: string
  config_hash: string
  priority: number
  status: AnalysisQueueStatus
  queued_at: number
  result_json: string | null
  depth: number | null
  analyzed_at: number | null
}

export interface PositionAnalysisUpsertRow {
  fen: string
  config_hash: string
  priority: number
}
