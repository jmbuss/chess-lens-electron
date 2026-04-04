import { IPCHandlerRegistry } from 'src/ipc/IPCHandlerRegistry'
import Database from 'better-sqlite3'
import type { EventBus } from 'src/events'
import type { AnalysisOrchestrator } from 'src/services/analysis/AnalysisOrchestrator'
import type { PositionQueueManager } from 'src/services/analysis/PositionQueueManager'
import {
  AnalyzeGameHandler,
  GetGameAnalysisHandler,
  AddVariationHandler,
  StudyPositionHandler,
  StopAnalysisHandler,
  PrioritizeGameHandler,
  PrioritizePositionHandler,
  MutatePgnHandler,
} from './handlers'

export const registerAnalysisHandlers = (
  ipcHandlerRegistry: IPCHandlerRegistry,
  db: Database.Database,
  bus: EventBus,
  orchestrator: AnalysisOrchestrator,
  positionQueueManager: PositionQueueManager,
) => {
  const handlers = [
    new AnalyzeGameHandler(db, bus),
    new GetGameAnalysisHandler(db),
    new AddVariationHandler(db, orchestrator),
    new StudyPositionHandler(orchestrator),
    new StopAnalysisHandler(orchestrator),
    new PrioritizeGameHandler(db, bus, positionQueueManager),
    new PrioritizePositionHandler(db, bus),
    new MutatePgnHandler(db, bus),
  ]
  ipcHandlerRegistry.registerHandlers(...handlers)
}
