import { computed, MaybeRef, toValue } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { ipcService } from 'src/ipc/renderer'
import { queryClient } from 'src/renderer/query/queryClient'
import type { HumanMovePrediction } from 'src/services/engine/types'

const TOP_N = 3
const DEFAULT_RATING = 1500

const fetchHumanMoves = async (
  fen: string,
  rating: number
): Promise<HumanMovePrediction[]> => {
  return ipcService.send('engine:predictHumanMove', {
    fen,
    rating,
    topN: TOP_N,
  })
}

export const useHumanMoveAnalysis = (
  fen: MaybeRef<string>,
  rating: MaybeRef<number> = DEFAULT_RATING
) => {
  const queryKey = computed(
    () => ['human-move-analysis', toValue(fen), toValue(rating)] as const
  )

  const { data, isLoading, isError, error } = useQuery(
    {
      queryKey,
      queryFn: ({ queryKey: [, fen, rating] }) => fetchHumanMoves(fen, rating),
      enabled: computed(() => !!toValue(fen)),
    },
    queryClient
  )

  const predictions = computed(() => data.value ?? [])

  return {
    data,
    predictions,
    isLoading,
    isError,
    error,
  }
}
