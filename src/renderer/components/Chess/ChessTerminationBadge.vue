<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { usePlatforms } from 'src/renderer/composables/platforms/usePlatforms'
import { useInjectedChessGame } from 'src/renderer/analysis/composables/provideChessGame'
import { getTerminationLabel, getTerminationBadgeVariant } from './ChessResult.vue'

const { chessGame } = useInjectedChessGame()
const { getPlatformNameForGame } = usePlatforms()

const userResult = computed(() => {
  const game = chessGame.value
  if (!game) return undefined
  const username = getPlatformNameForGame(game)?.toLowerCase()
  if (!username) return undefined
  if (game.white.username.toLowerCase() === username) return game.white.result
  if (game.black.username.toLowerCase() === username) return game.black.result
  return undefined
})

const label = computed(() => getTerminationLabel(chessGame.value?.termination, userResult.value))
const variant = computed(() => getTerminationBadgeVariant(userResult.value))
</script>

<template>
  <Badge v-if="label" :variant="variant">
    {{ label }}
  </Badge>
</template>
