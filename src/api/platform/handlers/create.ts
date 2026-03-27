import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import {
  PlatformAccountData,
  PlatformAccountModel,
  PlatformType,
} from 'src/database/platform-account'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'platform:create': {
      request: {
        userId: number
        platform: PlatformType
        platformUsername: string
      }
      response: PlatformAccountData
    }
  }
}

export class PlatformCreateHandler extends IpcHandler {
  static readonly channel = 'platform:create' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{
      userId: number
      platform: PlatformType
      platformUsername: string
    }>
  ): Promise<IpcResponse<PlatformAccountData>> {
    if (!request.params) {
      return {
        success: false,
        error: 'No parameters provided',
      }
    }

    const platform = PlatformAccountModel.create(this.db, request.params)
    return {
      success: true,
      data: platform,
    }
  }
}
