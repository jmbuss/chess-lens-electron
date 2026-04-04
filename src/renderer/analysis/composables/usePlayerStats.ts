/**
 * @deprecated Player stats are now pre-computed on the backend and returned
 * in GameAnalysisResponse.whiteStats / blackStats. Use useInjectedGameAnalysis()
 * to access them. This file is kept only for import compatibility during
 * the migration — it re-exports the shared PlayerStats type.
 */
export type { PlayerStats } from 'src/database/analysis/types'
