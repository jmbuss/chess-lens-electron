import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import type { EventBus } from 'src/events'
import { GameAnalysisQueueModel } from 'src/database/analysis-queue/GameAnalysisQueueModel'
import type { AnalysisPreset, AnalysisNode, GameFSMState } from 'src/database/analysis/types'

import '../../../services/analysis/events'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:analyzeGame': {
      request: { gameId: string; pgn: string; preset: AnalysisPreset; userRating?: number }
      response: { gameId: string }
    }
    /**
     * Pushed once per FSM state transition for the game-level machine.
     */
    'analysis:game-state-update': {
      request: never
      response: {
        gameId: string
        gameFsmState: GameFSMState
      }
    }
    /**
     * Pushed once per completed analysis node (after NAG classification).
     * Carries the full enriched node so the renderer can patch its cache.
     */
    'analysis:node-update': {
      request: never
      response: {
        gameId: string
        nodeId: number
        ply: number
        node: Omit<AnalysisNode, 'children'>
        gameFsmState: GameFSMState
      }
    }
  }
}

export class AnalyzeGameHandler extends IpcHandler {
  static readonly channel = 'analysis:analyzeGame' as const

  constructor(
    private db: Database.Database,
    private bus: EventBus,
  ) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ gameId: string; pgn: string; preset: AnalysisPreset; userRating?: number }>,
  ): Promise<IpcResponse<{ gameId: string }>> {
    if (!request.params?.gameId || !request.params?.preset) {
      return { success: false, error: 'gameId and preset are required' }
    }

    const { gameId } = request.params

    // Enqueue the game if not already present, or bump its priority to 1 so
    // the orchestrator picks it up immediately.
    if (GameAnalysisQueueModel.exists(this.db, gameId)) {
      GameAnalysisQueueModel.updatePriority(this.db, gameId, 1)
    } else {
      GameAnalysisQueueModel.enqueue(this.db, gameId, 1)
    }

    // Signal the orchestrator to re-evaluate the queue.
    this.bus.emit('game:queue:updated', { reason: 'priority_changed', gameId })

    return { success: true, data: { gameId } }
  }
}
