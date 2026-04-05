import { useQuery } from '@tanstack/vue-query'
import { ipcService } from 'src/ipc/renderer'
import { queryClient } from 'src/renderer/query/queryClient'
import type { SimilarPositionMatch } from 'src/api/positions/handlers/findSimilar'
import { computed, type Ref } from 'vue'

export const useSimilarPositions = (
  fen: Ref<string>,
  options?: {
    k?: number
  },
) => {
  const k = options?.k ?? 10

  const queryKey = computed(() => [
    'similar-positions',
    fen.value,
    k,
  ])

  const {
    data,
    error,
    isLoading,
    isFetching,
  } = useQuery(
    {
      queryKey,
      queryFn: async (): Promise<SimilarPositionMatch[]> => {
        if (!fen.value) return []
        const result = await ipcService.send('positions:findSimilar', {
          fen: fen.value,
          k,
        })
        return result.matches
      },
      enabled: computed(() => Boolean(fen.value)),
    },
    queryClient,
  )

  const matches = computed(() => data.value ?? [])

  return {
    matches,
    error,
    isLoading,
    isFetching,
  }
}
