import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import type { EventBus } from 'src/events'
import { GameAnalysisQueueModel } from 'src/database/analysis-queue/GameAnalysisQueueModel'
import { PositionAnalysisModel } from 'src/database/analysis-queue/PositionAnalysisModel'
import { buildConfigHash } from 'src/services/analysis/PositionQueueManager'
import { ChessGameModel } from 'src/database/chess/model'
import { ANALYSIS_PRESETS } from 'src/database/analysis/types'
import type { AnalysisModeConfig } from 'src/database/analysis/types'
import { parseGameTree, collectAllFens } from 'src/utils/chess/GameTree'
import { gamePlayedAtIso } from 'src/database/isoTimestamps'

import '../../../services/analysis/events'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'game:reanalyze': {
      request: { gameId: string }
      response: { success: boolean }
    }
  }
}

export class ReanalyzeGameHandler extends IpcHandler {
  static readonly channel = 'game:reanalyze' as const

  constructor(
    private db: Database.Database,
    private bus: EventBus,
  ) {
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

    const { gameId } = p

    const config: AnalysisModeConfig = {
      mode: 'pipeline',
      preset: 'fast',
      ...ANALYSIS_PRESETS.fast,
    }
    const configHash = buildConfigHash(config)

    const game = ChessGameModel.findById(this.db, gameId)
    if (!game) {
      return { success: false, error: 'Game not found' }
    }

    // 1. Collect every FEN in the game's PGN
    const fens: string[] = []
    if (game.pgn) {
      const { root } = parseGameTree(game.pgn)
      fens.push(...collectAllFens(root).map(f => f.fen))
    }

    // 2. Reset all cached position results for this game so they re-run
    PositionAnalysisModel.resetByFens(this.db, fens, configHash)

    // 3. Reset the game queue row (clears aggregates, marks pending, priority 1)
    const sortAt = gamePlayedAtIso(game)
    if (GameAnalysisQueueModel.exists(this.db, gameId)) {
      GameAnalysisQueueModel.resetForReanalysis(this.db, gameId, sortAt)
    } else {
      GameAnalysisQueueModel.enqueue(this.db, gameId, 1, sortAt)
    }

    // 4. Wake the orchestrator
    this.bus.emit('game:queue:updated', { reason: 'priority_changed', gameId })

    return { success: true, data: { success: true } }
  }
}
