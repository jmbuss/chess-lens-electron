import { useQuery } from '@tanstack/vue-query'
import { ipcService } from 'src/ipc/renderer'
import { queryClient } from 'src/renderer/query/queryClient'
import { computed, MaybeRef, ref, toValue } from 'vue'
import { ChessGame, ChessGameData } from 'src/database/chess/types'

const createChessGameQueryKey = (gameId: string) => ['chess-game', gameId] as const

/**
 * Maps ChessGameData (database format with string dates) to ChessGame (runtime format with Date objects)
 */
const mapChessGameDataToChessGame = (data: ChessGameData): ChessGame => {
  return {
    ...data,
    startTime: data.startTime ? new Date(data.startTime) : undefined,
    endTime: data.endTime ? new Date(data.endTime) : undefined,
    importedAt: new Date(data.importedAt),
  }
}

export const getChessGame = async (gameId: string): Promise<ChessGame | null> => {
  const chessGameData = await ipcService.send('chess:getById', { id: gameId })
  if (!chessGameData) {
    return null
  }
  return mapChessGameDataToChessGame(chessGameData)
}

export const useChessGame = ({ gameId }: { gameId: MaybeRef<string> }) => {
  const chessGameQueryKey = computed(() => createChessGameQueryKey(toValue(gameId)))
  const {
    data: chessGame,
    error: chessGameError,
    isError: isChessGameError,
    isLoading: isChessGameLoading,
    isFetching: isChessGameFetching,
    isRefetching: isChessGameRefetching,
  } = useQuery(
    {
      queryKey: chessGameQueryKey,
      queryFn: ({ queryKey: [_, gameId] }) => getChessGame(gameId),
    },
    queryClient
  )

  return {
    chessGame,
    chessGameError,
    isChessGameError,
    isChessGameLoading,
    isChessGameFetching,
    isChessGameRefetching,
  }
}
