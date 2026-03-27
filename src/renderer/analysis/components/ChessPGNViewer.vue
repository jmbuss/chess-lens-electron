<script setup lang="ts">
import { ButtonGroup as UIButtonGroup } from '@/components/ui/button-group'
import { Button as UIButton } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ArrowUpDown, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Clipboard, FileText } from 'lucide-vue-next'
import MoveTree from './MoveTree.vue'
import { useInjectedGameNavigator, useInjectedGameTree, useInjectedChessGame } from '../composables/provideChessGame'
import { useInjectedGameAnalysis } from '../composables/provideGameAnalysis'
import { computed } from 'vue'

const {
  root,
  currentNode,
  canGoBack,
  canGoForward,
  goToStart,
  goBack,
  goForward,
  goToEnd,
  goToNode,
  flipBoard,
} = useInjectedGameNavigator()

const { headers, currentFen } = useInjectedGameTree()
const { chessGame } = useInjectedChessGame()

const { analysisByFen } = useInjectedGameAnalysis()

const analysisMap = computed(() => analysisByFen.value)

const playerLine = computed(() => {
  const w = headers.value.white
  const we = headers.value.whiteElo
  const b = headers.value.black
  const be = headers.value.blackElo
  if (!w && !b) return null
  const whiteStr = w ? (we ? `${w} (${we})` : w) : '?'
  const blackStr = b ? (be ? `${b} (${be})` : b) : '?'
  return `${whiteStr} vs ${blackStr}`
})

const metaLine = computed(() => {
  const parts: string[] = []
  if (headers.value.event) parts.push(headers.value.event)
  if (headers.value.date) parts.push(headers.value.date)
  if (headers.value.result) parts.push(headers.value.result)
  return parts.join(' · ') || null
})

const copyFen = () => navigator.clipboard.writeText(currentFen.value)
const copyPgn = () => { if (chessGame.value?.pgn) navigator.clipboard.writeText(chessGame.value.pgn) }
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- PGN header -->
    
    <!-- Move list -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="playerLine || metaLine" class="px-3 py-3 border-b border-border space-y-0.5">
        <p v-if="playerLine" class="text-sm font-semibold truncate">{{ playerLine }}</p>
        <p v-if="metaLine" class="text-xs truncate">{{ metaLine }}</p>
      </div>
      <div v-if="root" class="flex flex-col">
        <MoveTree
          :start-node="root"
          :current-node="currentNode"
          :analysis-by-fen="analysisMap"
          @select-node="goToNode"
        />
      </div>
    </div>

    <!-- Navigation buttons -->
    <div class="flex gap-2 px-3 py-3 mt-auto border-t border-border">
      <UIButtonGroup class="flex-1">
        <!-- <UIButton variant="outline" size="icon" @click="flipBoard">
          <ArrowUpDown class="size-4" />
        </UIButton> -->
        <UIButton variant="outline" size="icon" :disabled="!canGoBack" @click="goToStart">
          <ChevronsLeft class="size-4" />
        </UIButton>
        <UIButton variant="outline" size="icon" :disabled="!canGoBack" @click="goBack">
          <ChevronLeft class="size-4" />
        </UIButton>
        <UIButton variant="outline" size="icon" :disabled="!canGoForward" @click="goForward">
          <ChevronRight class="size-4" />
        </UIButton>
        <UIButton variant="outline" size="icon" :disabled="!canGoForward" @click="goToEnd">
          <ChevronsRight class="size-4" />
        </UIButton>
      </UIButtonGroup>

      <TooltipProvider>
        <UIButtonGroup>
          <Tooltip>
            <TooltipTrigger as-child>
              <UIButton variant="outline" size="icon" @click="copyFen">
                <Clipboard class="size-4" />
              </UIButton>
            </TooltipTrigger>
            <TooltipContent>Copy FEN</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as-child>
              <UIButton variant="outline" size="icon" :disabled="!chessGame?.pgn" @click="copyPgn">
                <FileText class="size-4" />
              </UIButton>
            </TooltipTrigger>
            <TooltipContent>Copy PGN</TooltipContent>
          </Tooltip>
        </UIButtonGroup>
      </TooltipProvider>
    </div>
  </div>
</template>
