import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import { getMaia } from 'src/services/engine/manager'
import { HumanMoveService } from 'src/services/engine/analysis/HumanMoveService'
import type { HumanMovePrediction } from 'src/services/engine/types'
import type { MaiaRating } from 'src/services/engine/EngineManager'

const VALID_RATINGS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'engine:predictHumanMove': {
      request: {
        fen: string
        rating: number
        topN?: number
      }
      response: HumanMovePrediction[]
    }
  }
}

export class EnginePredictHumanMoveHandler extends IpcHandler {
  static readonly channel = 'engine:predictHumanMove' as const

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{
      fen: string
      rating: number
      topN?: number
    }>
  ): Promise<IpcResponse<HumanMovePrediction[]>> {
    if (!request.params?.fen) {
      return {
        success: false,
        error: 'FEN is required',
      }
    }

    if (!request.params.rating || !VALID_RATINGS.includes(request.params.rating)) {
      return {
        success: false,
        error: `Rating must be one of: ${VALID_RATINGS.join(', ')}`,
      }
    }

    try {
      const { fen, rating, topN = 1 } = request.params
      const engine = await getMaia(rating)
      const humanMoveService = new HumanMoveService()
      humanMoveService.registerEngine(rating as MaiaRating, engine)

      const predictions = await humanMoveService.predictMove(
        fen,
        rating as MaiaRating,
        topN
      )

      return {
        success: true,
        data: predictions,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
