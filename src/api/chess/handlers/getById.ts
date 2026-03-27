import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { ChessGameData, ChessGameModel } from 'src/database/chess'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'chess:getById': {
      request: { id: string }
      response: ChessGameData | null
    }
  }
}

export class ChessGetByIdHandler extends IpcHandler {
  static readonly channel = 'chess:getById' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ id: string }>
  ): Promise<IpcResponse<ChessGameData | null>> {
    if (!request.params) {
      return {
        success: false,
        error: 'No parameters provided',
      }
    }

    const { id } = request.params

    if (!id || typeof id !== 'string') {
      return {
        success: false,
        error: 'Game ID is required',
      }
    }

    const game = ChessGameModel.findById(this.db, id)

    return {
      success: true,
      data: game,
    }
  }
}
