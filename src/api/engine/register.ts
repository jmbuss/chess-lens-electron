import { IPCHandlerRegistry } from 'src/ipc/IPCHandlerRegistry'
import {
  EngineAnalyzeHandler,
  EngineAnalyzeGameHandler,
  EngineClassifyMovesHandler,
  EnginePredictHumanMoveHandler,
  EngineStatusHandler,
  EngineStopHandler,
} from './handlers'

export const registerEngineHandlers = (ipcHandlerRegistry: IPCHandlerRegistry) => {
  const engineHandlers = [
    new EngineAnalyzeHandler(),
    new EngineAnalyzeGameHandler(),
    new EngineClassifyMovesHandler(),
    new EnginePredictHumanMoveHandler(),
    new EngineStatusHandler(),
    new EngineStopHandler(),
  ]
  ipcHandlerRegistry.registerHandlers(...engineHandlers)
}
