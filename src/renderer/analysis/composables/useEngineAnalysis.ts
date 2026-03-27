import { computed, MaybeRef, toValue } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { queryClient } from 'src/renderer/query/queryClient'
import { ipcService } from 'src/ipc/renderer'
import type { IpcResponse } from 'src/ipc/types'
import type { AnalysisLine } from 'src/services/engine/types'

export interface EngineAnalysisResult {
  fen: string
  lines: AnalysisLine[]
  bestMove: string
  final: boolean
}

const TOP_N = 6
const MOVE_TIME_MS = 5000

export const useEngineAnalysis = (fen: MaybeRef<string>) => {
  const queryKey = computed(() => ['engine-analysis', toValue(fen)] as const)

  const { data, isFetching, isError, error } = useQuery({
    queryKey,
    queryFn: ({ queryKey: [, fenValue], signal }) => {
      return new Promise<EngineAnalysisResult>((resolve, reject) => {
        const onUpdate = (response: IpcResponse<EngineAnalysisResult>) => {
          // Ignore updates meant for a different FEN
          if (response.data?.fen && response.data.fen !== fenValue) return

          if (response.success && response.data) {
            // Push intermediate depth results into the cache so the UI updates live
            queryClient.setQueryData(['engine-analysis', fenValue], response.data)
            console.log('response.data', response.data)

            if (response.data.final) {
              ipcService.off('engine:analysis-update', onUpdate)
              resolve(response.data)
            }
          } else {
            ipcService.off('engine:analysis-update', onUpdate)
            reject(new Error(response.error ?? 'Analysis failed'))
          }
        }

        // When TanStack Query cancels this query (FEN changed or unmount), stop the engine
        signal.addEventListener('abort', () => {
          ipcService.off('engine:analysis-update', onUpdate)
          ipcService.send('engine:stop').catch(() => {})
          reject(new DOMException('Analysis aborted', 'AbortError'))
        })

        ipcService.on('engine:analysis-update', onUpdate)
        ipcService.emit('engine:analyze', { fen: fenValue as string, multipv: TOP_N, timeMs: MOVE_TIME_MS })
      })
    },
    // Only cache completed (final) analyses indefinitely. Intermediate results
    // (final: false) get staleTime: 0 so revisiting a FEN that was navigated away
    // from mid-analysis correctly triggers a fresh search rather than serving
    // a stale partial result.
    staleTime: (query) => (query.state.data as EngineAnalysisResult | undefined)?.final === true ? Infinity : 0,
    // Keep unused entries in memory for 30 minutes
    gcTime: 1000 * 60 * 30,
    retry: false,
    enabled: computed(() => !!toValue(fen)),
  }, queryClient)

  const lines = computed(() => data.value?.lines ?? [])
  const bestMove = computed(() => data.value?.bestMove ?? null)

  return {
    data,
    lines,
    bestMove,
    // isFetching stays true for the full analysis duration (including intermediate updates),
    // whereas isLoading flips to false once the first setQueryData call populates the cache.
    isLoading: isFetching,
    isError,
    error,
  }
}
