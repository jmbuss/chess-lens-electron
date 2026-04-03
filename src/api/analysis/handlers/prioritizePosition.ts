import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import type { EventBus } from 'src/events'
import { PositionAnalysisModel } from 'src/database/analysis-queue/PositionAnalysisModel'
import { buildConfigHash } from 'src/services/analysis/PositionQueueManager'
import { ANALYSIS_PRESETS } from 'src/database/analysis/types'
import type { AnalysisModeConfig } from 'src/database/analysis/types'

import '../../services/analysis/events'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'position:prioritize': {
      request: { fen: string }
      response: { success: boolean }
    }
  }
}

export class PrioritizePositionHandler extends IpcHandler {
  static readonly channel = 'position:prioritize' as const

  constructor(
    private db: Database.Database,
    private bus: EventBus,
  ) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ fen: string }>,
  ): Promise<IpcResponse<{ success: boolean }>> {
    const p = request.params
    if (!p?.fen) {
      return { success: false, error: 'fen is required' }
    }

    const config: AnalysisModeConfig = {
      mode: 'pipeline',
      preset: 'fast',
      ...ANALYSIS_PRESETS.fast,
    }
    const configHash = buildConfigHash(config)

    PositionAnalysisModel.updatePriority(this.db, p.fen, configHash, 1)
    this.bus.emit('position:queue:updated', { reason: 'priority_changed' })

    return { success: true, data: { success: true } }
  }
}
