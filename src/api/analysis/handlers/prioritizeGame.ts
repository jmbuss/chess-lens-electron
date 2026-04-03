import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import type { EventBus } from 'src/events'
import { GameAnalysisQueueModel } from 'src/database/analysis-queue/GameAnalysisQueueModel'
import { PositionAnalysisModel } from 'src/database/analysis-queue/PositionAnalysisModel'
import { buildConfigHash } from 'src/services/analysis/PositionQueueManager'
import { ANALYSIS_PRESETS } from 'src/database/analysis/types'
import type { AnalysisModeConfig } from 'src/database/analysis/types'

import '../../services/analysis/events'

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

    // 1. Bump the game itself to the highest priority
    GameAnalysisQueueModel.updatePriority(this.db, gameId, 1)

    // 2. Lift all positions for this game to priority 2 (if currently lower urgency)
    PositionAnalysisModel.updatePriorityForGame(this.db, gameId, configHash, 2)

    // 3. Boost the currently-viewed position to priority 1
    PositionAnalysisModel.updatePriority(this.db, currentFen, configHash, 1)

    // 4. Notify downstream services
    this.bus.emit('game:queue:updated', { reason: 'priority_changed' })
    this.bus.emit('position:queue:updated', { reason: 'priority_changed' })

    return { success: true, data: { success: true } }
  }
}
