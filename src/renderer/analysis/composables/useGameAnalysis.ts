import { computed, onUnmounted, watch, type MaybeRef, toValue } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { queryClient } from 'src/renderer/query/queryClient'
import { ipcService } from 'src/ipc/renderer'
import type { IpcResponse } from 'src/ipc/types'
import type {
  GameAnalysisResponse,
  GameFSMState,
  PositionAnalysis,
  PlayerStats,
  PositionalRadarData,
} from 'src/database/analysis/types'
import { useChessGame } from 'src/renderer/composables/chessGame/useChessGame'
import { useUser } from 'src/renderer/composables/user/useUser'
import { usePlatforms } from 'src/renderer/composables/platforms/usePlatforms'

interface GameAnalysisUpdatedPayload {
  gameId: string
}

export const useGameAnalysis = (gameId: MaybeRef<string>) => {
  const queryKey = computed(() => ['game-analysis', toValue(gameId)] as const)

  const { data: gameAnalysis, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      ipcService.send('analysis:getGameAnalysis', { gameId: toValue(gameId) }),
    staleTime: Infinity,
    enabled: computed(() => !!toValue(gameId)),
  }, queryClient)

  /**
   * Tell the queue which position the user has navigated to.
   * Replaces the old studyPosition + position:prioritize calls.
   */
  const navigateToPosition = (fen: string): void => {
    ipcService.send('game:position:prioritize', { gameId: toValue(gameId), fen })
  }

  // ==================== Auto-start ====================

  const { chessGame, isChessGameLoading } = useChessGame({ gameId })
  const { user, isUserLoading } = useUser()
  const { isPlatformsLoading } = usePlatforms()

  const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

  const isPrerequisitesReady = computed(() => {
    if (isChessGameLoading.value || isUserLoading.value) return false
    if (!chessGame.value) return false
    if (user.value?.id && isPlatformsLoading.value) return false
    return true
  })

  let hasPrioritized = false

  watch(isPrerequisitesReady, async (ready) => {
    if (!ready || hasPrioritized) return
    hasPrioritized = true
    console.log('[useGameAnalysis] Prioritizing game for analysis')
    await ipcService.send('game:prioritize', {
      gameId: toValue(gameId),
      currentFen: STARTING_FEN,
    })
    queryClient.invalidateQueries({ queryKey: queryKey.value })
  }, { immediate: true })

  const reanalyzeGame = async (): Promise<void> => {
    await ipcService.send('game:reanalyze', { gameId: toValue(gameId) })
    // Allow auto-start to re-prioritize once the queue processes the reset
    hasPrioritized = false
    queryClient.invalidateQueries({ queryKey: queryKey.value })
  }

  // ==================== game:analysis:updated listener ====================

  const onGameAnalysisUpdated = (response: IpcResponse<GameAnalysisUpdatedPayload>) => {
    if (!response.success || !response.data) return
    if (response.data.gameId !== toValue(gameId)) return
    queryClient.invalidateQueries({ queryKey: queryKey.value })
  }

  ipcService.on('game:analysis:updated', onGameAnalysisUpdated)
  onUnmounted(() => {
    ipcService.off('game:analysis:updated', onGameAnalysisUpdated)
  })

  // ==================== Derived state ====================

  const analysisByFen = computed((): Map<string, PositionAnalysis> => {
    const positions = gameAnalysis.value?.positions
    if (!positions) return new Map()
    return new Map(Object.entries(positions))
  })

  const gameFsmState = computed(() => gameAnalysis.value?.gameFsmState ?? null)
  const isComplete = computed(() => gameFsmState.value === 'COMPLETE')

  const progress = computed(() => {
    const positions = gameAnalysis.value?.positions
    if (!positions) return 0
    const entries = Object.values(positions)
    if (entries.length === 0) return 0
    const completed = entries.filter(p => p.fsmState === 'NAG_COMPLETE').length
    return completed / entries.length
  })

  const whiteStats = computed((): PlayerStats | null =>
    gameAnalysis.value?.whiteStats ?? null
  )

  const blackStats = computed((): PlayerStats | null =>
    gameAnalysis.value?.blackStats ?? null
  )

  const radarData = computed((): PositionalRadarData | null =>
    gameAnalysis.value?.radarData ?? null
  )

  return {
    gameAnalysis,
    analysisByFen,
    gameFsmState,
    isComplete,
    progress,
    isLoading,
    navigateToPosition,
    reanalyzeGame,
    whiteStats,
    blackStats,
    radarData,
  }
}
