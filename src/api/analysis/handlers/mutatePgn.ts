import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import type { EventBus } from 'src/events'
import { ChessGameModel } from 'src/database/chess/model'

import '../events'

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

    ChessGameModel.updatePgn(this.db, p.gameId, p.pgn)

    this.bus.emit('pgn:mutated', {
      gameId: p.gameId,
      pgn: p.pgn,
      currentFen: p.currentFen,
    })

    return { success: true, data: { success: true } }
  }
}
