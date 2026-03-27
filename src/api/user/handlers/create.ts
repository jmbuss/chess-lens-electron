import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { UserData, UserModel } from 'src/database/user'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'user:create': {
      request: { firstName: string; lastName: string; email: string }
      response: UserData
    }
  }
}

export class UserCreateHandler extends IpcHandler {
  static readonly channel = 'user:create' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ firstName: string; lastName: string; email: string }>
  ): Promise<IpcResponse<UserData>> {
    if (!request.params) {
      return {
        success: false,
        error: 'No parameters provided',
      }
    }

    const user = UserModel.create(this.db, request.params)
    return {
      success: true,
      data: user,
    }
  }
}
