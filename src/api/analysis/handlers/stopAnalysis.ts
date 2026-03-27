import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import { GameCoordinatorRegistry } from '../GameCoordinatorRegistry'

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

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<StopAnalysisParams>,
  ): Promise<IpcResponse<{ gameId: string }>> {
    const { gameId } = request.params ?? {}
    if (!gameId) {
      return { success: false, error: 'gameId is required' }
    }

    const coordinator = GameCoordinatorRegistry.get(gameId)
    if (coordinator) {
      GameCoordinatorRegistry.clear(gameId)
      // Fire-and-forget stop: engines will drain in the background. Any in-
      // flight IPC pushes are safe because saveAndPushNode/saveAndPushGameState
      // already guard against destroyed senders.
      coordinator.stop().catch((err) => {
        console.error('[analysis:stopAnalysis] Error stopping coordinator:', err)
      })
    }

    return { success: true, data: { gameId } }
  }
}
