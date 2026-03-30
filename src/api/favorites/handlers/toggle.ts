import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { GameFavoritesModel } from 'src/database/favorites'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'favorites:toggle': {
      request: { gameId: string }
      response: { gameId: string; isFavorite: boolean }
    }
  }
}

export class FavoritesToggleHandler extends IpcHandler {
  static readonly channel = 'favorites:toggle' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ gameId: string }>,
  ): Promise<IpcResponse<{ gameId: string; isFavorite: boolean }>> {
    if (!request.params?.gameId) {
      return { success: false, error: 'gameId is required' }
    }

    const isFavorite = GameFavoritesModel.toggle(this.db, request.params.gameId)
    return {
      success: true,
      data: { gameId: request.params.gameId, isFavorite },
    }
  }
}
