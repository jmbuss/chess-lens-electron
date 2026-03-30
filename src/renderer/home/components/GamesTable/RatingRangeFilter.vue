<script setup lang="ts">
import type { Column } from '@tanstack/vue-table'
import { computed } from 'vue'

const props = defineProps<{
  column: Column<any, unknown>
  label?: string
}>()

interface FilterValue {
  min?: number | null
  max?: number | null
}

function getFilterValue(): FilterValue {
  return (props.column.getFilterValue() as FilterValue | undefined) ?? {}
}

function setFilterValue(patch: Partial<FilterValue>) {
  const next = { ...getFilterValue(), ...patch }
  const isEmpty = next.min == null && next.max == null
  props.column.setFilterValue(isEmpty ? undefined : next)
}

const fv = computed(() => getFilterValue())

function onInput(field: 'min' | 'max', e: Event) {
  const raw = (e.target as HTMLInputElement).value
  const parsed = raw === '' ? null : Number(raw)
  setFilterValue({ [field]: Number.isNaN(parsed) ? null : parsed })
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">{{ label ?? 'Rating Range' }}</p>
    <div class="flex items-center gap-2">
      <input
        type="number"
        placeholder="Min"
        :value="fv.min ?? ''"
        class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="onInput('min', $event)"
      />
      <span class="text-muted-foreground text-xs shrink-0">–</span>
      <input
        type="number"
        placeholder="Max"
        :value="fv.max ?? ''"
        class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="onInput('max', $event)"
      />
    </div>
  </div>
</template>
