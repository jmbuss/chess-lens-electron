import { computed, type ComputedRef } from 'vue'
import type { AnalysisNode, PositionalRadarData } from 'src/database/analysis/types'
import { computePositionalRadarData } from 'src/services/analysis/featureAttribution'

export interface GameSummaryRadarData {
  white: number[]
  black: number[]
  labels: string[]
  whiteMaterial: number
  blackMaterial: number
  hasData: boolean
}

const RADAR_LABELS = [
  'Pawn Structure',
  'Space',
  'Mobility',
  'King Safety',
  'Threats',
  'Imbalance',
] as const

const AXIS_KEYS = [
  'pawnStructure',
  'space',
  'mobility',
  'kingSafety',
  'threats',
  'imbalance',
] as const

function radarDataToSummary(data: PositionalRadarData): GameSummaryRadarData {
  return {
    white: AXIS_KEYS.map(key => data.axes[key].white),
    black: AXIS_KEYS.map(key => data.axes[key].black),
    labels: [...RADAR_LABELS],
    whiteMaterial: data.whiteMaterial,
    blackMaterial: data.blackMaterial,
    hasData: data.hasData,
  }
}

export function useGameSummaryRadar(
  analysisTree: ComputedRef<AnalysisNode | null>,
): ComputedRef<GameSummaryRadarData> {
  return computed(() => {
    if (!analysisTree.value) {
      return radarDataToSummary({
        axes: {
          pawnStructure: { white: 0, black: 0 },
          space: { white: 0, black: 0 },
          mobility: { white: 0, black: 0 },
          kingSafety: { white: 0, black: 0 },
          threats: { white: 0, black: 0 },
          imbalance: { white: 0, black: 0 },
        },
        whiteMaterial: 0,
        blackMaterial: 0,
        hasData: false,
      })
    }
    return radarDataToSummary(computePositionalRadarData(analysisTree.value))
  })
}
