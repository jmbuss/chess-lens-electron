<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'

import Chessboard from 'src/renderer/analysis/components/Chessboard.vue'
import AnalysisDashboard from '../components/AnalysisDashboard.vue'
import ChessPlayerBar from '../components/ChessPlayerBar.vue'
import ChessPGNViewer from '../components/ChessPGNViewer.vue'
import ChessAnalysisViewer from '../components/ChessAnalysisViewer.vue'
import ChessMatchTopBar from '../components/ChessMatchTopBar.vue'
import ChessGameConsole from '../components/ChessGameConsole.vue'
import ChessMetricBars from '../components/ChessMetricBars.vue'
import { useGameAnalysis } from '../composables/useGameAnalysis'
import { provideChessGame } from '../composables/provideChessGame'
import { provideGameAnalysis } from '../composables/provideGameAnalysis'
import { ipcService } from 'src/ipc/renderer'
import { serializePgn } from 'src/utils/chess/GameTree'
import type { GameNode } from '../composables/types'

const route = useRoute()

const gameId = computed(() => route.params.gameId as string)

const {
  gameFsmState,
  isComplete,
  progress,
  analysisByFen,
  navigateToPosition,
  reanalyzeGame,
  whiteStats,
  blackStats,
  radarData,
} = useGameAnalysis(gameId)

provideGameAnalysis(analysisByFen, progress, isComplete, gameFsmState, whiteStats, blackStats, radarData, reanalyzeGame)

const { gameNavigator, gameTree } = provideChessGame({
  gameId,
  onVariationPlayed: (parentFen, newNode) => {
    if (analysisByFen.value.has(newNode.data.fen)) return
    const d = newNode.data

    const root = gameTree.root.value
    const headers = gameTree.headers.value
    const pgn = root ? serializePgn(root as GameNode, headers) : ''

    ipcService.send('pgn:mutate', {
      gameId: gameId.value,
      pgn,
      currentFen: d.fen,
    })
  },
})

function isTypingElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea') return true
  if (target.isContentEditable) return true
  return false
}

function handleKeydown(e: KeyboardEvent): void {
  if (isTypingElement(e.target as EventTarget | null)) return
  if (e.key === 'ArrowLeft') {
    if (gameNavigator.canGoBack.value) {
      e.preventDefault()
      gameNavigator.goBack()
    }
  } else if (e.key === 'ArrowRight') {
    if (gameNavigator.canGoForward.value) {
      e.preventDefault()
      gameNavigator.goForward()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

watch(progress, (val) => {
  console.log(`[AnalysisPage] Analysis progress: ${Math.round(val * 100)}%`)
})

watch(isComplete, (val) => {
  if (val) console.log('[AnalysisPage] Analysis complete! gameFsmState:', gameFsmState.value)
})

watch(() => gameNavigator.currentFen.value, (fen) => {
  if (!fen) return
  navigateToPosition(fen)
})
</script>

<template>
  <div class="flex flex-col flex-1 w-full h-full">
    <AnalysisDashboard class="flex-1 min-h-0 overflow-hidden">
      <template #topBar>
        <ChessMatchTopBar />
      </template>

      <template #left>
        <ChessPGNViewer class="h-full min-h-0" />
      </template>

      <template #centerTop>
        <div class="center-top-layout">
          <ChessMetricBars class="center-metric-bars" />
          <div class="center-board-stack">
            <ChessPlayerBar class="board-stack-top-player" position="top" />
            <Chessboard class="board-stack-board" />
            <ChessPlayerBar class="board-stack-bottom-player" position="bottom" />
          </div>
        </div>
      </template>

      <template #centerBottom>
        <ChessGameConsole class="h-full" />
      </template>

      <template #right>
        <ChessAnalysisViewer class="h-full" />
      </template>
    </AnalysisDashboard>
  </div>
</template>

<style scoped>
.center-top-layout {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  column-gap: calc(var(--spacing) * 2);
  min-height: 0;
  height: 100%;
}

.center-metric-bars {
  min-height: 0;
  overflow: hidden;
  width: max-content;
}

.center-board-stack {
  display: grid;
  min-height: 0;
  overflow: hidden;
  grid-template-rows:
    max-content
    minmax(0, 1fr)
    max-content;
  grid-template-areas:
    'top-player'
    'board'
    'bottom-player';
}

.board-stack-top-player {
  grid-area: top-player;
}
.board-stack-board {
  grid-area: board;
  min-height: 0;
  overflow: hidden;
}
.board-stack-bottom-player {
  grid-area: bottom-player;
}
</style>
