import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import { GameCoordinator } from 'src/services/analysis/GameCoordinator'
import { GameCoordinatorRegistry } from '../GameCoordinatorRegistry'
import type { AnalysisPreset, AnalysisNode, GameFSMState } from 'src/database/analysis/types'

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

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    event: IpcMainEvent,
    request: IpcRequest<{ gameId: string; pgn: string; preset: AnalysisPreset; userRating?: number }>,
  ): Promise<IpcResponse<{ gameId: string }>> {
    if (!request.params?.gameId || !request.params?.pgn || !request.params?.preset) {
      return { success: false, error: 'gameId, pgn, and preset are required' }
    }

    const { gameId, pgn, preset, userRating } = request.params

    // Engines are global singletons — only one coordinator can use them at a
    // time. Stop and drain every running coordinator before starting a new one
    // so there is no contention over Stockfish / Maia.
    await GameCoordinatorRegistry.stopAll()

    const coordinator = new GameCoordinator(
      this.db,
      event.sender,
      gameId,
      pgn,
      preset,
      userRating,
    )

    coordinator.initialize()

    // Register before start() so navigate events from other handlers
    // can reach the coordinator as soon as the actor is running.
    GameCoordinatorRegistry.register(gameId, coordinator)

    coordinator.start().catch((err) => {
      console.error('[analysis:analyzeGame] Coordinator error:', err)
      if (!event.sender.isDestroyed()) {
        event.sender.send('analysis:game-state-update', {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })

    return { success: true, data: { gameId } }
  }
}
