import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import type { EventBus } from 'src/events'
import { PositionAnalysisModel } from 'src/database/analysis-queue/PositionAnalysisModel'
import { ChessGameModel } from 'src/database/chess/model'
import { buildConfigHash } from 'src/services/analysis/PositionQueueManager'
import { ANALYSIS_PRESETS } from 'src/database/analysis/types'
import type { AnalysisModeConfig } from 'src/database/analysis/types'
import { parseGameTree, collectAllFens } from 'src/utils/chess/GameTree'

import '../../../services/analysis/events'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'game:position:prioritize': {
      request: { gameId: string; fen: string }
      response: { success: boolean }
    }
  }
}

export class GamePositionPrioritizeHandler extends IpcHandler {
  static readonly channel = 'game:position:prioritize' as const

  constructor(
    private db: Database.Database,
    private bus: EventBus,
  ) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ gameId: string; fen: string }>,
  ): Promise<IpcResponse<{ success: boolean }>> {
    const p = request.params
    if (!p?.gameId || !p.fen) {
      return { success: false, error: 'gameId and fen are required' }
    }

    const config: AnalysisModeConfig = {
      mode: 'pipeline',
      preset: 'fast',
      ...ANALYSIS_PRESETS.fast,
    }
    const configHash = buildConfigHash(config)

    const game = ChessGameModel.findById(this.db, p.gameId)
    if (!game?.pgn) {
      return { success: true, data: { success: false } }
    }

    const { root } = parseGameTree(game.pgn)
    const fenSet = new Set(collectAllFens(root).map(f => f.fen))

    PositionAnalysisModel.reprioritizeForGame(this.db, fenSet, p.fen, configHash)

    this.bus.emit('position:queue:updated', { reason: 'priority_changed' })

    return { success: true, data: { success: true } }
  }
}
