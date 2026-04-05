import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import type { PositionIndexer } from 'src/services/analysis/vectors/PositionIndexer'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'positions:reindexGame': {
      request: { gameId: string }
      response: { success: boolean }
    }
  }
}

export class ReindexGameHandler extends IpcHandler {
  static readonly channel = 'positions:reindexGame' as const

  constructor(private positionIndexer: PositionIndexer) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ gameId: string }>,
  ): Promise<IpcResponse<{ success: boolean }>> {
    const p = request.params
    if (!p?.gameId) {
      return { success: false, error: 'gameId is required' }
    }

    try {
      this.positionIndexer.reindexGame(p.gameId)
      return { success: true, data: { success: true } }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  }
}
