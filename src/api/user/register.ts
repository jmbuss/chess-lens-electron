import { IPCHandlerRegistry } from 'src/ipc/IPCHandlerRegistry'
import Database from 'better-sqlite3'
import { UserCreateHandler, UserGetSingleAppUserHandler, UserUpdateHandler } from './handlers'

export const registerUserHandlers = (
  ipcHandlerRegistry: IPCHandlerRegistry,
  db: Database.Database
) => {
  const userHandlers = [
    new UserGetSingleAppUserHandler(db),
    new UserCreateHandler(db),
    new UserUpdateHandler(db),
  ]
  ipcHandlerRegistry.registerHandlers(...userHandlers)
}
