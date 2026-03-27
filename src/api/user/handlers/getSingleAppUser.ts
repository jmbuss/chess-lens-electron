import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { UserData, UserModel } from 'src/database/user'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'user:getSingleAppUser': {
      request: undefined
      response: UserData
    }
  }
}

/**
 * Currently the app is only setup to support a single user.
 * This handler will return the single app user.
 */
export class UserGetSingleAppUserHandler extends IpcHandler {
  static readonly channel = 'user:getSingleAppUser' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    event: IpcMainEvent,
    request: IpcRequest<undefined>
  ): Promise<IpcResponse<UserData>> {
    const user = UserModel.findAll(this.db)
    const appUser = user.at(0)

    return {
      success: appUser != null,
      data: appUser,
    }
  }
}
