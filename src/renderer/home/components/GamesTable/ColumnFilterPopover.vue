<script setup lang="ts">
import type { Column } from '@tanstack/vue-table'
import { Filter } from 'lucide-vue-next'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

defineProps<{
  column: Column<any, unknown>
}>()
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <button class="inline-flex items-center justify-center size-5 rounded hover:bg-primary/10 transition-colors">
        <Filter
          class="size-3"
          :class="column.getIsFiltered() ? 'text-accent' : 'opacity-40 hover:opacity-100'"
        />
      </button>
    </PopoverTrigger>
    <PopoverContent class="w-64 p-3" align="start">
      <slot />
    </PopoverContent>
  </Popover>
</template>
