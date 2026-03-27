<script setup lang="ts">
import { computed } from 'vue'
import { Badge as UIChip } from '@/components/ui/badge'
import UIIcon from 'src/renderer/components/UIIcon.vue'
import { useInjectedGameNavigator } from '../composables/provideChessGame'
import { useInjectedGameAnalysis } from '../composables/provideGameAnalysis'

const {
  currentFen,
} = useInjectedGameNavigator()

const { progress, isComplete, gameFsmState } = useInjectedGameAnalysis()

const progressPercent = computed(() => Math.round(progress.value * 100))

const badgeLabel = computed(() => {
  if (isComplete.value) return 'Analysis complete'
  if (gameFsmState.value === 'ANALYZING') return `Analyzing… ${progressPercent.value}%`
  return 'Starting analysis…'
})

const badgeVariant = computed((): 'default' | 'secondary' => {
  if (isComplete.value) return 'default'
  return 'secondary'
})

const showProgress = computed(() =>
  gameFsmState.value !== null && gameFsmState.value !== 'UNANALYZED'
)

const engineDotClass = computed(() =>
  isComplete.value ? 'text-red-500' : 'text-green-500'
)
</script>

<template>
  <div class="flex flex-row items-center justify-between gap-4 pt-2">
    <div class="flex flex-row gap-2 items-center min-w-0">
      <span class="text-xs text-secondary shrink-0">FEN:</span>
      <span class="text-xs text-muted truncate">{{ currentFen }}</span>
    </div>

    <div class="flex flex-row gap-2 items-center shrink-0">
      <template v-if="showProgress">
        <UIChip variant="secondary">
          <UIIcon name="solid-circle" size="3" :class="engineDotClass" />
          Stockfish
        </UIChip>
        <UIChip variant="secondary">
          <UIIcon name="solid-circle" size="3" :class="engineDotClass" />
          Maia
        </UIChip>
      </template>

      <UIChip v-if="showProgress" :variant="badgeVariant">
        <UIIcon v-if="isComplete" name="solid-circle" size="3" />
        <span
          v-else
          class="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin"
        />
        {{ badgeLabel }}
      </UIChip>
    </div>
  </div>
</template>
