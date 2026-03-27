import { IPCHandlerRegistry } from 'src/ipc/IPCHandlerRegistry'
import Database from 'better-sqlite3'
import {
  AnalyzeGameHandler,
  GetGameAnalysisHandler,
  AddVariationHandler,
  StudyPositionHandler,
  StopAnalysisHandler,
} from './handlers'

export const registerAnalysisHandlers = (
  ipcHandlerRegistry: IPCHandlerRegistry,
  db: Database.Database,
) => {
  const handlers = [
    new AnalyzeGameHandler(db),
    new GetGameAnalysisHandler(db),
    new AddVariationHandler(db),
    new StudyPositionHandler(),
    new StopAnalysisHandler(),
  ]
  ipcHandlerRegistry.registerHandlers(...handlers)
}
