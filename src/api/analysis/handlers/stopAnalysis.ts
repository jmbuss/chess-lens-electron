import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import type { AnalysisOrchestrator } from 'src/services/analysis/AnalysisOrchestrator'

interface StopAnalysisParams {
  gameId: string
}

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:stopAnalysis': {
      request: StopAnalysisParams
      response: { gameId: string }
    }
  }
}

export class StopAnalysisHandler extends IpcHandler {
  static readonly channel = 'analysis:stopAnalysis' as const

  constructor(private orchestrator: AnalysisOrchestrator) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<StopAnalysisParams>,
  ): Promise<IpcResponse<{ gameId: string }>> {
    const { gameId } = request.params ?? {}
    if (!gameId) {
      return { success: false, error: 'gameId is required' }
    }

    // Stop the active coordinator for this game and re-evaluate the queue so
    // the orchestrator can pick up the next pending game automatically.
    await this.orchestrator.stopGame(gameId)

    return { success: true, data: { gameId } }
  }
}
