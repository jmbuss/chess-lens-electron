/**
 * @deprecated Radar data is now pre-computed on the backend and returned
 * in GameAnalysisResponse.radarData. Use useInjectedGameAnalysis()
 * to access it. This file is kept only for import compatibility during
 * the migration.
 */
export interface GameSummaryRadarData {
  white: number[]
  black: number[]
  labels: string[]
  whiteMaterial: number
  blackMaterial: number
  hasData: boolean
}
