<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import UITable from 'src/renderer/components/Table/UITable.vue'
import { Badge } from '@/components/ui/badge'
import { h, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useInjectedGameNavigator } from '../composables/provideChessGame'
import { useSimilarPositions, type SimilarityMode } from '../composables/useSimilarPositions'
import { analysisRoute } from 'src/renderer/utils/analysisRoute'
import type { SimilarPositionMatch } from 'src/api/positions/handlers/findSimilar'
import { NAG } from 'src/services/engine/types'

const { currentFen } = useInjectedGameNavigator()

const mode = ref<SimilarityMode>('combined')
const positionalWeight = ref(0.5)

const { matches, isLoading } = useSimilarPositions(currentFen, {
  mode,
  positionalWeight,
})

const nagLabel = (nag: string | null): string => {
  if (nag == null) return ''
  const n = parseInt(nag, 10)
  const labels: Record<number, string> = {
    [NAG.Brilliant]: '!!',
    [NAG.Great]: 'Great',
    [NAG.Best]: 'Best',
    [NAG.Excellent]: 'Excellent',
    [NAG.Good]: '!',
    [NAG.Interesting]: '!?',
    [NAG.Neutral]: '',
    [NAG.Inaccuracy]: '?!',
    [NAG.Mistake]: '?',
    [NAG.Blunder]: '??',
    [NAG.Miss]: 'Miss',
    [NAG.BookMove]: 'Book',
  }
  return labels[n] ?? nag
}

const nagBadgeVariant = (nag: string | null): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (nag == null) return 'secondary'
  const n = parseInt(nag, 10)
  if (n === NAG.Blunder || n === NAG.Mistake) return 'destructive'
  if (n === NAG.Inaccuracy) return 'outline'
  if (n === NAG.Best || n === NAG.Brilliant || n === NAG.Great) return 'default'
  return 'secondary'
}

const columns: ColumnDef<SimilarPositionMatch>[] = [
  {
    accessorKey: 'san',
    header: 'Move',
    cell: ({ getValue }) => {
      const san = getValue<string | null>()
      return san ?? '-'
    },
  },
  {
    accessorKey: 'nag',
    header: 'NAG',
    cell: ({ getValue }) => {
      const nag = getValue<string | null>()
      if (!nag) return ''
      return h(Badge, { variant: nagBadgeVariant(nag) }, () => nagLabel(nag))
    },
  },
  {
    accessorKey: 'indexReason',
    header: 'Reason',
    cell: ({ getValue }) => {
      const reason = getValue<string>()
      const labels: Record<string, string> = {
        blunder: 'Blunder',
        critical: 'Critical',
        difficult: 'Difficult',
        suboptimal_plan: 'Suboptimal',
      }
      return labels[reason] ?? reason
    },
  },
  {
    accessorKey: 'gameId',
    header: 'Game',
    cell: ({ row }) => {
      const m = row.original
      return h(
        RouterLink,
        { to: analysisRoute(m.gameId, m.fen), class: 'text-accent hover:underline' },
        () => 'View',
      )
    },
  },
  {
    accessorKey: 'distance',
    header: 'Score',
    cell: ({ row }) => {
      const d = row.original.distance
      if (mode.value === 'combined') {
        return h('span', { class: 'tabular-nums' }, d.toFixed(4))
      }
      const similarity = Math.max(0, 1 - d)
      return h('span', { class: 'tabular-nums' }, `${(similarity * 100).toFixed(0)}%`)
    },
  },
]

const modeOptions: { value: SimilarityMode; label: string }[] = [
  { value: 'positional', label: 'Positional' },
  { value: 'structural', label: 'Structural' },
  { value: 'combined', label: 'Combined' },
]
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-3 px-1">
      <div class="inline-flex rounded-md border border-input overflow-hidden text-xs">
        <button
          v-for="opt in modeOptions"
          :key="opt.value"
          class="px-2.5 py-1 transition-colors"
          :class="mode === opt.value
            ? 'bg-accent text-accent-foreground'
            : 'bg-background text-muted-foreground hover:bg-raised'"
          @click="mode = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
      <div v-if="mode === 'combined'" class="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Struct</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          :value="positionalWeight"
          class="w-20 h-1 accent-accent"
          @input="positionalWeight = parseFloat(($event.target as HTMLInputElement).value)"
        />
        <span>Pos</span>
      </div>
    </div>

    <UITable :data="matches" :columns="columns" :loading="isLoading">
      <template #empty>
        <div class="flex flex-col items-center gap-2 text-muted py-2">
          <svg
            class="size-8 text-muted opacity-50"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"
            />
          </svg>
          <p class="text-sm font-medium">No similar positions found</p>
          <p class="text-xs">Positions will appear after games are analyzed and indexed.</p>
        </div>
      </template>
    </UITable>
  </div>
</template>
