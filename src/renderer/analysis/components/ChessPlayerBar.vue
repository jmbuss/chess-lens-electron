<script setup lang="ts">
import { computed, toValue } from 'vue'
import { isChildNode } from 'chessops/pgn'

import ChessPlayerIcon from 'src/renderer/components/Chess/ChessPlayerIcon.vue'
import { useInjectedGameNavigator } from '../composables/provideChessGame'

const props = defineProps<{
  position: 'top' | 'bottom'
}>()

const { chessGame, orientation, currentNode } = useInjectedGameNavigator()

const player = computed(() => {
  const game = toValue(chessGame)
  if (!game) return undefined
  if (props.position === 'bottom') {
    return game[orientation.value]
  }
  return orientation.value === 'white' ? game.black : game.white
})

const playerColor = computed<'w' | 'b'>(() => {
  if (props.position === 'bottom') return orientation.value === 'white' ? 'w' : 'b'
  return orientation.value === 'white' ? 'b' : 'w'
})

const clockSeconds = computed<number | undefined>(() => {
  const node = currentNode.value
  if (!node || !isChildNode(node)) return undefined

  if (node.data.color === playerColor.value) return node.data.clock

  const parent = node.data.parent
  if (parent && isChildNode(parent) && parent.data.color === playerColor.value) {
    return parent.data.clock
  }

  return undefined
})

const defaultClockSeconds = computed<number | undefined>(() => {
  const base = chessGame.value?.timeControl?.base
  return base !== undefined && base > 0 ? base : undefined
})

function formatSeconds(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

const formattedClock = computed<string | undefined>(() => {
  const secs = clockSeconds.value ?? defaultClockSeconds.value
  if (secs === undefined) return undefined
  return formatSeconds(secs)
})
</script>

<template>
  <div class="flex gap-2 px-2 py-1 items-center">
    <ChessPlayerIcon :color="player?.color" />
    <p class="font-bold">{{ player?.username }}</p>
    <p class="text-sm opacity-60">({{ player?.rating }})</p>
    <span v-if="formattedClock" class="ml-auto font-mono text-sm tabular-nums">
      {{ formattedClock }}
    </span>
  </div>
</template>
