import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import {
  PlatformAccountData,
  PlatformAccountModel,
  PlatformType,
} from 'src/database/platform-account'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import type { EventBus } from 'src/events'
import '../events'

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

  constructor(
    private db: Database.Database,
    private bus: EventBus,
  ) {
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

    const account = PlatformAccountModel.create(this.db, request.params)

    this.bus.emit('platform:account:created', {
      username: request.params.platformUsername,
      platform: request.params.platform,
    })

    return {
      success: true,
      data: account,
    }
  }
}
