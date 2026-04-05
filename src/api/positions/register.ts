import { IPCHandlerRegistry } from 'src/ipc/IPCHandlerRegistry'
import Database from 'better-sqlite3'
import type { PositionIndexer } from 'src/services/analysis/vectors/PositionIndexer'
import {
  PositionsGetAllHandler,
  PositionsFindSimilarHandler,
  ReindexGameHandler,
  PositionsClusterHandler,
} from './handlers'

export const registerPositionsHandlers = (
  ipcHandlerRegistry: IPCHandlerRegistry,
  db: Database.Database,
  positionIndexer: PositionIndexer,
): void => {
  const handlers = [
    new PositionsGetAllHandler(db),
    new PositionsFindSimilarHandler(db),
    new ReindexGameHandler(positionIndexer),
    new PositionsClusterHandler(db),
  ]
  ipcHandlerRegistry.registerHandlers(...handlers)
}
