<script setup lang="ts">
import type { ColumnDef, Row, SortingState } from '@tanstack/vue-table'
import type { ChessGameWithMeta, GameResult } from 'src/database/chess/types'
import UITable from 'src/renderer/components/Table/UITable.vue'
import { Badge } from '@/components/ui/badge'
import { h, computed, ref } from 'vue'
import { useChessGames } from 'src/renderer/composables/chessGames/useChessGames'
import { useFavorites } from 'src/renderer/composables/favorites/useFavorites'
import { usePlatforms } from 'src/renderer/composables/platforms/usePlatforms'
import ChessPlayerIcon from 'src/renderer/components/Chess/ChessPlayerIcon.vue'
import { getTerminationLabel, getTerminationBadgeVariant } from 'src/renderer/components/Chess/ChessResult.vue'
import Opening from './Opening.vue'
import SortableHeader from './SortableHeader.vue'
import ColumnFilterPopover from './ColumnFilterPopover.vue'
import FacetedCheckboxFilter from './FacetedCheckboxFilter.vue'
import OpeningComboboxFilter from './OpeningComboboxFilter.vue'
import FavoriteToggle from './FavoriteToggle.vue'
import AnalysisStatusBadge from './AnalysisStatusBadge.vue'
import GameActions from './GameActions.vue'
import PlayerNameFilter from './PlayerNameFilter.vue'
import RatingRangeFilter from './RatingRangeFilter.vue'
import DateRangeFilter from './DateRangeFilter.vue'
import {
  playerNameFilterFn,
  rangeFilterFn,
  dateRangeFilterFn,
  multiValueFilterFn,
  resultSortOrder,
} from './filterFns'
import { TIME_CLASS_LABELS, formatTimeControl } from 'src/renderer/utils/formatTimeControl'

const {
  chessGames,
  isChessGamesLoading,
  chessGamesError,
} = useChessGames()

const { favoriteIds, toggleFavorite } = useFavorites()
const { getPlatformNameForGame } = usePlatforms()

const sorting = ref<SortingState>([{ id: 'startTime', desc: true }])

const formatDateTime = (date?: Date) => {
  if (!date) return '-'
  return date.toLocaleString()
}

interface GamesTableRow extends ChessGameWithMeta {
  userResult?: GameResult
  resultLabel: string | null
}

