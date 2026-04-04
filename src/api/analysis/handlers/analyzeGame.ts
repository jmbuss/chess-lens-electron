import '../../../services/analysis/events'
import type { GameFSMState, PositionAnalysis } from 'src/database/analysis/types'

/**
 * Channel type declarations kept for backward compatibility.
 * The AnalyzeGameHandler class has been removed — game analysis is started
 * via game:prioritize. Push channels are replaced by game:analysis:updated.
 */
declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:game-state-update': {
      request: never
      response: {
        gameId: string
        gameFsmState: GameFSMState
      }
    }
    'analysis:position-update': {
      request: never
      response: {
        gameId: string
        fen: string
        position: PositionAnalysis
        gameFsmState: GameFSMState
      }
    }
    'game:analysis:updated': {
      request: never
      response: {
        gameId: string
      }
    }
  }
}
