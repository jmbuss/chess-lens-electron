import { useQuery } from '@tanstack/vue-query'
import { ipcService } from 'src/ipc/renderer'
import { queryClient } from 'src/renderer/query/queryClient'
import type { PositionIndexRow } from 'src/database/vectors/types'
import { computed, toRaw, type Ref } from 'vue'

export const POSITION_INDEX_QUERY_KEY = ['position-index'] as const

export interface PositionIndexFilters {
  indexReason?: string
  nag?: string
  color?: string
  gameId?: string
}

export const usePositionIndex = (
  filters: Ref<PositionIndexFilters>,
  page: Ref<number>,
  pageSize: Ref<number>,
  sortBy: Ref<string>,
  sortDir: Ref<'asc' | 'desc'>,
) => {
  const queryKey = computed(() => [
    ...POSITION_INDEX_QUERY_KEY,
    filters.value,
    page.value,
    pageSize.value,
    sortBy.value,
    sortDir.value,
  ])

  const {
    data,
    error,
    isPending,
    isFetching,
    isLoading,
  } = useQuery(
    {
      queryKey,
      queryFn: async (): Promise<{ positions: PositionIndexRow[]; total: number }> => {
        return ipcService.send('positions:getAll', {
          page: page.value,
          pageSize: pageSize.value,
          // ref({}) is reactive (Proxy); IPC structured clone cannot copy proxies
          filters: { ...toRaw(filters.value) },
          sortBy: sortBy.value,
          sortDir: sortDir.value,
        })
      },
    },
    queryClient,
  )

  const positions = computed(() => data.value?.positions ?? [])
  const total = computed(() => data.value?.total ?? 0)

  return {
    positions,
    total,
    error,
    /** Prefer over `isLoading` when `throwOnError` is false globally — avoids UI stuck if error + loading overlap. */
    isPending,
    isLoading,
    isFetching,
  }
}
