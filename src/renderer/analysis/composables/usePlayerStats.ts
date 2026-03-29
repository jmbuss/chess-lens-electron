import { computed, type ComputedRef } from 'vue'
import type { AnalysisNode } from 'src/database/analysis/types'
import { computePlayerStats, type PlayerStats } from 'src/services/analysis/machines/gameMachine'

export type { PlayerStats }

const emptyStats = (): PlayerStats => ({
  accuracy: null,
  nagCounts: {},
  bookMoveCount: 0,
  totalMoves: 0,
  bestMoveCount: 0,
})

export function usePlayerStats(tree: ComputedRef<AnalysisNode | null>) {
  const whiteStats = computed<PlayerStats>(() => tree.value ? computePlayerStats(tree.value, 'w') : emptyStats())
  const blackStats = computed<PlayerStats>(() => tree.value ? computePlayerStats(tree.value, 'b') : emptyStats())
  return { whiteStats, blackStats }
}
