import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import type { EventBus } from 'src/events'
import { ChessGameModel } from 'src/database/chess/model'
import { PositionAnalysisModel } from 'src/database/analysis-queue/PositionAnalysisModel'
import { GameAnalysisQueueModel } from 'src/database/analysis-queue/GameAnalysisQueueModel'
import { parseGameTree, collectAllFens } from 'src/utils/chess/GameTree'
import { gamePlayedAtIso, isoAtMs } from 'src/database/isoTimestamps'
import { buildConfigHash } from 'src/services/analysis/PositionQueueManager'
import { ANALYSIS_PRESETS } from 'src/database/analysis/types'
import type { AnalysisModeConfig } from 'src/database/analysis/types'

import '../events'
import '../../../services/analysis/events'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'pgn:mutate': {
      request: { gameId: string; pgn: string; currentFen: string }
      response: { success: boolean }
    }
  }
}

export class MutatePgnHandler extends IpcHandler {
  static readonly channel = 'pgn:mutate' as const

  constructor(
    private db: Database.Database,
    private bus: EventBus,
  ) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ gameId: string; pgn: string; currentFen: string }>,
  ): Promise<IpcResponse<{ success: boolean }>> {
    const p = request.params
    if (!p?.gameId || !p.pgn || !p.currentFen) {
      return { success: false, error: 'gameId, pgn, and currentFen are required' }
    }

    // 1. Persist the new PGN
    ChessGameModel.updatePgn(this.db, p.gameId, p.pgn)

    // 2. Parse the full PGN and upsert all FENs at priority 3
    const config: AnalysisModeConfig = {
      mode: 'pipeline',
      preset: 'fast',
      ...ANALYSIS_PRESETS.fast,
    }
    const configHash = buildConfigHash(config)

    const { root } = parseGameTree(p.pgn)
    const allFens = collectAllFens(root)

    const queueBaseMs = Date.now()
    const insertAll = this.db.transaction(() => {
      for (let i = 0; i < allFens.length; i++) {
        const { fen } = allFens[i]
        PositionAnalysisModel.upsertPending(this.db, fen, configHash, 3, isoAtMs(queueBaseMs + i))
      }
    })
    insertAll()

    // 3. If the game was already complete, re-queue it so the coordinator
    //    picks up the new pending positions from the added variation.
    const queueRow = GameAnalysisQueueModel.findByGameId(this.db, p.gameId)
    const gameFinished = queueRow?.status === 'complete' || queueRow?.status === 'failed'
    const hasPendingPositions = PositionAnalysisModel.fetchHeadForFens(
      this.db,
      allFens.map(f => f.fen),
      configHash,
    ) != null

    if (gameFinished && hasPendingPositions) {
      GameAnalysisQueueModel.markPending(this.db, p.gameId)
      const g = ChessGameModel.findById(this.db, p.gameId)
      GameAnalysisQueueModel.updatePriority(this.db, p.gameId, 1, g ? gamePlayedAtIso(g) : undefined)
    }

    // 4. Emit pgn:mutated — the downstream handler calls
    //    game:position:prioritize logic to auto-prioritize
    this.bus.emit('pgn:mutated', {
      gameId: p.gameId,
      pgn: p.pgn,
      currentFen: p.currentFen,
    })

    // 5. If the game was re-queued, also signal the orchestrator to pick it up
    if (gameFinished && hasPendingPositions) {
      this.bus.emit('game:queue:updated', { reason: 'priority_changed', gameId: p.gameId })
    }

    return { success: true, data: { success: true } }
  }
}
