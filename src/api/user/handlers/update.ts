import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { UserData, UserModel } from 'src/database/user'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'user:update': {
      request: { id: number; updates: Partial<Omit<UserData, 'id' | 'createdAt'>> }
      response: UserData | null
    }
  }
}

export class UserUpdateHandler extends IpcHandler {
  static readonly channel = 'user:update' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    event: IpcMainEvent,
    request: IpcRequest<{ id: number; updates: Partial<Omit<UserData, 'id' | 'createdAt'>> }>
  ): Promise<IpcResponse<UserData | null>> {
    const user = UserModel.update(this.db, request.params!.id, request.params!.updates)
    return {
      success: true,
      data: user,
    }
  }
}
