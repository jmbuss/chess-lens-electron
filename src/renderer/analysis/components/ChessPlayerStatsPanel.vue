<script setup lang="ts">
import { NAG } from 'src/services/engine/types'
import { nagSymbol, nagBgClass } from 'src/utils/chess/nag'
import ChessPlayerIcon from 'src/renderer/components/Chess/ChessPlayerIcon.vue'
import type { PlayerStats } from 'src/database/analysis/types'

const props = defineProps<{
  whiteUsername: string | null | undefined
  blackUsername: string | null | undefined
  whiteStats: PlayerStats | null
  blackStats: PlayerStats | null
}>()

const NAG_ORDER: NAG[] = [
  NAG.Brilliant,
  NAG.Great,
  NAG.Best,
  NAG.Excellent,
  NAG.Good,
  NAG.Interesting,
  NAG.Neutral,
  NAG.Inaccuracy,
  NAG.Mistake,
  NAG.Blunder,
  NAG.Miss,
]

const NAG_LABELS: Partial<Record<NAG, string>> = {
  [NAG.Brilliant]:   'Brilliant',
  [NAG.Great]:       'Great',
  [NAG.Best]:        'Best',
  [NAG.Excellent]:   'Excellent',
  [NAG.Good]:        'Good',
  [NAG.Interesting]: 'Interesting',
  [NAG.Neutral]:     'Normal',
  [NAG.Inaccuracy]:  'Inaccuracy',
  [NAG.Mistake]:     'Mistake',
  [NAG.Blunder]:     'Blunder',
  [NAG.Miss]:        'Miss',
}

const allNags = NAG_ORDER

function accuracyBarClass(accuracy: number | null): string {
  if (accuracy === null) return 'bg-neutral-300 dark:bg-neutral-600'
  if (accuracy >= 85) return 'bg-green-500'
  if (accuracy >= 70) return 'bg-yellow-500'
  if (accuracy >= 55) return 'bg-orange-500'
  return 'bg-red-500'
}

</script>

<template>
  <div v-if="whiteStats && blackStats" class="flex flex-col gap-3">
    <h3 class="text-xs font-medium text-secondary uppercase tracking-wide">Player Stats</h3>

    <!-- Header row: player names -->
    <div class="grid grid-cols-2 gap-3">
      <!-- White -->
      <div class="flex items-center gap-1.5 min-w-0">
        <ChessPlayerIcon color="white" class="shrink-0" />
        <span class="text-xs font-semibold text-primary truncate">
          {{ whiteUsername ?? 'White' }}
        </span>
      </div>
      <!-- Black -->
      <div class="flex items-center gap-1.5 min-w-0">
        <ChessPlayerIcon color="black" class="shrink-0" />
        <span class="text-xs font-semibold text-primary truncate">
          {{ blackUsername ?? 'Black' }}
        </span>
      </div>
    </div>

    <!-- Accuracy rows -->
    <div class="grid grid-cols-2 gap-3">
      <template v-for="(stats, side) in [whiteStats, blackStats]" :key="side">
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <span class="text-xs text-secondary">Accuracy</span>
            <span class="text-xs font-mono font-semibold text-primary">
              {{ stats.accuracy !== null ? `${stats.accuracy.toFixed(1)}%` : '—' }}
            </span>
          </div>
          <div class="h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="accuracyBarClass(stats.accuracy)"
              :style="{ width: stats.accuracy !== null ? `${stats.accuracy}%` : '0%' }"
            />
          </div>
        </div>
      </template>
    </div>

    <!-- NAG + book move breakdown -->
    <div class="grid grid-cols-2 gap-x-3 gap-y-0.5">
      <!-- Column headers (spacer rows already aligned via grid) -->
      <template v-for="nag in allNags" :key="nag">
        <!-- White count -->
        <div class="flex items-center gap-1.5 py-0.5">
          <span
            class="text-xs font-bold w-5 text-center px-0.5 rounded leading-tight"
            :class="nagBgClass(nag)"
          >
            {{ nagSymbol(nag) || '·' }}
          </span>
          <span class="text-xs text-secondary flex-1">{{ NAG_LABELS[nag] }}</span>
          <span class="text-xs font-mono font-medium text-primary">
            {{ whiteStats.nagCounts[nag] ?? 0 }}
          </span>
        </div>
        <!-- Black count (same row label, right column) -->
        <div class="flex items-center gap-1.5 py-0.5">
          <span
            class="text-xs font-bold w-5 text-center px-0.5 rounded leading-tight"
            :class="nagBgClass(nag)"
          >
            {{ nagSymbol(nag) || '·' }}
          </span>
          <span class="text-xs text-secondary flex-1">{{ NAG_LABELS[nag] }}</span>
          <span class="text-xs font-mono font-medium text-primary">
            {{ blackStats.nagCounts[nag] ?? 0 }}
          </span>
        </div>
      </template>

      <!-- Book moves row (two cells, each in their own column) -->
      <template v-if="whiteStats.bookMoveCount > 0 || blackStats.bookMoveCount > 0">
        <div class="flex items-center gap-1.5 py-0.5">
          <span class="text-xs w-5 text-center">📖</span>
          <span class="text-xs text-secondary flex-1">Book</span>
          <span class="text-xs font-mono font-medium text-primary">
            {{ whiteStats.bookMoveCount }}
          </span>
        </div>
        <div class="flex items-center gap-1.5 py-0.5">
          <span class="text-xs w-5 text-center">📖</span>
          <span class="text-xs text-secondary flex-1">Book</span>
          <span class="text-xs font-mono font-medium text-primary">
            {{ blackStats.bookMoveCount }}
          </span>
        </div>
      </template>
    </div>

  </div>
  <div v-else class="flex flex-col gap-3">
    <h3 class="text-xs font-medium text-secondary uppercase tracking-wide">Player Stats</h3>
    <span class="text-xs text-muted">Analyzing...</span>
  </div>
</template>
