import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { GameFavoritesModel } from 'src/database/favorites'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'favorites:getAll': {
      request: undefined
      response: string[]
    }
  }
}

export class FavoritesGetAllHandler extends IpcHandler {
  static readonly channel = 'favorites:getAll' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    _request: IpcRequest<undefined>,
  ): Promise<IpcResponse<string[]>> {
    return {
      success: true,
      data: GameFavoritesModel.findAll(this.db),
    }
  }
}
