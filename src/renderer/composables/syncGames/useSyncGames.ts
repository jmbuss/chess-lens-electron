import { ipcService } from 'src/ipc/renderer'
import { onMounted, onUnmounted, ref } from 'vue'
import { usePlatforms } from '../platforms/usePlatforms'
import type { SyncProgress } from 'src/services/sync/types'
import type { ChessGameDataWithAnalysis } from 'src/database/chess/types'
import { queryClient } from 'src/renderer/query/queryClient'
import {
  CHESS_GAMES_QUERY_KEY,
  mapRow,
  type ChessGameWithAnalysis,
} from '../chessGames/useChessGames'

export const useSyncGames = () => {
  const status = ref<SyncProgress | null>(null)
  const error = ref<string | null>(null)
  const isLoading = ref(false)
  const isError = ref(false)
  const isSuccess = ref(false)

  const { platforms } = usePlatforms()

  const startSync = async () => {
    isLoading.value = true
    error.value = null
    isSuccess.value = false
    status.value = null
    try {
      for (const { platform, platformUsername: username } of platforms.value) {
        console.log('starting sync for', username, platform)
        const response = await ipcService.send('sync:start', { username, platform })
        status.value = response
      }
    } catch (error) {
      // error.value = error instanceof Error ? error.message : 'Unknown error'
    }
    isLoading.value = false
  }

  const pauseSync = async () => {
    for (const { platform, platformUsername: username } of platforms.value) {
      await ipcService.send('sync:pause', { username, platform })
    }
  }

  const resumeSync = async () => {
    for (const { platform, platformUsername: username } of platforms.value) {
      await ipcService.send('sync:resume', { username, platform })
    }
  }

  const handleProgress = (progress: SyncProgress) => {
    status.value = progress
    isLoading.value = progress.status === 'in_progress'
    error.value = progress.error || null

    if (progress.status !== 'in_progress') {
      queryClient.invalidateQueries({ queryKey: CHESS_GAMES_QUERY_KEY })
    }
  }

  const handleGamesAdded = (games: ChessGameDataWithAnalysis[]) => {
    if (!games.length) return

    const mapped = games.map(mapRow)

    queryClient.setQueryData<ChessGameWithAnalysis[]>(
      [...CHESS_GAMES_QUERY_KEY],
      (old) => {
        if (!old) return mapped

        const existingIds = new Set(old.map(g => g.id))
        const newGames = mapped.filter(g => !existingIds.has(g.id))
        if (newGames.length === 0) return old

        const merged = [...old, ...newGames]
        merged.sort((a, b) => {
          const aTime = a.startTime?.getTime() ?? 0
          const bTime = b.startTime?.getTime() ?? 0
          return bTime - aTime
        })
        return merged
      },
    )
  }

  onMounted(() => {
    ipcService.onPush('sync:progress', handleProgress)
    ipcService.onPush('sync:games-added', handleGamesAdded)
  })

  onUnmounted(() => {
    ipcService.offPush('sync:progress', handleProgress)
    ipcService.offPush('sync:games-added', handleGamesAdded)
  })

  return {
    status,
    error,
    isLoading,
    isError,
    isSuccess,
    startSync,
    pauseSync,
    resumeSync,
  }
}
