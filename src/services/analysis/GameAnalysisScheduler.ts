import type Database from 'better-sqlite3'
import type { EventBus, EventPayload } from '../../events'
import { GameAnalysisQueueModel } from '../../database/analysis-queue'
import './events'
import '../sync/events'

export class GameAnalysisScheduler {
  constructor(
    private db: Database.Database,
    private bus: EventBus,
    private options: { autoAnalyzeThresholdDays: number } = { autoAnalyzeThresholdDays: 30 },
  ) {
    this.bus.on('game:synced', (payload) => this.onGameSynced(payload))
  }

  private onGameSynced(payload: EventPayload<'game:synced'>): void {
    if (GameAnalysisQueueModel.exists(this.db, payload.gameId)) return

    const cutoff = Date.now() - this.options.autoAnalyzeThresholdDays * 86_400_000
    if (new Date(payload.playedAt).getTime() < cutoff) return

    GameAnalysisQueueModel.enqueue(this.db, payload.gameId, 3, payload.playedAt)
    this.bus.emit('game:queue:updated', { reason: 'new_items' })
  }
}
