<script setup lang="ts">
import type { ColumnDef, Row } from '@tanstack/vue-table'
import type { ChessGame } from 'src/database/chess/types'
import { TimeClass } from 'src/database/chess/types'
import UITable from 'src/renderer/components/Table/UITable.vue'
import { RouterLink } from 'vue-router'
import { h, computed } from 'vue'
import { useChessGames } from 'src/renderer/composables/chessGames/useChessGames'
import ChessPlayerIcon from 'src/renderer/components/Chess/ChessPlayerIcon.vue'
import ChessResult from 'src/renderer/components/Chess/ChessResult.vue'
import Opening from './Opening.vue'

const {
  chessGames,
  isChessGamesLoading,
  chessGamesError,
} = useChessGames()

const TIME_CLASS_LABELS: Record<TimeClass, string> = {
  [TimeClass.ULTRA_BULLET]: 'UltraBullet',
  [TimeClass.BULLET]: 'Bullet',
  [TimeClass.BLITZ]: 'Blitz',
  [TimeClass.RAPID]: 'Rapid',
  [TimeClass.CLASSICAL]: 'Classical',
  [TimeClass.DAILY]: 'Daily',
}

const formatTimeControl = (timeControl: ChessGame['timeControl']) => {
  const label = TIME_CLASS_LABELS[timeControl.timeClass] ?? timeControl.timeClass
  return `${label} · ${timeControl.base / 60}+${timeControl.increment}`
}

const formatDateTime = (date?: Date) => {
  if (!date) return '-'
  return date.toLocaleString()
}

const columns: ColumnDef<ChessGame>[] = [
  {
    id: 'players',
    header: 'Players',
    cell: ({ row }: { row: Row<ChessGame> }) => {
      return h('div', { class: 'flex flex-col' }, [
        h('div', { class: 'text-sm flex items-center gap-2' }, [
          h(ChessPlayerIcon, { color: 'white' }),
          h('span', { class: 'text-sm' }, `${row.original.white.username}`),
          h('span', { class: 'text-sm' }, ` (${row.original.white.rating ?? 'N/A'})`),
        ]),
        h('div', { class: 'text-sm flex items-center gap-2' }, [
          h(ChessPlayerIcon, { color: 'black' }),
          h('span', { class: 'text-sm' }, `${row.original.black.username}`),
          h('span', { class: 'text-sm' }, ` (${row.original.black.rating ?? 'N/A'})`),
        ]),
      ])
    },
  },
  {
    id: 'result',
    header: 'Result',
    cell: ({ row }: { row: Row<ChessGame> }) => {
      return h('div', { class: 'flex flex-col' }, [
        h('div', { class: 'text-sm flex items-center gap-2' }, [
          h(ChessResult, { result: row.original.white.result }),
        ]),
        h('div', { class: 'text-sm flex items-center gap-2' }, [
          h(ChessResult, { result: row.original.black.result }),
        ]),
      ])
    },
  },
  {
    id: 'termination',
    header: 'Termination',
    accessorKey: 'termination',
    cell: ({ row }: { row: Row<ChessGame> }) => row.original.termination ?? '-',
  },
  {
    id: 'opening',
    header: 'Opening',
    accessorKey: 'opening',
    cell: ({ row }: { row: Row<ChessGame> }) => {
      return h(Opening, { pgn: row.original.pgn ?? null })
    },
  },
  {
    id: 'moves',
    header: 'Moves',
    accessorKey: 'moveCount',
    cell: ({ row }: { row: Row<ChessGame> }) => row.original.moveCount ?? '-',
  },
  {
    id: 'timeControl',
    header: 'Time Control',
    accessorKey: 'timeControl',
    cell: ({ row }: { row: Row<ChessGame> }) => {
      return formatTimeControl(row.original.timeControl)
    },
  },
  {
    id: 'startTime',
    header: 'Date',
    accessorKey: 'startTime',
    cell: ({ row }: { row: Row<ChessGame> }) => {
      return formatDateTime(row.original.startTime)
    },
  },
  {
    id: 'platform',
    header: 'Platform',
    accessorKey: 'platform',
    cell: ({ row }: { row: Row<ChessGame> }) => row.original.platform,
  },
  {
    id: 'analysis',
    header: 'Analysis',
    cell: ({ row }: { row: Row<ChessGame> }) => {
      return h(
        RouterLink,
        { to: `/analysis/${row.original.id}`, class: 'text-accent hover:underline' },
        () => 'View'
      )
    },
  },
]

const data = computed(() => chessGames.value ?? [])
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
    />
  </div>
</template>
