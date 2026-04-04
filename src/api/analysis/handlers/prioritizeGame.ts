import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import type { EventBus } from 'src/events'
import { GameAnalysisQueueModel } from 'src/database/analysis-queue/GameAnalysisQueueModel'
import { PositionAnalysisModel } from 'src/database/analysis-queue/PositionAnalysisModel'
import { buildConfigHash, type PositionQueueManager } from 'src/services/analysis/PositionQueueManager'
import { ChessGameModel } from 'src/database/chess/model'
import { ANALYSIS_PRESETS } from 'src/database/analysis/types'
import type { AnalysisModeConfig } from 'src/database/analysis/types'

import '../../../services/analysis/events'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'game:prioritize': {
      request: { gameId: string; currentFen: string }
      response: { success: boolean }
    }
  }
}

export class PrioritizeGameHandler extends IpcHandler {
  static readonly channel = 'game:prioritize' as const

  constructor(
    private db: Database.Database,
    private bus: EventBus,
    private positionQueueManager: PositionQueueManager,
  ) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ gameId: string; currentFen: string }>,
  ): Promise<IpcResponse<{ success: boolean }>> {
    const p = request.params
    if (!p?.gameId || !p.currentFen) {
      return { success: false, error: 'gameId and currentFen are required' }
    }

    const { gameId, currentFen } = p

    const config: AnalysisModeConfig = {
      mode: 'pipeline',
      preset: 'fast',
      ...ANALYSIS_PRESETS.fast,
    }
    const configHash = buildConfigHash(config)

    // 1. Demote all other games back to background priority 3 so the focused
    //    game is the only one at priority 1.
    GameAnalysisQueueModel.demoteOthers(this.db, gameId)

    // 2. Demote positions that don't belong to this game back to priority 3.
    //    Must run BEFORE populateFromPgn so those rows don't compete with the
    //    newly-elevated positions for this game.
    PositionAnalysisModel.demoteNonGamePositions(this.db, gameId, configHash)

    // 3. Enqueue the game if not present, otherwise bump to priority 1.
    if (GameAnalysisQueueModel.exists(this.db, gameId)) {
      GameAnalysisQueueModel.updatePriority(this.db, gameId, 1)
    } else {
      GameAnalysisQueueModel.enqueue(this.db, gameId, 1)
    }

    // 4. Populate position_analysis rows for every FEN in this game's PGN:
    //    - currentFen → priority 1 (user-focused position)
    //    - all other positions in this game → priority 2 (game-context)
    //    upsertPending only raises urgency on conflict, so the currentFen row
    //    set to 1 here is preserved when the orchestrator later calls
    //    populateFromPgn without a currentFen (which passes priority 3).
    const game = ChessGameModel.findById(this.db, gameId)
    if (game?.pgn) {
      this.positionQueueManager.populateFromPgn(game.pgn, configHash, currentFen, 2)
    }

    // 5. Notify downstream services — orchestrator re-evaluates the queue.
    this.bus.emit('game:queue:updated', { reason: 'priority_changed', gameId })

    return { success: true, data: { success: true } }
  }
}
