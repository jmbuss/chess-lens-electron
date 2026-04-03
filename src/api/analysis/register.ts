import { IPCHandlerRegistry } from 'src/ipc/IPCHandlerRegistry'
import Database from 'better-sqlite3'
import type { EventBus } from 'src/events'
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
) => {
  const handlers = [
    new AnalyzeGameHandler(db),
    new GetGameAnalysisHandler(db),
    new AddVariationHandler(db),
    new StudyPositionHandler(),
    new StopAnalysisHandler(),
    new PrioritizeGameHandler(db, bus),
    new PrioritizePositionHandler(db, bus),
    new MutatePgnHandler(db, bus),
  ]
  ipcHandlerRegistry.registerHandlers(...handlers)
}
