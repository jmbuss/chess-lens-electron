import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { ChessGameData, ChessGameModel } from 'src/database/chess'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'chess:getAll': {
      request: void
      response: ChessGameData[]
    }
  }
}

export class ChessGetAllHandler extends IpcHandler {
  static readonly channel = 'chess:getAll' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    _request: IpcRequest<void>
  ): Promise<IpcResponse<ChessGameData[]>> {
    return {
      success: true,
      data: ChessGameModel.findAll(this.db),
    }
  }
}
