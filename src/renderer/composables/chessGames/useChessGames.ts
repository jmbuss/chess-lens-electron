import { useQuery } from '@tanstack/vue-query'
import { ipcService } from 'src/ipc/renderer'
import { queryClient } from 'src/renderer/query/queryClient'
import type { ChessGame, ChessGameDataWithAnalysis } from 'src/database/chess/types'

export const CHESS_GAMES_QUERY_KEY = ['chess-games'] as const

export interface ChessGameWithAnalysis extends ChessGame {
  analysisStatus: 'UNANALYZED' | 'PENDING' | 'ANALYZING' | 'COMPLETE' | null
}

export const mapRow = (data: ChessGameDataWithAnalysis): ChessGameWithAnalysis => ({
  ...data,
  startTime: data.startTime ? new Date(data.startTime) : undefined,
  endTime: data.endTime ? new Date(data.endTime) : undefined,
  importedAt: new Date(data.importedAt),
  analysisStatus: data.analysisStatus,
})

export const getChessGames = async (): Promise<ChessGameWithAnalysis[]> => {
  const games = await ipcService.send('chess:getAll', undefined)
  return games.map(mapRow)
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
