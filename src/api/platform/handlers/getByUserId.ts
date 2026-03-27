import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { PlatformAccountData, PlatformAccountModel } from 'src/database/platform-account'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'platform:getByUserId': {
      request: { userId: number }
      response: PlatformAccountData[]
    }
  }
}

export class PlatformGetByUserIdHandler extends IpcHandler {
  static readonly channel = 'platform:getByUserId' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ userId: number }>
  ): Promise<IpcResponse<PlatformAccountData[]>> {
    if (!request.params) {
      return {
        success: false,
        error: 'No parameters provided',
      }
    }

    const platforms = PlatformAccountModel.findByUserId(this.db, request.params.userId)
    return {
      success: true,
      data: platforms,
    }
  }
}
