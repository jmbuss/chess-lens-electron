import { inject, provide, type ComputedRef } from 'vue'
import type { AnalysisNode, GameFSMState } from 'src/database/analysis/types'

const gameAnalysisSymbol = Symbol('gameAnalysis')

interface GameAnalysisContext {
  analysisByFen: ComputedRef<Map<string, AnalysisNode>>
  analysisTree: ComputedRef<AnalysisNode | null>
  progress: ComputedRef<number>
  isComplete: ComputedRef<boolean>
  gameFsmState: ComputedRef<GameFSMState | null>
}

export const provideGameAnalysis = (
  analysisByFen: ComputedRef<Map<string, AnalysisNode>>,
  analysisTree: ComputedRef<AnalysisNode | null>,
  progress: ComputedRef<number>,
  isComplete: ComputedRef<boolean>,
  gameFsmState: ComputedRef<GameFSMState | null>,
) => {
  provide(gameAnalysisSymbol, { analysisByFen, analysisTree, progress, isComplete, gameFsmState } satisfies GameAnalysisContext)
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
