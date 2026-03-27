import { useQuery } from '@tanstack/vue-query'
import { ipcService } from 'src/ipc/renderer'
import { queryClient } from 'src/renderer/query/queryClient'
import type { ChessGame, ChessGameData } from 'src/database/chess/types'

const CHESS_GAMES_QUERY_KEY = ['chess-games'] as const

const mapChessGameDataToChessGame = (data: ChessGameData): ChessGame => ({
  ...data,
  startTime: data.startTime ? new Date(data.startTime) : undefined,
  endTime: data.endTime ? new Date(data.endTime) : undefined,
  importedAt: new Date(data.importedAt),
})

export const getChessGames = async (): Promise<ChessGame[]> => {
  const games = await ipcService.send('chess:getAll', undefined)
  return games.map(mapChessGameDataToChessGame)
}

export const useChessGames = () => {
  const {
    data: chessGames,
    error: chessGamesError,
    isLoading: isChessGamesLoading,
    isFetching: isChessGamesFetching,
    isRefetching: isChessGamesRefetching,
  } = useQuery(
    {
      queryKey: CHESS_GAMES_QUERY_KEY,
      queryFn: getChessGames,
    },
    queryClient
  )

  return {
    chessGames,
    chessGamesError,
    isChessGamesLoading,
    isChessGamesFetching,
    isChessGamesRefetching,
  }
}
