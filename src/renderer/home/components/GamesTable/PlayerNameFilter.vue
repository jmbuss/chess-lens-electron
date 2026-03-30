<script setup lang="ts">
import type { Column } from '@tanstack/vue-table'
import { computed } from 'vue'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { usePlatforms } from 'src/renderer/composables/platforms/usePlatforms'

const props = defineProps<{
  column: Column<any, unknown>
}>()

const { platforms } = usePlatforms()

interface FilterValue {
  search: string
  meSelected: boolean
  platformUsernames: string[]
}

function getFilterValue(): FilterValue {
  return (props.column.getFilterValue() as FilterValue | undefined) ?? {
    search: '',
    meSelected: false,
    platformUsernames: [],
  }
}

function setFilterValue(patch: Partial<FilterValue>) {
  const next = { ...getFilterValue(), ...patch }
  const isEmpty = !next.search && !next.meSelected
  props.column.setFilterValue(isEmpty ? undefined : next)
}

const fv = computed(() => getFilterValue())

const platformUsernames = computed(() => platforms.value.map(p => p.platformUsername))

function onSearchInput(e: Event) {
  setFilterValue({ search: (e.target as HTMLInputElement).value })
}

function onMeToggle(checked: boolean | 'indeterminate') {
  const isChecked = checked === true
  setFilterValue({
    meSelected: isChecked,
    platformUsernames: isChecked ? platformUsernames.value : [],
  })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-1.5">
      <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Search</p>
      <input
        type="text"
        placeholder="Filter by username…"
        :value="fv.search"
        class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="onSearchInput"
      />
    </div>

    <div class="flex flex-col gap-1.5">
      <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick Filter</p>
      <div v-if="platformUsernames.length === 0" class="text-sm text-muted-foreground py-1">
        No platform accounts configured
      </div>
      <div v-else class="flex items-center gap-2">
        <Checkbox
          id="player-name-filter-me"
          :model-value="fv.meSelected"
          @update:model-value="onMeToggle"
        />
        <Label for="player-name-filter-me" class="text-sm font-normal cursor-pointer">
          Me ({{ platformUsernames.join(', ') }})
        </Label>
      </div>
    </div>
  </div>
</template>
