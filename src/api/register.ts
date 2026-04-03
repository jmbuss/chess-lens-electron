import { IPCHandlerRegistry } from 'src/ipc/IPCHandlerRegistry'
import Database from 'better-sqlite3'
import type { EventBus } from 'src/events'
import { registerPlatformHandlers } from './platform/register'
import { registerUserHandlers } from './user/register'
import { registerChessHandlers } from './chess/register'
import { registerSyncHandlers } from './sync/register'
import { registerEngineHandlers } from './engine/register'
import { registerAnalysisHandlers } from './analysis/register'
import { registerFavoritesHandlers } from './favorites/register'

export const registerApi = ({
  ipcHandlerRegistry,
  db,
  bus,
}: {
  ipcHandlerRegistry: IPCHandlerRegistry
  db: Database.Database
  bus: EventBus
}) => {
  registerUserHandlers(ipcHandlerRegistry, db)
  registerPlatformHandlers(ipcHandlerRegistry, db)
  registerChessHandlers(ipcHandlerRegistry, db)
  registerSyncHandlers(ipcHandlerRegistry, db)
  registerEngineHandlers(ipcHandlerRegistry)
  registerAnalysisHandlers(ipcHandlerRegistry, db, bus)
  registerFavoritesHandlers(ipcHandlerRegistry, db)
}
