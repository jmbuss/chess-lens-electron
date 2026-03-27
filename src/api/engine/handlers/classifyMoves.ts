import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import { getStockfish } from 'src/services/engine/manager'
import { NAGService } from 'src/services/engine/analysis/NAGService'
import type { MoveNAG } from 'src/services/engine/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'engine:classifyMoves': {
      request: {
        moves: string[]
        startFen?: string
        depth?: number
      }
      response: {
        moves: MoveNAG[]
      }
    }
  }
}

export class EngineClassifyMovesHandler extends IpcHandler {
  static readonly channel = 'engine:classifyMoves' as const

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{
      moves: string[]
      startFen?: string
      depth?: number
    }>
  ): Promise<
    IpcResponse<{
      moves: MoveNAG[]
    }>
  > {
    if (!request.params?.moves || !Array.isArray(request.params.moves)) {
      return {
        success: false,
        error: 'Moves array is required',
      }
    }

    try {
      const { moves, startFen, depth } = request.params
      const engine = await getStockfish()
      const nagService = new NAGService(engine)

      const classifications = await nagService.classifyGame(moves, { depth }, startFen)

      return {
        success: true,
        data: { moves: classifications },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
