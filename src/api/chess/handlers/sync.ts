import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import { syncGames, ChessComSyncResult, syncAllGames } from 'src/services/chesscom'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'chess:sync': {
      request: {
        username: string
        monthsBack: number
        delayBetweenRequests?: number
      }
      response: ChessComSyncResult
    }
  }
}

export class ChessSyncHandler extends IpcHandler {
  static readonly channel = 'chess:sync' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{
      username: string
      monthsBack: number
      delayBetweenRequests?: number
    }>
  ): Promise<IpcResponse<ChessComSyncResult>> {
    if (!request.params) {
      return {
        success: false,
        error: 'No parameters provided',
      }
    }

    const { username, monthsBack, delayBetweenRequests } = request.params

    if (!username || typeof username !== 'string') {
      return {
        success: false,
        error: 'Username is required',
      }
    }

    if (!monthsBack || typeof monthsBack !== 'number' || monthsBack < 1) {
      return {
        success: false,
        error: 'monthsBack must be a positive number',
      }
    }

    try {
      const result = await syncGames(this.db, {
        username,
        monthsBack,
        delayBetweenRequests,
      })

      // console.log('syncAllGames', username)

      // const result = await syncAllGames(this.db, username)

      return {
        success: true,
        data: result,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        error: `Sync failed: ${errorMessage}`,
      }
    }
  }
}
