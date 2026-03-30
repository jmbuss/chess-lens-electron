<script setup lang="ts">
import type { Column } from '@tanstack/vue-table'
import { computed } from 'vue'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

const props = defineProps<{
  column: Column<any, unknown>
  /** Optional map of raw value -> display label */
  labels?: Record<string, string>
}>()

const facetedValues = computed(() => {
  const map = props.column.getFacetedUniqueValues()
  return Array.from(map.entries())
    .map(([value, count]) => ({ value: String(value), count }))
    .sort((a, b) => b.count - a.count)
})

const selectedValues = computed<Set<string>>(() => {
  const filterValue = props.column.getFilterValue() as string[] | undefined
  return new Set(filterValue ?? [])
})

function toggle(value: string) {
  const current = new Set(selectedValues.value)
  if (current.has(value)) {
    current.delete(value)
  } else {
    current.add(value)
  }
  const next = Array.from(current)
  props.column.setFilterValue(next.length > 0 ? next : undefined)
}

function getLabel(value: string): string {
  return props.labels?.[value] ?? value
}
</script>

<template>
  <div class="flex flex-col gap-2 max-h-64 overflow-y-auto">
    <div
      v-for="item in facetedValues"
      :key="item.value"
      class="flex items-center gap-2"
    >
      <Checkbox
        :id="`filter-${column.id}-${item.value}`"
        :model-value="selectedValues.has(item.value)"
        @update:model-value="toggle(item.value)"
      />
      <Label
        :for="`filter-${column.id}-${item.value}`"
        class="text-sm font-normal cursor-pointer flex-1 flex justify-between"
      >
        <span>{{ getLabel(item.value) }}</span>
        <span class="text-muted-foreground tabular-nums">{{ item.count }}</span>
      </Label>
    </div>
    <div v-if="facetedValues.length === 0" class="text-sm text-muted-foreground py-1">
      No options
    </div>
  </div>
</template>
