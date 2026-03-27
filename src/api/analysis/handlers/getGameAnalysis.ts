import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import { GameAnalysisModel } from 'src/database/analysis/GameAnalysisModel'
import type { GameAnalysisData } from 'src/database/analysis/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:getGameAnalysis': {
      request: { gameId: string }
      response: GameAnalysisData | null
    }
  }
}

export class GetGameAnalysisHandler extends IpcHandler {
  static readonly channel = 'analysis:getGameAnalysis' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ gameId: string }>,
  ): Promise<IpcResponse<GameAnalysisData | null>> {
    if (!request.params?.gameId) {
      return {
        success: false,
        error: 'gameId is required',
      }
    }

    const analysis = GameAnalysisModel.findByGameId(this.db, request.params.gameId)

    return {
      success: true,
      data: analysis,
    }
  }
}
