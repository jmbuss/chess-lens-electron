<script setup lang="ts">
import type { Column } from '@tanstack/vue-table'
import { computed } from 'vue'
import { CalendarIcon, X } from 'lucide-vue-next'
import { DateFormatter, getLocalTimeZone, today, parseDate } from '@internationalized/date'
import type { DateRange } from 'reka-ui'
import { RangeCalendar } from '@/components/ui/range-calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const props = defineProps<{
  column: Column<any, unknown>
}>()

interface FilterValue {
  from?: Date | null
  to?: Date | null
  preset?: string | null
}

const df = new DateFormatter('en-US', { dateStyle: 'medium' })
const tz = getLocalTimeZone()

function getFilterValue(): FilterValue {
  return (props.column.getFilterValue() as FilterValue | undefined) ?? {}
}

function setFilterValue(patch: Partial<FilterValue>) {
  const next = { ...getFilterValue(), ...patch }
  const isEmpty = next.from == null && next.to == null
  props.column.setFilterValue(isEmpty ? undefined : next)
}

const fv = computed(() => getFilterValue())

const dateRange = computed<DateRange>({
  get() {
    const { from, to } = fv.value
    return {
      start: from ? parseDate(from.toISOString().slice(0, 10)) : undefined,
      end: to ? parseDate(to.toISOString().slice(0, 10)) : undefined,
    }
  },
  set(range: DateRange) {
    const from = range.start ? range.start.toDate(tz) : null
    let to: Date | null = null
    if (range.end) {
      const d = range.end.toDate(tz)
      d.setHours(23, 59, 59, 999)
      to = d
    }
    setFilterValue({ from, to, preset: null })
  },
})

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'last-week', label: 'Last 7 days' },
  { id: 'last-month', label: 'Last 30 days' },
  { id: 'last-year', label: 'Last year' },
] as const

type PresetId = typeof PRESETS[number]['id']

function applyPreset(id: PresetId) {
  const now = new Date()
  const from = new Date(now)
  if (id === 'today') {
    from.setHours(0, 0, 0, 0)
  } else if (id === 'last-week') {
    from.setDate(from.getDate() - 7)
    from.setHours(0, 0, 0, 0)
  } else if (id === 'last-month') {
    from.setDate(from.getDate() - 30)
    from.setHours(0, 0, 0, 0)
  } else if (id === 'last-year') {
    from.setFullYear(from.getFullYear() - 1)
    from.setHours(0, 0, 0, 0)
  }
  const to = new Date(now)
  to.setHours(23, 59, 59, 999)
  props.column.setFilterValue({ from, to, preset: id })
}

function clear() {
  props.column.setFilterValue(undefined)
}

const activePreset = computed(() => fv.value.preset ?? null)
const hasFilter = computed(() => fv.value.from != null || fv.value.to != null)

const label = computed(() => {
  const { from, to } = fv.value
  if (from && to) return `${df.format(from)} – ${df.format(to)}`
  if (from) return `From ${df.format(from)}`
  if (to) return `Until ${df.format(to)}`
  return 'Pick a date range'
})

const defaultPlaceholder = today(tz)
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date Range</p>

    <div class="flex flex-col gap-0.5">
      <button
        v-for="preset in PRESETS"
        :key="preset.id"
        class="flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors text-left hover:bg-accent"
        :class="activePreset === preset.id ? 'bg-accent font-medium' : ''"
        @click="applyPreset(preset.id)"
      >
        <span
          class="flex size-3.5 shrink-0 items-center justify-center rounded-full border border-primary"
          :class="activePreset === preset.id ? 'bg-primary' : ''"
        >
          <span v-if="activePreset === preset.id" class="size-1.5 rounded-full bg-primary-foreground" />
        </span>
        {{ preset.label }}
      </button>
    </div>

    <div class="border-t pt-2">
      <Popover>
        <PopoverTrigger as-child>
          <Button
            variant="outline"
            :class="cn('w-full justify-start text-left font-normal text-sm h-8 px-2', !hasFilter && 'text-muted-foreground')"
          >
            <CalendarIcon class="mr-1.5 size-3.5 shrink-0" />
            <span class="truncate">{{ label }}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-auto p-0" align="start">
          <RangeCalendar
            v-model="dateRange"
            :default-placeholder="defaultPlaceholder"
            :number-of-months="2"
            initial-focus
          />
        </PopoverContent>
      </Popover>
    </div>

    <button
      v-if="hasFilter"
      class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      @click="clear"
    >
      <X class="size-3" />
      Clear dates
    </button>
  </div>
</template>
