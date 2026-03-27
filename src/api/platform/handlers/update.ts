import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { PlatformAccountData, PlatformAccountModel } from 'src/database/platform-account'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'platform:update': {
      request: {
        id: number
        updates: Partial<Omit<PlatformAccountData, 'id' | 'userId' | 'createdAt'>>
      }
      response: PlatformAccountData | null
    }
  }
}

export class PlatformUpdateHandler extends IpcHandler {
  static readonly channel = 'platform:update' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{
      id: number
      updates: Partial<Omit<PlatformAccountData, 'id' | 'userId' | 'createdAt'>>
    }>
  ): Promise<IpcResponse<PlatformAccountData | null>> {
    if (!request.params) {
      return {
        success: false,
        error: 'No parameters provided',
      }
    }

    const platform = PlatformAccountModel.update(this.db, request.params.id, request.params.updates)
    return {
      success: true,
      data: platform,
    }
  }
}
