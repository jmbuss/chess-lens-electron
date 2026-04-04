import Database from 'better-sqlite3'
import type { EventBus } from 'src/events'
import { IPCHandlerRegistry } from 'src/ipc/IPCHandlerRegistry'
import {
  PlatformCreateHandler,
  PlatformGetByUserIdHandler,
  PlatformUpdateHandler,
} from './handlers'

export const registerPlatformHandlers = (
  ipcHandlerRegistry: IPCHandlerRegistry,
  db: Database.Database,
  bus: EventBus,
) => {
  const platformHandlers = [
    new PlatformGetByUserIdHandler(db),
    new PlatformCreateHandler(db, bus),
    new PlatformUpdateHandler(db),
  ]
  ipcHandlerRegistry.registerHandlers(...platformHandlers)
}
