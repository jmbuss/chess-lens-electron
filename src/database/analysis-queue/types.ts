export type AnalysisQueueStatus = 'pending' | 'in_progress' | 'complete' | 'failed'

/** Date fields are ISO8601 strings (TEXT in SQLite), same as chess_games / sync tables. */
export interface GameAnalysisQueueRow {
  game_id: string
  priority: number
  status: AnalysisQueueStatus
  queued_at: string
  started_at: string | null
  completed_at: string | null
  accuracy_white: number | null
  accuracy_black: number | null
  white_stats_json: string | null
  black_stats_json: string | null
  eval_curve_json: string | null
  node_results_json: string | null
  radar_data_json: string | null
  maia_floor_curve_json: string | null
  maia_ceiling_curve_json: string | null
}

export interface GameAnalysisQueueAggregates {
  accuracy_white: number
  accuracy_black: number
  white_stats_json: string
  black_stats_json: string
  eval_curve_json: string
  node_results_json: string
  radar_data_json: string
  maia_floor_curve_json: string
  maia_ceiling_curve_json: string
}

export interface PositionAnalysisRow {
  id: number
  fen: string
  config_hash: string
  priority: number
  status: AnalysisQueueStatus
  retry_count: number
  queued_at: string
  result_json: string | null
  depth: number | null
  analyzed_at: string | null
}

export interface PositionAnalysisUpsertRow {
  fen: string
  config_hash: string
  priority: number
  /** If omitted, `bulkUpsert` uses the current time for that row. */
  queued_at?: string
}
