import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import { getStockfish } from 'src/services/engine/manager'
import { AnalysisService } from 'src/services/engine/analysis/AnalysisService'
import type { PositionAnalysis } from 'src/services/engine/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'engine:analyzeGame': {
      request: {
        moves: string[]
        startFen?: string
        depth?: number
        timeMs?: number
      }
      response: {
        positions: PositionAnalysis[]
      }
    }
  }
}

export class EngineAnalyzeGameHandler extends IpcHandler {
  static readonly channel = 'engine:analyzeGame' as const

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{
      moves: string[]
      startFen?: string
      depth?: number
      timeMs?: number
    }>
  ): Promise<
    IpcResponse<{
      positions: PositionAnalysis[]
    }>
  > {
    if (!request.params?.moves || !Array.isArray(request.params.moves)) {
      return {
        success: false,
        error: 'Moves array is required',
      }
    }

    try {
      const { moves, startFen, depth, timeMs } = request.params
      const engine = await getStockfish()
      const analysisService = new AnalysisService(engine)

      const positions = await analysisService.analyzeGame(moves, { depth, timeMs }, startFen)

      return {
        success: true,
        data: { positions },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
