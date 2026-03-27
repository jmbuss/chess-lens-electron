<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'

import { Button as UIButton } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-vue-next'

import Chessboard from 'src/renderer/analysis/components/Chessboard.vue'
import AnalysisDashboard from '../components/AnalysisDashboard.vue'
import ChessPlayerBar from '../components/ChessPlayerBar.vue'
import ChessMatchInfo from '../components/ChessMatchInfo.vue'
import ChessPGNViewer from '../components/ChessPGNViewer.vue'
import ChessAnalysisViewer from '../components/ChessAnalysisViewer.vue'
import ChessMatchTopBar from '../components/ChessMatchTopBar.vue'
import ChessMatchBottomBar from '../components/ChessMatchBottomBar.vue'
import ChessGameConsole from '../components/ChessGameConsole.vue'
import ChessMetricBars from '../components/ChessMetricBars.vue'
import { useGameAnalysis } from '../composables/useGameAnalysis'
import { provideChessGame } from '../composables/provideChessGame'
import { provideGameAnalysis } from '../composables/provideGameAnalysis'

const route = useRoute()

const gameId = computed(() => route.params.gameId as string)

const {
  gameFsmState,
  isComplete,
  progress,
  addVariation,
  analysisByFen,
  analysisTree,
  navigateToPosition,
} = useGameAnalysis(gameId)

provideGameAnalysis(analysisByFen, analysisTree, progress, isComplete, gameFsmState)

const { gameNavigator } = provideChessGame({
  gameId,
  onVariationPlayed: (parentFen, newNode) => {
    if (analysisByFen.value.has(newNode.data.fen)) return
    const d = newNode.data
    addVariation({
      parentFen,
      fen: d.fen,
      uciMove: d.from + d.to + (d.promotion ?? ''),
      san: d.san,
      from: d.from,
      to: d.to,
      piece: d.piece,
      color: d.color,
      captured: d.captured,
      promotion: d.promotion,
      moveNumber: d.moveNumber,
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

// Whenever the user navigates to a position, tell the game machine so it can
// prioritize that node. The machine handles the STOP_AND_WAIT → IDLE →
// POSITION_ANALYSIS cycle automatically. Fires regardless of isComplete so
// the user can always focus any node for deeper analysis.
watch(() => gameNavigator.currentFen.value, (fen) => {
  if (!fen) return
  const node = analysisByFen.value.get(fen)
  if (node) navigateToPosition(node.id)
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
