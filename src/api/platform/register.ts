import Database from 'better-sqlite3'
import { IPCHandlerRegistry } from 'src/ipc/IPCHandlerRegistry'
import {
  PlatformCreateHandler,
  PlatformGetByUserIdHandler,
  PlatformUpdateHandler,
} from './handlers'

export const registerPlatformHandlers = (
  ipcHandlerRegistry: IPCHandlerRegistry,
  db: Database.Database
) => {
  const platformHandlers = [
    new PlatformGetByUserIdHandler(db),
    new PlatformCreateHandler(db),
    new PlatformUpdateHandler(db),
  ]
  ipcHandlerRegistry.registerHandlers(...platformHandlers)
}
