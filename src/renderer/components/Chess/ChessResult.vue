<script lang="ts">
import { GameResult, GameTermination } from 'src/database/chess/types'
import type { BadgeVariants } from '@/components/ui/badge'

const LOSS_RESULTS = new Set([
  GameResult.LOSS,
  GameResult.CHECKMATE,
  GameResult.RESIGNED,
  GameResult.TIMEOUT,
  GameResult.ABANDONED,
  GameResult.ABORTED,
])

const DRAW_RESULTS = new Set([
  GameResult.DRAW,
  GameResult.AGREED,
  GameResult.STALEMATE,
  GameResult.REPETITION,
  GameResult.INSUFFICIENT,
  GameResult.FIFTY_MOVE,
])

export function getTerminationLabel(
  termination: GameTermination | undefined,
  userResult: GameResult | undefined,
): string | null {
  if (!termination) return null

  const isWin = userResult === GameResult.WIN

  switch (termination) {
    case GameTermination.CHECKMATE:
      return isWin ? 'Won by Checkmate' : 'Checkmated'
    case GameTermination.RESIGNATION:
      return isWin ? 'Won by Resignation' : 'Resigned'
    case GameTermination.TIMEOUT:
      return isWin ? 'Won on Time' : 'Timeout'
    case GameTermination.DRAW: {
      if (userResult === GameResult.STALEMATE) return 'Stalemate'
      if (userResult === GameResult.REPETITION) return 'Repetition'
      if (userResult === GameResult.INSUFFICIENT) return 'Insufficient Material'
      if (userResult === GameResult.FIFTY_MOVE) return '50-Move Rule'
      return 'Draw'
    }
    case GameTermination.ABANDONED:
      return isWin ? 'Won · Abandoned' : 'Abandoned'
    case GameTermination.ABORTED:
      return 'Aborted'
    default:
      return null
  }
}

export function getTerminationBadgeVariant(
  userResult: GameResult | undefined,
): BadgeVariants['variant'] {
  if (userResult === GameResult.WIN) return 'default'
  if (userResult && LOSS_RESULTS.has(userResult)) return 'destructive'
  if (userResult && DRAW_RESULTS.has(userResult)) return 'secondary'
  return 'secondary'
}
</script>

<script setup lang="ts">
import { ChessGame } from 'src/database/chess/types'

/**
 * TODOJB: the game can be drawn by stalemate which currently shows that it's a loss for both players.
 */

defineProps<{
  result?: ChessGame['white']['result'] | ChessGame['black']['result']
}>()

const formatResult = (result: ChessGame['white']['result'] | ChessGame['black']['result']) => {
  switch (result) {
    case GameResult.WIN:
      return '1'
    case GameResult.LOSS:
    case GameResult.CHECKMATE:
    case GameResult.TIMEOUT:
    case GameResult.RESIGNED:
    case GameResult.ABANDONED:
    case GameResult.ABORTED:
      return '0'
    case GameResult.INSUFFICIENT:
    case GameResult.FIFTY_MOVE:
    case GameResult.DRAW:
    case GameResult.REPETITION:
    case GameResult.AGREED:
    case GameResult.STALEMATE:
      return '½'
    default:
      return '-'
  }
}

const formatResultStyle = (result: ChessGame['white']['result'] | ChessGame['black']['result']) => {
  switch (result) {
    case GameResult.WIN:
      return 'font-bold'
    case GameResult.LOSS:
    case GameResult.CHECKMATE:
    case GameResult.TIMEOUT:
    case GameResult.RESIGNED:
    case GameResult.STALEMATE:
    case GameResult.ABANDONED:
    case GameResult.ABORTED:
      return 'text-muted'
    case GameResult.INSUFFICIENT:
    case GameResult.FIFTY_MOVE:
    case GameResult.DRAW:
    case GameResult.REPETITION:
    case GameResult.AGREED:
      return 'text-muted'
    default:
      return 'text-muted'
  }
}
</script>

<template>
  <div>
    <span :class="formatResultStyle(result)">{{ formatResult(result) }}</span>
  </div>
</template>
