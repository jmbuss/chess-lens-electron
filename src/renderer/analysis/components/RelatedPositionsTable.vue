<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import UITable from 'src/renderer/components/Table/UITable.vue'
import { Badge as UIChip } from '@/components/ui/badge'
import { h } from 'vue'

type RelatedPosition = {
  opening: string
  game: string
  result: 'win' | 'loss' | 'draw'
  color: 'white' | 'black'
  date: string
  similarity: number
}

const data: RelatedPosition[] = []

const columns: ColumnDef<RelatedPosition>[] = [
  {
    accessorKey: 'opening',
    header: 'Opening',
    cell: ({ getValue }) => getValue<string>(),
  },
  {
    accessorKey: 'game',
    header: 'Game',
    cell: ({ getValue }) => getValue<string>(),
  },
  {
    accessorKey: 'color',
    header: 'Color',
    cell: ({ getValue }) => {
      const color = getValue<'white' | 'black'>()
      return h('span', { class: 'capitalize' }, color)
    },
  },
  {
    accessorKey: 'result',
    header: 'Result',
    cell: ({ getValue }) => {
      const result = getValue<'win' | 'loss' | 'draw'>()
      const variantMap = { win: 'default', loss: 'destructive', draw: 'secondary' } as const
      return h(UIChip, { variant: variantMap[result] }, () => result)
    },
  },
  {
    accessorKey: 'date',
    header: 'Date',
    cell: ({ getValue }) => getValue<string>(),
  },
  {
    accessorKey: 'similarity',
    header: 'Similarity',
    cell: ({ getValue }) => {
      const val = getValue<number>()
      return h('span', { class: 'font-medium tabular-nums' }, `${val}%`)
    },
  },
]
</script>

<template>
  <UITable :data="data" :columns="columns">
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
        <p class="text-sm font-medium">Feature not yet implemented :(</p>
        <p class="text-xs">Please check back later!</p>
      </div>
    </template>
  </UITable>
</template>
