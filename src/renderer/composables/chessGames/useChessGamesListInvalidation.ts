import { onMounted, onUnmounted } from 'vue'
import { ipcService } from 'src/ipc/renderer'
import { queryClient } from 'src/renderer/query/queryClient'
import { CHESS_GAMES_QUERY_KEY } from './useChessGames'

/**
 * Subscribes to main-process pushes that mean `chess:getAll` derived fields
 * (e.g. analysis queue status) may have changed.
 */
export function useChessGamesListInvalidation(): void {
  const onInvalidate = () => {
    queryClient.invalidateQueries({ queryKey: CHESS_GAMES_QUERY_KEY })
  }

  onMounted(() => {
    ipcService.onPush('chess-games:invalidate', onInvalidate)
  })

  onUnmounted(() => {
    ipcService.offPush('chess-games:invalidate', onInvalidate)
  })
}
