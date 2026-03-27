import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import { getStockfish } from 'src/services/engine/manager'
import { AnalysisService } from 'src/services/engine/analysis/AnalysisService'
import type { AnalysisLine } from 'src/services/engine/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'engine:analyze': {
      request: {
        fen: string
        depth?: number
        timeMs?: number
        multipv?: number
      }
      response: {
        fen: string
        lines: AnalysisLine[]
        bestMove: string
      }
    }
    // Push channel: the main process sends incremental updates and the final result here.
    // Use ipcService.on('engine:analysis-update', cb) to receive results.
    // The payload includes `final: true` only on the last push (bestmove received).
    'engine:analysis-update': {
      request: never
      response: {
        fen: string
        lines: AnalysisLine[]
        bestMove: string
        final: boolean
      }
    }
  }
}

export class EngineAnalyzeHandler extends IpcHandler {
  static readonly channel = 'engine:analyze' as const

  async handle(
    event: IpcMainEvent,
    request: IpcRequest<{
      fen: string
      depth?: number
      timeMs?: number
      multipv?: number
    }>
  ): Promise<
    IpcResponse<{
      fen: string
      lines: AnalysisLine[]
      bestMove: string
      final: boolean
    }>
  > {
    if (!request.params?.fen) {
      const errorResponse: IpcResponse = { success: false, error: 'FEN is required' }
      event.sender.send('engine:analysis-update', errorResponse)
      return errorResponse
    }

    try {
      const { fen, depth, timeMs, multipv } = request.params
      const engine = await getStockfish()

      // If the engine is mid-analysis (e.g. a rapid FEN change), stop it and wait
      // for bestmove before starting a new search to avoid the "not ready" race condition.
      await engine.stopAndWait()

      const analysisService = new AnalysisService(engine)

      const onProgress = (lines: AnalysisLine[]) => {
        if (event.sender.isDestroyed()) return
        event.sender.send('engine:analysis-update', {
          success: true,
          data: {
            fen,
            lines,
            bestMove: lines[0]?.pv[0] ?? '',
            final: false,
          },
        })
      }

      const result = await analysisService.analyzePosition(fen, { depth, timeMs, multipv }, onProgress)

      const response: IpcResponse<{ fen: string; lines: AnalysisLine[]; bestMove: string; final: boolean }> = {
        success: true,
        data: { ...result, final: true },
      }

      event.sender.send('engine:analysis-update', response)
      return response
    } catch (error) {
      const errorResponse: IpcResponse = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
      event.sender.send('engine:analysis-update', errorResponse)
      return errorResponse
    }
  }
}
