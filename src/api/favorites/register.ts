import { IPCHandlerRegistry } from 'src/ipc/IPCHandlerRegistry'
import Database from 'better-sqlite3'
import { FavoritesGetAllHandler, FavoritesToggleHandler } from './handlers'

export const registerFavoritesHandlers = (
  ipcHandlerRegistry: IPCHandlerRegistry,
  db: Database.Database,
) => {
  const handlers = [
    new FavoritesGetAllHandler(db),
    new FavoritesToggleHandler(db),
  ]
  ipcHandlerRegistry.registerHandlers(...handlers)
}
