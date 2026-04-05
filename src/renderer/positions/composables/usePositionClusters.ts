import { useQuery } from '@tanstack/vue-query'
import { ipcService } from 'src/ipc/renderer'
import { queryClient } from 'src/renderer/query/queryClient'
import type { PositionCluster } from 'src/services/analysis/ClusteringService'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'

export const POSITION_CLUSTERS_QUERY_KEY = ['position-clusters'] as const

/**
 * @param enabled When true (e.g. Clusters tab active), runs clustering once; cached until Re-cluster or invalidation.
 */
export const usePositionClusters = (enabled: MaybeRefOrGetter<boolean>) => {
  const {
    data,
    error,
    isPending,
    isFetching,
    refetch,
  } = useQuery(
    {
      queryKey: POSITION_CLUSTERS_QUERY_KEY,
      queryFn: async (): Promise<PositionCluster[]> => {
        const result = await ipcService.send('positions:cluster', {})
        return result.clusters
      },
      enabled: computed(() => toValue(enabled)),
      staleTime: Infinity,
    },
    queryClient,
  )

  const clusters = computed(() => data.value ?? [])

  return {
    clusters,
    error,
    isPending,
    isFetching,
    refetch,
  }
}
