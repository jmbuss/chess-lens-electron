<script setup lang="ts" generic="TData">
import {
  FlexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useVueTable,
} from '@tanstack/vue-table'
import type { ColumnDef } from '@tanstack/vue-table'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-vue-next'
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
}>()

const pageIndex = ref(0)
const pageSize = ref(props.initialPageSize ?? 20)

const table = useVueTable({
  get data() {
    return props.data
  },
  get columns() {
    return props.columns
  },
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  state: {
    get pagination() {
      return { pageIndex: pageIndex.value, pageSize: pageSize.value }
    },
  },
  onPaginationChange: updater => {
    const current = { pageIndex: pageIndex.value, pageSize: pageSize.value }
    const next = typeof updater === 'function' ? updater(current) : updater
    pageIndex.value = next.pageIndex
    pageSize.value = next.pageSize
  },
})

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
  <div ref="ui-table-container" class="rounded-lg border border-border overflow-auto h-full">
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
    <div
      class="sticky bottom-0 bg-sunken w-full flex justify-between items-center px-4 py-2"
      :class="{
        'shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1),0_-2px_4px_-1px_rgba(0,0,0,0.06)]': shadowBottom,
      }"
    >
      <div class="text-sm text-secondary">
        <span v-if="totalRows > 0">
          Showing {{ startRow }}-{{ endRow }} of {{ totalRows }} rows
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
