<script setup lang="ts">
import type { ColumnDef, Row } from '@tanstack/vue-table'
import type { PositionIndexRow } from 'src/database/vectors/types'
import UITable from 'src/renderer/components/Table/UITable.vue'
import { Badge } from '@/components/ui/badge'
import { h, ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { usePositionIndex, type PositionIndexFilters } from '../composables/usePositionIndex'
import { analysisRoute } from 'src/renderer/utils/analysisRoute'
import { NAG } from 'src/services/engine/types'

const filters = ref<PositionIndexFilters>({})
const page = ref(1)
const pageSize = ref(20)
const sortBy = ref('created_at')
const sortDir = ref<'asc' | 'desc'>('desc')

const { positions, total, isPending, error } = usePositionIndex(
  filters,
  page,
  pageSize,
  sortBy,
  sortDir,
)

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
  if (n === NAG.Blunder) return 'destructive'
  if (n === NAG.Mistake) return 'destructive'
  if (n === NAG.Inaccuracy) return 'outline'
  if (n === NAG.Best || n === NAG.Brilliant || n === NAG.Great) return 'default'
  return 'secondary'
}

const reasonLabel = (reason: string): string => {
  const labels: Record<string, string> = {
    blunder: 'Blunder',
    critical: 'Critical',
    difficult: 'Difficult',
    suboptimal_plan: 'Suboptimal Plan',
  }
  return labels[reason] ?? reason
}

const reasonBadgeVariant = (reason: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (reason === 'blunder') return 'destructive'
  if (reason === 'critical') return 'default'
  return 'secondary'
}

const formatEval = (row: PositionIndexRow): string => {
  if (row.eval_mate != null) return `M${row.eval_mate}`
  if (row.eval_cp != null) return (row.eval_cp / 100).toFixed(1)
  return '-'
}

const columns: ColumnDef<PositionIndexRow>[] = [
  {
    id: 'move',
    header: 'Move',
    cell: ({ row }: { row: Row<PositionIndexRow> }) => {
      const d = row.original
      const prefix = d.color === 'w'
        ? `${d.move_number ?? ''}. `
        : `${d.move_number ?? ''}... `
      return h('span', { class: 'font-mono text-sm whitespace-nowrap' }, `${prefix}${d.san ?? ''}`)
    },
  },
  {
    id: 'nag',
    header: 'NAG',
    accessorKey: 'nag',
    cell: ({ row }: { row: Row<PositionIndexRow> }) => {
      const nag = row.original.nag
      if (!nag) return ''
      return h(Badge, { variant: nagBadgeVariant(nag) }, () => nagLabel(nag))
    },
  },
  {
    id: 'eval',
    header: 'Eval',
    cell: ({ row }: { row: Row<PositionIndexRow> }) => {
      return h('span', { class: 'tabular-nums text-sm' }, formatEval(row.original))
    },
  },
  {
    id: 'criticality',
    header: 'Criticality',
    accessorKey: 'criticality_score',
    cell: ({ row }: { row: Row<PositionIndexRow> }) => {
      const score = row.original.criticality_score
      if (score == null) return '-'
      return h('span', { class: 'tabular-nums text-sm' }, score.toFixed(2))
    },
  },
  {
    id: 'indexReason',
    header: 'Reason',
    accessorKey: 'index_reason',
    cell: ({ row }: { row: Row<PositionIndexRow> }) => {
      const reason = row.original.index_reason
      return h(Badge, { variant: reasonBadgeVariant(reason) }, () => reasonLabel(reason))
    },
  },
  {
    id: 'color',
    header: 'Color',
    accessorKey: 'color',
    cell: ({ row }: { row: Row<PositionIndexRow> }) => {
      const color = row.original.color
      return h('span', { class: 'capitalize text-sm' }, color === 'w' ? 'White' : 'Black')
    },
  },
  {
    id: 'opening',
    header: 'Opening',
    accessorKey: 'opening_eco',
    cell: ({ row }: { row: Row<PositionIndexRow> }) => {
      const d = row.original
      if (!d.opening_eco) return '-'
      return h('span', { class: 'text-sm', title: d.opening_name ?? undefined }, d.opening_eco)
    },
  },
  {
    id: 'game',
    header: 'Game',
    cell: ({ row }: { row: Row<PositionIndexRow> }) => {
      return h(
        RouterLink,
        {
          to: analysisRoute(row.original.game_id, row.original.fen),
          class: 'text-sm text-accent hover:underline',
        },
        () => 'View',
      )
    },
  },
]

const data = computed(() => positions.value)
</script>

<template>
  <div class="h-full flex flex-col p-4 gap-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Critical Positions</h1>
      <div class="flex items-center gap-2">
        <select
          class="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          :value="filters.indexReason ?? ''"
          @change="filters = { ...filters, indexReason: ($event.target as HTMLSelectElement).value || undefined }; page = 1"
        >
          <option value="">All Reasons</option>
          <option value="blunder">Blunder</option>
          <option value="critical">Critical</option>
          <option value="difficult">Difficult</option>
          <option value="suboptimal_plan">Suboptimal Plan</option>
        </select>
        <select
          class="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          :value="filters.color ?? ''"
          @change="filters = { ...filters, color: ($event.target as HTMLSelectElement).value || undefined }; page = 1"
        >
          <option value="">All Colors</option>
          <option value="w">White</option>
          <option value="b">Black</option>
        </select>
      </div>
    </div>
    <div class="flex-1 min-h-0">
      <UITable
        :data="data"
        :columns="columns"
        :initial-page-size="pageSize"
        :loading="isPending"
        :error="error"
      >
        <template #empty>
          <div class="flex flex-col items-center gap-2 text-muted py-8">
            <p class="text-sm font-medium">No indexed positions yet</p>
            <p class="text-xs">Positions will appear here after game analysis completes.</p>
          </div>
        </template>
      </UITable>
    </div>
    <div v-if="total > pageSize" class="flex items-center justify-center gap-2 text-sm">
      <button
        class="px-3 py-1 rounded border border-input disabled:opacity-50"
        :disabled="page <= 1"
        @click="page--"
      >
        Previous
      </button>
      <span class="tabular-nums">Page {{ page }} of {{ Math.ceil(total / pageSize) }}</span>
      <button
        class="px-3 py-1 rounded border border-input disabled:opacity-50"
        :disabled="page >= Math.ceil(total / pageSize)"
        @click="page++"
      >
        Next
      </button>
    </div>
  </div>
</template>
