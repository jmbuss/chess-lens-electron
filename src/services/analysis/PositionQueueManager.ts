import crypto from 'node:crypto'
import type Database from 'better-sqlite3'

import type { EventBus, EventPayload } from '../../events'
import { PositionAnalysisModel } from '../../database/analysis-queue'
import { parseGameTree, collectAllFens } from '../../utils/chess/GameTree'
import { isoAtMs } from '../../database/isoTimestamps'
import type { AnalysisModeConfig } from '../../database/analysis/types'
import { ANALYSIS_PRESETS } from '../../database/analysis/types'

import './events'
import '../../api/analysis/events'

/**
 * Compute a stable 16-char hex hash of the analysis configuration.
 * Each unique (depth, timeMs, multipv) triple produces a unique key, making
 * (fen, config_hash) the natural primary key in position_analysis.
 */
export function buildConfigHash(config: AnalysisModeConfig): string {
  const key = JSON.stringify({
    depth: config.depth,
    timeMs: config.timeMs,
    multipv: config.multipv,
  })
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)
}

export class PositionQueueManager {
  constructor(
    private db: Database.Database,
    private bus: EventBus,
  ) {
    this.bus.on('pgn:mutated', (payload) => this.onPgnMutated(payload))
  }

  /**
   * Parse a PGN and upsert every FEN (mainline + variations) into
   * position_analysis. Called by the orchestrator when starting a game,
   * and by onPgnMutated when the user mutates the tree.
   */
  populateFromPgn(
    pgn: string,
    configHash: string,
    currentFen?: string,
    otherPriority: number = 3,
  ): void {
    const { root } = parseGameTree(pgn)
    const allFens = collectAllFens(root)

    const queueBaseMs = Date.now()
    const insertAll = this.db.transaction(() => {
      for (let i = 0; i < allFens.length; i++) {
        const { fen } = allFens[i]
        const priority = fen === currentFen ? 1 : otherPriority
        const queuedAt = isoAtMs(queueBaseMs + i)
        PositionAnalysisModel.upsertPending(this.db, fen, configHash, priority, queuedAt)
      }
    })

    insertAll()

    this.bus.emit('position:queue:updated', { reason: 'new_items' })
  }

  /**
   * When PGN is mutated: upsert all FENs at priority 3, then re-prioritize
   * using game:position:prioritize logic (currentFen → 1, in-PGN → 2, rest → 3).
   */
  private onPgnMutated(payload: EventPayload<'pgn:mutated'>): void {
    const configHash = this.getActiveConfigHash()

    // Upsert all FENs (INSERT OR IGNORE for new variation FENs)
    this.populateFromPgn(payload.pgn, configHash, payload.currentFen)

    // Re-prioritize: same logic as game:position:prioritize
    const { root } = parseGameTree(payload.pgn)
    const fenSet = new Set(collectAllFens(root).map(f => f.fen))
    PositionAnalysisModel.reprioritizeForGame(this.db, fenSet, payload.currentFen, configHash)

    this.bus.emit('position:queue:updated', { reason: 'priority_changed' })
  }

  private getActiveConfigHash(): string {
    const config: AnalysisModeConfig = {
      mode: 'pipeline',
      preset: 'fast',
      ...ANALYSIS_PRESETS.fast,
    }
    return buildConfigHash(config)
  }
}
