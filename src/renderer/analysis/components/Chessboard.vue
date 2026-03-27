<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { Chessground } from 'chessground'
import { Key, Color } from 'chessground/types'
import { useInjectedGameNavigator } from '../composables/provideChessGame'

export interface ChessBoardProps {
  orientation?: Color
  viewOnly?: boolean
  showCoordinates?: boolean
  highlightLastMove?: boolean
  highlightCheck?: boolean
  animation?: {
    enabled?: boolean
    duration?: number
  }
  draggable?: {
    enabled?: boolean
    showGhost?: boolean
  }
}

const props = withDefaults(defineProps<ChessBoardProps>(), {
  orientation: undefined,
  viewOnly: false,
  showCoordinates: true,
  highlightLastMove: true,
  highlightCheck: true,
  animation: () => ({ enabled: true, duration: 200 }),
  draggable: () => ({ enabled: true, showGhost: true }),
})

const emit = defineEmits<{
  move: [{ from: Key; to: Key; promotion?: string }]
  select: [Key]
  error: [string]
}>()

// // Inject chess match from provider
// const { chess, chessGame, turnColor, orientation } = useInjectedChessMatch()

// const boardElement = ref<HTMLElement | null>(null)
// let chessgroundApi: Api | null = null

// // Initialize Chessground
// onMounted(() => {
//   if (!boardElement.value) return

//   const config: Config = {
//     fen: chess.value.fen(),
//     orientation: props.orientation ?? orientation.value,
//     // turnColor: turnColor.value,
//     // check: chess.value.inCheck(),
//     // lastMove: chess.value.history({ verbose: true }).slice(-1)[0],
//     coordinates: props.showCoordinates,
//     viewOnly: props.viewOnly,
//     // movable: {
//     //   free: false,
//     //   color: props.viewOnly ? undefined : turnColor.value,
//     //   dests: props.viewOnly ? undefined : chessMatch.legalMoves.value,
//     //   showDests: true,
//     //   events: {
//     //     after: onMove,
//     //   },
//     // },
//     draggable: {
//       enabled: props.draggable.enabled && !props.viewOnly,
//       showGhost: props.draggable.showGhost,
//     },
//     animation: {
//       enabled: props.animation.enabled,
//       duration: props.animation.duration,
//     },
//     events: {
//       select: (key: Key) => emit('select', key),
//     },
//   }

//   chessgroundApi = Chessground(boardElement.value, config)
// })

// // Watch for orientation changes and update the board
// watch(
//   () => props.orientation ?? orientation.value,
//   (newOrientation) => {
//     if (chessgroundApi) {
//       chessgroundApi.set({ orientation: newOrientation })
//     }
//   }
// )

// // Watch for chess position changes and update the board
// watch(
//   () => chess.value.fen(),
//   (newFen) => {
//     if (chessgroundApi) {
//       chessgroundApi.set({ fen: newFen })
//     }
//   }
// )

const boardHostElement = ref<HTMLElement | null>(null)
const boardElement = ref<HTMLElement | null>(null)
const boardSizePx = ref('0px')

const { attachToDom } = useInjectedGameNavigator()

let resizeObserver: ResizeObserver | null = null

function updateBoardSize(): void {
  if (!boardHostElement.value) return
  const rect = boardHostElement.value.getBoundingClientRect()
  const size = Math.max(0, Math.floor(Math.min(rect.width, rect.height)))
  boardSizePx.value = `${size}px`
}

onMounted(() => {
  updateBoardSize()

  if (boardHostElement.value) {
    resizeObserver = new ResizeObserver(() => {
      updateBoardSize()
    })
    resizeObserver.observe(boardHostElement.value)
  }

  if (!boardElement.value) return

  attachToDom(boardElement.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div ref="boardHostElement" class="chess-board-host">
    <div ref="boardElement" class="chess-board" :style="{ width: boardSizePx, height: boardSizePx }"></div>
  </div>
</template>

<style>
.chess-board-host {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  display: grid;
  place-items: center;
}

.chess-board {
  max-width: 100%;
  max-height: 100%;
}
</style>
