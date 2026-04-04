import { IPCHandlerRegistry } from 'src/ipc/IPCHandlerRegistry'
import Database from 'better-sqlite3'
import type { EventBus } from 'src/events'
import type { AnalysisOrchestrator } from 'src/services/analysis/AnalysisOrchestrator'
import type { PositionQueueManager } from 'src/services/analysis/PositionQueueManager'
import {
  GetGameAnalysisHandler,
  PrioritizeGameHandler,
  PrioritizePositionHandler,
  GamePositionPrioritizeHandler,
  MutatePgnHandler,
  ReanalyzeGameHandler,
} from './handlers'

export const registerAnalysisHandlers = (
  ipcHandlerRegistry: IPCHandlerRegistry,
  db: Database.Database,
  bus: EventBus,
  orchestrator: AnalysisOrchestrator,
  positionQueueManager: PositionQueueManager,
) => {
  const handlers = [
    new GetGameAnalysisHandler(db),
    new PrioritizeGameHandler(db, bus, positionQueueManager),
    new PrioritizePositionHandler(db, bus),
    new GamePositionPrioritizeHandler(db, bus),
    new MutatePgnHandler(db, bus),
    new ReanalyzeGameHandler(db, bus),
  ]
  ipcHandlerRegistry.registerHandlers(...handlers)
}
