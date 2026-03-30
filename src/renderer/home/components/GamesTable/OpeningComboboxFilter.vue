<script setup lang="ts">
import type { Column } from '@tanstack/vue-table'
import { computed, ref } from 'vue'
import { Check } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

const props = defineProps<{
  column: Column<any, unknown>
}>()

const search = ref('')

const facetedValues = computed(() => {
  const map = props.column.getFacetedUniqueValues()
  return Array.from(map.entries())
    .filter(([value]) => value !== '')
    .map(([value, count]) => ({ value: String(value), count }))
    .sort((a, b) => b.count - a.count)
})

const selectedValues = computed<Set<string>>(() => {
  const filterValue = props.column.getFilterValue() as string[] | undefined
  return new Set(filterValue ?? [])
})

function toggleOpening(value: string) {
  const current = new Set(selectedValues.value)
  if (current.has(value)) {
    current.delete(value)
  } else {
    current.add(value)
  }
  const next = Array.from(current)
  props.column.setFilterValue(next.length > 0 ? next : undefined)
}
</script>

<template>
  <Command v-model:search-term="search">
    <CommandInput placeholder="Search openings..." class="h-8" />
    <CommandList class="max-h-48">
      <CommandEmpty>No openings found.</CommandEmpty>
      <CommandGroup>
        <CommandItem
          v-for="item in facetedValues"
          :key="item.value"
          :value="item.value"
          @select="toggleOpening(item.value)"
        >
          <Check
            :class="cn('mr-2 size-4', selectedValues.has(item.value) ? 'opacity-100' : 'opacity-0')"
          />
          <span class="flex-1 truncate">{{ item.value }}</span>
          <span class="ml-auto text-xs text-muted-foreground tabular-nums">{{ item.count }}</span>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
</template>
