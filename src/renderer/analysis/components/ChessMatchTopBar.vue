<script setup lang="ts">
import { Badge as UIChip } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, RefreshCw, DatabaseZap } from 'lucide-vue-next'
import { useInjectedChessGame } from '../composables/provideChessGame'
import { useInjectedGameAnalysis } from '../composables/provideGameAnalysis'
import { formatDateTime, ISO_DATE } from 'src/renderer/utils/formatDateTime';
import { formatTimeControl } from 'src/renderer/utils/formatTimeControl'
import { computed, ref } from 'vue';
import ChessTerminationBadge from 'src/renderer/components/Chess/ChessTerminationBadge.vue'
import UIIcon from 'src/renderer/components/UIIcon.vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const { chessGame } = useInjectedChessGame()
const { progress, isComplete, gameFsmState, reanalyzeGame, reindexGame } = useInjectedGameAnalysis()

const isReanalyzing = ref(false)
const isReindexing = ref(false)

const handleReanalyze = async () => {
  if (isReanalyzing.value) return
  isReanalyzing.value = true
  try {
    await reanalyzeGame()
  } finally {
    isReanalyzing.value = false
  }
}

const handleReindex = async () => {
  if (isReindexing.value) return
  isReindexing.value = true
  try {
    await reindexGame()
  } finally {
    isReindexing.value = false
  }
}

const timeControlLabel = computed(() => {
  const tc = chessGame.value?.timeControl
  if (!tc) return null
  return formatTimeControl(tc)
})

const openingLabel = computed(() => {
  const opening = chessGame.value?.opening
  if (!opening) return null
  return `${opening.name} · ${opening.eco}`
})

const progressPercent = computed(() => Math.round(progress.value * 100))

const badgeLabel = computed(() => {
  if (isComplete.value) return 'Analysis complete'
  if (gameFsmState.value === 'ANALYZING') return `Analyzing… ${progressPercent.value}%`
  return 'Starting analysis…'
})

const showProgress = computed(() =>
  gameFsmState.value !== null && gameFsmState.value !== 'UNANALYZED'
)
</script>

<template>
  <div class="flex gap-2 flex-wrap items-center pt-3 px-3">

    <!-- back button -->
    <Button variant="ghost" size="sm" class="-ml-2 gap-1" @click="router.back()">
      <ChevronLeft class="size-4" />
      Back
    </Button>

    <!-- <span class="text-xs text-secondary">
      <span class="font-bold text-primary">{{ chessGame?.white.username }}</span> ({{ chessGame?.white.rating }}) vs <span class="font-bold text-primary">{{ chessGame?.black.username }}</span> ({{ chessGame?.black.rating }})
    </span> -->

    <ChessTerminationBadge />

    <UIChip v-if="openingLabel" variant="secondary">
      {{ openingLabel }}
    </UIChip>

    <UIChip v-if="chessGame?.moveCount" variant="secondary">
      {{ chessGame.moveCount }} Moves
    </UIChip>

    <UIChip v-if="timeControlLabel" variant="secondary">
      {{ timeControlLabel }}
    </UIChip>

    <span v-if="chessGame?.startTime" class="text-xs text-secondary">
      {{ formatDateTime(chessGame?.startTime, ISO_DATE) }}
    </span>

    <!-- Analysis status -->
    <template v-if="showProgress">
      <div class="ml-auto flex flex-row gap-2 items-center shrink-0">
        <Button
          v-if="isComplete"
          variant="ghost"
          size="sm"
          class="gap-1.5 text-muted-foreground hover:text-foreground"
          :disabled="isReindexing"
          @click="handleReindex"
        >
          <DatabaseZap class="size-3.5" :class="{ 'animate-pulse': isReindexing }" />
          Re-index
        </Button>
        <Button
          v-if="isComplete"
          variant="ghost"
          size="sm"
          class="gap-1.5 text-muted-foreground hover:text-foreground"
          :disabled="isReanalyzing"
          @click="handleReanalyze"
        >
          <RefreshCw class="size-3.5" :class="{ 'animate-spin': isReanalyzing }" />
          Re-analyze
        </Button>
        <UIChip :variant="isComplete ? 'default' : 'secondary'">
          <UIIcon v-if="isComplete" name="solid-circle" size="3" />
          <span
            v-else
            class="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin"
          />
          {{ badgeLabel }}
        </UIChip>
      </div>
    </template>

  </div>
</template>