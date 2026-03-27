import type { IPCHandlerRegistry } from '../../ipc/IPCHandlerRegistry'
import type Database from 'better-sqlite3'
import {
  SyncStartHandler,
  SyncStatusHandler,
  SyncPauseHandler,
  SyncResumeHandler,
  SyncQueueHandler,
  SyncRetryFailedHandler,
} from './handlers'

export const registerSyncHandlers = (
  ipcHandlerRegistry: IPCHandlerRegistry,
  db: Database.Database
) => {
  const syncHandlers = [
    new SyncStartHandler(db),
    new SyncStatusHandler(db),
    new SyncPauseHandler(db),
    new SyncResumeHandler(db),
    new SyncQueueHandler(db),
    new SyncRetryFailedHandler(db),
  ]
  ipcHandlerRegistry.registerHandlers(...syncHandlers)
}
