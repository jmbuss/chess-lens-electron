import { computed, type ComputedRef } from 'vue'
import type { AnalysisNode } from 'src/database/analysis/types'
import { NAG } from 'src/services/engine/types'

export interface PlayerStats {
  accuracy: number | null
  nagCounts: Partial<Record<NAG, number>>
  bookMoveCount: number
  totalMoves: number
  bestMoveCount: number
}

const emptyStats = (): PlayerStats => ({
  accuracy: null,
  nagCounts: {},
  bookMoveCount: 0,
  totalMoves: 0,
  bestMoveCount: 0,
})

function moveAccuracy(winRateLoss: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * winRateLoss) - 3.1669
  return Math.min(100, Math.max(0, raw))
}

export function usePlayerStats(analysisByFen: ComputedRef<Map<string, AnalysisNode>>) {
  const whiteStats = computed<PlayerStats>(() => computeStats(analysisByFen.value, 'w'))
  const blackStats = computed<PlayerStats>(() => computeStats(analysisByFen.value, 'b'))
  return { whiteStats, blackStats }
}

function computeStats(analysisByFen: Map<string, AnalysisNode>, color: 'w' | 'b'): PlayerStats {
  const stats = emptyStats()
  let totalMoveAccuracy = 0
  let analyzedNonBookMoves = 0

  for (const node of analysisByFen.values()) {
    if (node.color !== color) continue
    if (node.fsmState !== 'NAG_COMPLETE') continue

    stats.totalMoves++

    if (node.isBookMove) {
      stats.bookMoveCount++
      continue
    }

    if (node.isBestMove) stats.bestMoveCount++

    const nag = node.nag ?? NAG.Neutral
    stats.nagCounts[nag] = (stats.nagCounts[nag] ?? 0) + 1

    if (node.winRateLoss != null) {
      totalMoveAccuracy += moveAccuracy(node.winRateLoss)
      analyzedNonBookMoves++
    }
  }

  if (analyzedNonBookMoves > 0) {
    stats.accuracy = totalMoveAccuracy / analyzedNonBookMoves
  }

  return stats
}
