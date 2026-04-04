import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { ChessGameModel } from 'src/database/chess'
import type { ChessGameDataWithAnalysis } from 'src/database/chess/types'
import { GamePositionsModel } from 'src/database/game-positions'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'chess:getGamesByPositionFen': {
      request: { fen: string; excludeGameId?: string }
      response: ChessGameDataWithAnalysis[]
    }
  }
}

export class ChessGetGamesByPositionFenHandler extends IpcHandler {
  static readonly channel = 'chess:getGamesByPositionFen' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ fen: string; excludeGameId?: string }>
  ): Promise<IpcResponse<ChessGameDataWithAnalysis[]>> {
    if (!request.params?.fen || typeof request.params.fen !== 'string') {
      return { success: false, error: 'fen is required' }
    }

    const { fen, excludeGameId } = request.params
    let ids = GamePositionsModel.findGamesByFen(this.db, fen)
    if (excludeGameId) {
      ids = ids.filter(id => id !== excludeGameId)
    }

    return {
      success: true,
      data: ChessGameModel.findByIdsWithAnalysisStatus(this.db, ids),
    }
  }
}
