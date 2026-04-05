<script setup lang="ts">
import type { ColumnDef, Row } from '@tanstack/vue-table'
import type { PositionIndexRow } from 'src/database/vectors/types'
import type { PositionCluster } from 'src/services/analysis/ClusteringService'
import UITable from 'src/renderer/components/Table/UITable.vue'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import Button from '@/components/ui/button/Button.vue'
import { h, ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Loader2, RefreshCw } from 'lucide-vue-next'
import { usePositionIndex } from '../composables/usePositionIndex'
import { usePositionClusters } from '../composables/usePositionClusters'
import { analysisRoute } from 'src/renderer/utils/analysisRoute'
import { NAG } from 'src/services/engine/types'

// ── Positions list ──────────────────────────────────────────────

const { positions, isPending, error } = usePositionIndex()

const filterReason = ref('')
const filterColor = ref('')

const filteredPositions = computed(() => {
  let rows = positions.value
  if (filterReason.value) rows = rows.filter(r => r.index_reason === filterReason.value)
  if (filterColor.value) rows = rows.filter(r => r.color === filterColor.value)
  return rows
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

const positionColumns: ColumnDef<PositionIndexRow>[] = [
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

// ── Clusters ────────────────────────────────────────────────────

const activeTab = ref<'positions' | 'clusters'>('positions')
const clustersTabActive = computed(() => activeTab.value === 'clusters')
const { clusters, isPending: clustersPending, isFetching: clustersFetching, error: clustersError, refetch: refetchClusters } = usePositionClusters(clustersTabActive)

const clusterColumns: ColumnDef<PositionCluster>[] = [
  {
    id: 'clusterId',
    header: '#',
    cell: ({ row }: { row: Row<PositionCluster> }) => {
      return h('span', { class: 'tabular-nums text-sm text-secondary' }, String(row.index + 1))
    },
  },
  {
    id: 'representative',
    header: 'Representative Position',
    cell: ({ row }: { row: Row<PositionCluster> }) => {
      const c = row.original
      const move = c.representativeSan
        ? c.representativeColor === 'w'
          ? `${c.representativeMoveNumber ?? ''}. ${c.representativeSan}`
          : `${c.representativeMoveNumber ?? ''}... ${c.representativeSan}`
        : '—'
      return h('span', { class: 'font-mono text-sm whitespace-nowrap' }, move)
    },
  },
  {
    id: 'size',
    header: 'Positions',
    accessorKey: 'size',
    cell: ({ row }: { row: Row<PositionCluster> }) => {
      return h('span', { class: 'tabular-nums text-sm' }, String(row.original.size))
    },
  },
  {
    id: 'gameCount',
    header: 'Games',
    accessorKey: 'gameCount',
    cell: ({ row }: { row: Row<PositionCluster> }) => {
      return h('span', { class: 'tabular-nums text-sm' }, String(row.original.gameCount))
    },
  },
  {
    id: 'dominantReason',
    header: 'Common Reason',
    accessorKey: 'dominantReason',
    cell: ({ row }: { row: Row<PositionCluster> }) => {
      return h(Badge, { variant: reasonBadgeVariant(row.original.dominantReason) }, () => reasonLabel(row.original.dominantReason))
    },
  },
  {
    id: 'dominantOpening',
    header: 'Opening',
    cell: ({ row }: { row: Row<PositionCluster> }) => {
      return h('span', { class: 'text-sm' }, row.original.dominantOpening ?? '—')
    },
  },
  {
    id: 'avgCriticality',
    header: 'Avg Criticality',
    accessorKey: 'avgCriticality',
    cell: ({ row }: { row: Row<PositionCluster> }) => {
      const c = row.original.avgCriticality
      if (c == null) return h('span', { class: 'text-secondary' }, '—')
      return h('span', { class: 'tabular-nums text-sm' }, c.toFixed(2))
    },
  },
  {
    id: 'view',
    header: 'View',
    cell: ({ row }: { row: Row<PositionCluster> }) => {
      const c = row.original
      return h(
        RouterLink,
        {
          to: analysisRoute(c.representativeGameId, c.representativeFen),
          class: 'text-sm text-accent hover:underline',
        },
        () => 'View',
      )
    },
  },
]
</script>

<template>
  <div class="h-full flex flex-col p-4 gap-3">
    <div class="flex items-center justify-between shrink-0">
      <h1 class="text-xl font-semibold">Critical Positions</h1>
    </div>

    <Tabs v-model="activeTab" class="flex flex-col flex-1 min-h-0 gap-3">
      <div class="flex items-center justify-between shrink-0">
        <TabsList>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="clusters">Clusters</TabsTrigger>
        </TabsList>

        <!-- Filters (positions tab only) -->
        <div v-if="activeTab === 'positions'" class="flex items-center gap-2">
          <select
            v-model="filterReason"
            class="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All Reasons</option>
            <option value="blunder">Blunder</option>
            <option value="critical">Critical</option>
            <option value="difficult">Difficult</option>
            <option value="suboptimal_plan">Suboptimal Plan</option>
          </select>
          <select
            v-model="filterColor"
            class="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All Colors</option>
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </div>

        <!-- Re-cluster button (clusters tab only) -->
        <div v-if="activeTab === 'clusters'" class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            :disabled="clustersFetching"
            @click="refetchClusters()"
          >
            <Loader2 v-if="clustersFetching" class="size-3.5 animate-spin" />
            <RefreshCw v-else class="size-3.5" />
            Re-cluster
          </Button>
        </div>
      </div>

      <!-- Positions tab -->
      <TabsContent value="positions" class="flex-1 min-h-0">
        <UITable
          :data="filteredPositions"
          :columns="positionColumns"
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
      </TabsContent>

      <!-- Clusters tab -->
      <TabsContent value="clusters" class="flex-1 min-h-0 flex flex-col gap-2">
        <p class="text-sm text-muted-foreground shrink-0 max-w-3xl leading-relaxed">
          Each row is a group of indexed positions that look alike in the
          <span class="text-foreground">75-dimensional positional feature vector</span>
          (piece activity, pawn structure, king safety, etc.). K-means splits all vectors into up to
          20 groups; the table shows how many positions and games landed in each group, the most common
          reason and opening in that group, and one
          <span class="text-foreground">representative position</span>
          (closest to the group’s average). Use
          <span class="text-foreground">View</span>
          to open it in analysis.
        </p>
        <div class="flex-1 min-h-0">
          <UITable
            :data="clusters"
            :columns="clusterColumns"
            :loading="clustersPending || clustersFetching"
            :error="clustersError"
          >
            <template #empty>
              <div class="flex flex-col items-center gap-2 text-muted py-8">
                <p class="text-sm font-medium">No clusters</p>
                <p class="text-xs">
                  Clustering needs indexed positions with vectors. Analyze games, then open this tab again or use Re-cluster.
                </p>
              </div>
            </template>
          </UITable>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>
