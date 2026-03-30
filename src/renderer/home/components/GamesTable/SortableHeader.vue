<script setup lang="ts">
import type { Column } from '@tanstack/vue-table'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-vue-next'

defineProps<{
  column: Column<any, unknown>
  label: string
}>()
</script>

<template>
  <button
    v-if="column.getCanSort()"
    class="flex items-center gap-1 hover:text-primary transition-colors"
    @click="column.toggleSorting()"
  >
    <span>{{ label }}</span>
    <ArrowUp v-if="column.getIsSorted() === 'asc'" class="size-3" />
    <ArrowDown v-else-if="column.getIsSorted() === 'desc'" class="size-3" />
    <ArrowUpDown v-else class="size-3 opacity-30" />
  </button>
  <span v-else>{{ label }}</span>
</template>
