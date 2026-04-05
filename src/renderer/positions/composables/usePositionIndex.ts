import { useQuery } from '@tanstack/vue-query'
import { ipcService } from 'src/ipc/renderer'
import { queryClient } from 'src/renderer/query/queryClient'
import type { PositionIndexRow } from 'src/database/vectors/types'
import { computed } from 'vue'

export const POSITION_INDEX_QUERY_KEY = ['position-index'] as const

export const usePositionIndex = () => {
  const {
    data,
    error,
    isPending,
    isFetching,
    isLoading,
  } = useQuery(
    {
      queryKey: POSITION_INDEX_QUERY_KEY,
      queryFn: async (): Promise<PositionIndexRow[]> => {
        const result = await ipcService.send('positions:getAll', {})
        return result.positions
      },
    },
    queryClient,
  )

  const positions = computed(() => data.value ?? [])

  return {
    positions,
    error,
    /** Prefer over `isLoading` when `throwOnError` is false globally — avoids UI stuck if error + loading overlap. */
    isPending,
    isLoading,
    isFetching,
  }
}
