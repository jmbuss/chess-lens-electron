import { inject, provide, type ComputedRef } from 'vue'
import type { PositionAnalysis, GameFSMState, PlayerStats, PositionalRadarData } from 'src/database/analysis/types'

const gameAnalysisSymbol = Symbol('gameAnalysis')

interface GameAnalysisContext {
  analysisByFen: ComputedRef<Map<string, PositionAnalysis>>
  progress: ComputedRef<number>
  isComplete: ComputedRef<boolean>
  gameFsmState: ComputedRef<GameFSMState | null>
  whiteStats: ComputedRef<PlayerStats | null>
  blackStats: ComputedRef<PlayerStats | null>
  radarData: ComputedRef<PositionalRadarData | null>
  reanalyzeGame: () => Promise<void>
  reindexGame: () => Promise<void>
}

export const provideGameAnalysis = (
  analysisByFen: ComputedRef<Map<string, PositionAnalysis>>,
  progress: ComputedRef<number>,
  isComplete: ComputedRef<boolean>,
  gameFsmState: ComputedRef<GameFSMState | null>,
  whiteStats: ComputedRef<PlayerStats | null>,
  blackStats: ComputedRef<PlayerStats | null>,
  radarData: ComputedRef<PositionalRadarData | null>,
  reanalyzeGame: () => Promise<void>,
  reindexGame: () => Promise<void>,
) => {
  provide(gameAnalysisSymbol, {
    analysisByFen, progress, isComplete, gameFsmState,
    whiteStats, blackStats, radarData, reanalyzeGame, reindexGame,
  } satisfies GameAnalysisContext)
}

export const useInjectedGameAnalysis = (): GameAnalysisContext => {
  const context = inject<GameAnalysisContext>(gameAnalysisSymbol)
  if (!context) {
    throw new Error(
      'Game analysis context not found. Make sure provideGameAnalysis() is called in a parent component.',
    )
  }
  return context
}