const columns: ColumnDef<GamesTableRow>[] = [
  {
    id: 'favorite',
    header: ({ column }) => h(SortableHeader, { column, label: '★' }),
    accessorKey: 'isFavorite',
    enableSorting: true,
    sortDescFirst: true,
    cell: ({ row }) => {
      return h(FavoriteToggle, {
        isFavorite: row.original.isFavorite,
        onToggle: () => toggleFavorite(row.original.id),
      })
    },
    size: 50,
  },
  {
    id: 'white',
    header: ({ column }) => h('div', { class: 'flex items-center gap-1' }, [
      h(ChessPlayerIcon, { color: 'white' }),
      h(SortableHeader, { column, label: 'White' }),
      h(ColumnFilterPopover, { column }, () => h(PlayerNameFilter, { column })),
    ]),
    accessorFn: (row) => row.white.username,
    enableSorting: true,
    filterFn: playerNameFilterFn,
    cell: ({ row }: { row: Row<GamesTableRow> }) => {
      return h('div', { class: 'flex items-center gap-2 whitespace-nowrap' }, [
        h(ChessPlayerIcon, { color: 'white' }),
        h('span', { class: 'text-sm' }, row.original.white.username),
      ])
    },
  },
  {
    id: 'whiteRating',
    header: ({ column }) => h('div', { class: 'flex items-center gap-1 whitespace-nowrap' }, [
      h(SortableHeader, { column, label: 'White Rating' }),
      h(ColumnFilterPopover, { column }, () => h(RatingRangeFilter, { column })),
    ]),
    accessorFn: (row) => row.white.rating ?? 0,
    enableSorting: true,
    filterFn: rangeFilterFn,
    cell: ({ row }: { row: Row<GamesTableRow> }) => {
      return h('span', { class: 'text-sm tabular-nums' }, String(row.original.white.rating ?? '-'))
    },
    size: 80,
  },
  {
    id: 'black',
    header: ({ column }) => h('div', { class: 'flex items-center gap-1' }, [
      h(ChessPlayerIcon, { color: 'black' }),
      h(SortableHeader, { column, label: 'Black' }),
      h(ColumnFilterPopover, { column }, () => h(PlayerNameFilter, { column })),
    ]),
    accessorFn: (row) => row.black.username,
    enableSorting: true,
    filterFn: playerNameFilterFn,
    cell: ({ row }: { row: Row<GamesTableRow> }) => {
      return h('div', { class: 'flex items-center gap-2 whitespace-nowrap' }, [
        h(ChessPlayerIcon, { color: 'black' }),
        h('span', { class: 'text-sm' }, row.original.black.username),
      ])
    },
  },
  {
    id: 'blackRating',
    header: ({ column }) => h('div', { class: 'flex items-center gap-1 whitespace-nowrap' }, [
      h(SortableHeader, { column, label: 'Black Rating' }),
      h(ColumnFilterPopover, { column }, () => h(RatingRangeFilter, { column })),
    ]),
    accessorFn: (row) => row.black.rating ?? 0,
    enableSorting: true,
    filterFn: rangeFilterFn,
    cell: ({ row }: { row: Row<GamesTableRow> }) => {
      return h('span', { class: 'text-sm tabular-nums' }, String(row.original.black.rating ?? '-'))
    },
    size: 80,
  },
  {
    id: 'result',
    header: ({ column }) => h('div', { class: 'flex items-center gap-1' }, [
      h(SortableHeader, { column, label: 'Result' }),
      h(ColumnFilterPopover, { column }, () => h(FacetedCheckboxFilter, { column })),
    ]),
    accessorKey: 'resultLabel',
    enableSorting: true,
    sortingFn: (rowA, rowB) => {
      const a = resultSortOrder(rowA.original.userResult)
      const b = resultSortOrder(rowB.original.userResult)
      return a - b
    },
    filterFn: multiValueFilterFn,
    cell: ({ row }: { row: Row<GamesTableRow> }) => {
      const label = row.original.resultLabel
      if (!label) return '-'
      const variant = getTerminationBadgeVariant(row.original.userResult)
      return h(Badge, { variant, class: 'whitespace-nowrap' }, () => label)
    },
  },
  {
    id: 'opening',
    header: ({ column }) => h('div', { class: 'flex items-center gap-1' }, [
      h('span', 'Opening'),
      h(ColumnFilterPopover, { column }, () => h(OpeningComboboxFilter, { column })),
    ]),
    accessorFn: (row) => row.opening?.name ?? '',
    enableSorting: false,
    filterFn: multiValueFilterFn,
    cell: ({ row }: { row: Row<GamesTableRow> }) => {
      return h(Opening, { pgn: row.original.pgn ?? null })
    },
  },
  {
    id: 'moves',
    header: ({ column }) => h('div', { class: 'flex items-center gap-1' }, [
      h(SortableHeader, { column, label: 'Moves' }),
      h(ColumnFilterPopover, { column }, () => h(RatingRangeFilter, { column, label: 'Move Range' })),
    ]),
    accessorKey: 'moveCount',
    enableSorting: true,
    filterFn: rangeFilterFn,
    cell: ({ row }: { row: Row<GamesTableRow> }) => row.original.moveCount ?? '-',
  },
  {
    id: 'timeControl',
    header: ({ column }) => h('div', { class: 'flex items-center gap-1 whitespace-nowrap' }, [
      h('span', 'Time Control'),
      h(ColumnFilterPopover, { column }, () => h(FacetedCheckboxFilter, {
        column,
        labels: TIME_CLASS_LABELS,
      })),
    ]),
    accessorFn: (row) => row.timeControl.timeClass,
    enableSorting: false,
    filterFn: multiValueFilterFn,
    cell: ({ row }: { row: Row<GamesTableRow> }) => {
      return formatTimeControl(row.original.timeControl)
    },
  },
  {
    id: 'startTime',
    header: ({ column }) => h('div', { class: 'flex items-center gap-1 whitespace-nowrap' }, [
      h(SortableHeader, { column, label: 'Date' }),
      h(ColumnFilterPopover, { column }, () => h(DateRangeFilter, { column })),
    ]),
    accessorKey: 'startTime',
    enableSorting: true,
    filterFn: dateRangeFilterFn,
    cell: ({ row }: { row: Row<GamesTableRow> }) => {
      return formatDateTime(row.original.startTime)
    },
  },
  {
    id: 'platform',
    header: ({ column }) => h('div', { class: 'flex items-center gap-1' }, [
      h('span', 'Platform'),
      h(ColumnFilterPopover, { column }, () => h(FacetedCheckboxFilter, { column })),
    ]),
    accessorKey: 'platform',
    enableSorting: false,
    filterFn: multiValueFilterFn,
    cell: ({ row }: { row: Row<GamesTableRow> }) => row.original.platform,
  },
  {
    id: 'analysisStatus',
    header: ({ column }) => h('div', { class: 'flex items-center gap-1' }, [
      h(SortableHeader, { column, label: 'Analyzed' }),
      h(ColumnFilterPopover, { column }, () => h(FacetedCheckboxFilter, {
        column,
        labels: { COMPLETE: 'Complete', ANALYZING: 'Analyzing', UNANALYZED: 'Not Analyzed' },
      })),
    ]),
    accessorFn: (row) => row.analysisStatus ?? 'UNANALYZED',
    enableSorting: true,
    filterFn: multiValueFilterFn,
    cell: ({ row }: { row: Row<GamesTableRow> }) => {
      return h(AnalysisStatusBadge, { status: row.original.analysisStatus })
    },
  },
  {
    id: 'actions',
    header: 'Actions',
    enableSorting: false,
    cell: ({ row }: { row: Row<GamesTableRow> }) => {
      return h(GameActions, { game: row.original })
    },
  },
]

const data = computed<GamesTableRow[]>(() => {
  const games = chessGames.value ?? []
  const favSet = new Set(favoriteIds.value ?? [])
  return games.map(game => {
    const username = getPlatformNameForGame(game)?.toLowerCase()
    const userResult = username
      ? (game.white.username.toLowerCase() === username
        ? game.white.result
        : game.black.result)
      : undefined
    const resultLabel = getTerminationLabel(game.termination, userResult)
    return {
      ...game,
      isFavorite: favSet.has(game.id),
      analysisStatus: game.analysisStatus ?? null,
      userResult,
      resultLabel,
    }
  })
})
</script>

<template>
  <div class="h-full">
    <UITable
      class="border-none"
      :columns="columns"
      :data="data"
      :initial-page-size="20"
      :loading="isChessGamesLoading"
      :error="chessGamesError"
      :sorting="sorting"
      @update:sorting="sorting = $event"
    />
  </div>
</template>
