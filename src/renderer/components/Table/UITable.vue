<script setup lang="ts" generic="TData">
import {
  FlexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getPaginationRowModel,
  getSortedRowModel,
  useVueTable,
} from '@tanstack/vue-table'
import type { ColumnDef, ColumnFiltersState, SortingState } from '@tanstack/vue-table'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Search, X } from 'lucide-vue-next'
import AppAlert from '../AppAlert.vue'
import Button from '@/components/ui/button/Button.vue'
import { computed, ref, useTemplateRef } from 'vue'
import { useScroll } from '@vueuse/core'

const props = defineProps<{
  data: TData[]
  columns: ColumnDef<TData>[]
  initialPageSize?: number
  loading?: boolean
  error?: Error | string | null
  columnFilters?: ColumnFiltersState
  sorting?: SortingState
  columnVisibility?: Record<string, boolean>
}>()

const emit = defineEmits<{
  'update:sorting': [value: SortingState]
}>()

const pageIndex = ref(0)
const pageSize = ref(props.initialPageSize ?? 20)
const internalSorting = ref<SortingState>(props.sorting ?? [])
const internalColumnFilters = ref<ColumnFiltersState>(props.columnFilters ?? [])
const globalFilter = ref('')

const table = useVueTable({
  get data() {
    return props.data
  },
  get columns() {
    return props.columns
  },
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getFacetedRowModel: getFacetedRowModel(),
  getFacetedUniqueValues: getFacetedUniqueValues(),
  autoResetPageIndex: true,
  state: {
    get pagination() {
      return { pageIndex: pageIndex.value, pageSize: pageSize.value }
    },
    get columnFilters() {
      return internalColumnFilters.value
    },
    get sorting() {
      return internalSorting.value
    },
    get columnVisibility() {
      return props.columnVisibility ?? {}
    },
    get globalFilter() {
      return globalFilter.value
    },
  },
  onPaginationChange: updater => {
    const current = { pageIndex: pageIndex.value, pageSize: pageSize.value }
    const next = typeof updater === 'function' ? updater(current) : updater
    pageIndex.value = next.pageIndex
    pageSize.value = next.pageSize
  },
  onSortingChange: updater => {
    const next = typeof updater === 'function' ? updater(internalSorting.value) : updater
    internalSorting.value = next
    emit('update:sorting', next)
  },
  onColumnFiltersChange: updater => {
    const next = typeof updater === 'function' ? updater(internalColumnFilters.value) : updater
    internalColumnFilters.value = next
  },
  onGlobalFilterChange: updater => {
    globalFilter.value = typeof updater === 'function' ? updater(globalFilter.value) : updater
  },
})

const hasActiveFilters = computed(() =>
  internalColumnFilters.value.length > 0 || globalFilter.value.length > 0
)

const filteredRowCount = computed(() => table.getFilteredRowModel().rows.length)

function resetAllFilters() {
  globalFilter.value = ''
  internalColumnFilters.value = []
}

const totalRows = computed(() => props.data.length)
const totalPages = computed(() => table.getPageCount())
const currentPage = computed(() => pageIndex.value + 1)

const startRow = computed(() => {
  return totalRows.value > 0 ? pageIndex.value * pageSize.value + 1 : 0
})

const endRow = computed(() => {
  return Math.min((pageIndex.value + 1) * pageSize.value, totalRows.value)
})

const el = useTemplateRef('ui-table-container')
const { y } = useScroll(el)

const shadowTop = computed(() => y.value > 0)
const shadowBottom = computed(() => {
  const scrollHeight = el.value?.scrollHeight ?? 0
  const top = (el.value?.offsetHeight ?? 0) + y.value
  return top < scrollHeight
})
</script>

<template>
  <div class="rounded-lg border border-border h-full flex flex-col">

    <!-- Toolbar -->
    <div class="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
      <div class="relative w-full max-w-sm">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search…"
          :value="globalFilter"
          class="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="globalFilter = ($event.target as HTMLInputElement).value"
        />
      </div>
      <Button
        v-if="hasActiveFilters"
        variant="ghost"
        size="sm"
        class="shrink-0 text-muted-foreground hover:text-primary gap-1.5"
        @click="resetAllFilters"
      >
        <X class="size-3.5" />
        Reset filters
      </Button>
    </div>

    <div ref="ui-table-container" class="overflow-auto flex-1">
      <table class="w-full text-sm text-left">
        <thead
          class="bg-sunken text-secondary uppercase text-xs tracking-wider sticky top-0 z-1"
          :class="{ 'shadow-md': shadowTop }"
        >
          <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
            <th
              v-for="header in headerGroup.headers"
              :key="header.id"
              :colSpan="header.colSpan"
              class="px-4 py-3 font-semibold"
            >
              <FlexRender
                v-if="!header.isPlaceholder"
                :render="header.column.columnDef.header"
                :props="header.getContext()"
              />
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-if="loading">
            <td
              :colspan="table.getHeaderGroups()[0]?.headers.length ?? 1"
              class="px-4 py-12 text-center"
            >
              <div class="flex justify-center items-center h-full w-full">
                <slot name="loading">
                  <span class="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 class="size-4 animate-spin" />
                    Loading...
                  </span>
                </slot>
              </div>
            </td>
          </tr>
          <tr v-else-if="error">
            <td
              :colspan="table.getHeaderGroups()[0]?.headers.length ?? 1"
              class="px-4 py-12 text-center"
            >
              <div class="flex justify-center items-center h-full w-full">
                <slot name="error">
                  <AppAlert :error="error" />
                </slot>
              </div>
            </td>
          </tr>
          <tr v-else-if="data.length === 0">
            <td
              :colspan="table.getHeaderGroups()[0]?.headers.length ?? 1"
              class="px-4 py-12 text-center"
            >
              <div class="flex justify-center items-center h-full w-full">
                <slot name="empty" />
              </div>
            </td>
          </tr>
          <tr
            v-else
            v-for="row in table.getRowModel().rows"
            :key="row.id"
            class="hover:bg-raised transition-colors"
          >
            <td v-for="cell in row.getVisibleCells()" :key="cell.id" class="px-4 py-3 text-primary">
              <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      class="bg-sunken border-t border-border w-full flex justify-between items-center px-4 py-2 shrink-0"
      :class="{
        'shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1),0_-2px_4px_-1px_rgba(0,0,0,0.06)]': shadowBottom,
      }"
    >
      <div class="text-sm text-secondary">
        <span v-if="totalRows > 0">
          Showing {{ startRow }}-{{ endRow }} of
          <span v-if="hasActiveFilters">
            {{ filteredRowCount }} <span class="text-muted-foreground">(filtered from {{ totalRows }})</span>
          </span>
          <span v-else>{{ totalRows }}</span>
          rows
        </span>
        <span v-else>No rows</span>
        <span v-if="totalPages > 0" class="ml-4"> Page {{ currentPage }} of {{ totalPages }} </span>
      </div>
      <div class="flex gap-2">
        <Button
          variant="ghost"
          size="icon"
          @click="table.firstPage()"
          :disabled="!table.getCanPreviousPage()"
        >
          <ChevronsLeft class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          @click="table.previousPage()"
          :disabled="!table.getCanPreviousPage()"
        >
          <ChevronLeft class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          @click="table.nextPage()"
          :disabled="!table.getCanNextPage()"
        >
          <ChevronRight class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          @click="table.lastPage()"
          :disabled="!table.getCanNextPage()"
        >
          <ChevronsRight class="size-4" />
        </Button>
      </div>
    </div>
  </div>
</template>
