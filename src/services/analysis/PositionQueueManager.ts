import crypto from 'node:crypto'
import type Database from 'better-sqlite3'

import type { EventBus, EventPayload } from '../../events'
import { PositionAnalysisModel } from '../../database/analysis-queue'
import { parseGameTree, collectAllFens } from '../../utils/chess/GameTree'
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
   *
   * `upsertPending` only ever raises urgency on conflict — it will not demote
   * a row that is already at a higher urgency than the incoming priority.
   *
   * @param pgn           Full PGN string for the game.
   * @param configHash    SHA-256 prefix of the serialized analysis config.
   * @param currentFen    Optional FEN to set to priority 1 (user-focused).
   * @param otherPriority Priority assigned to all FENs that are not currentFen.
   *                      Pass 2 when the entire game is being user-focused so
   *                      its positions sit above background games (priority 3).
   *                      Defaults to 3 for background / orchestrator-initiated
   *                      populate calls.
   */
  populateFromPgn(
    pgn: string,
    configHash: string,
    currentFen?: string,
    otherPriority: number = 3,
  ): void {
    const { root } = parseGameTree(pgn)
    const allFens = collectAllFens(root)

    const insertAll = this.db.transaction(() => {
      for (const { fen } of allFens) {
        const priority = fen === currentFen ? 1 : otherPriority
        PositionAnalysisModel.upsertPending(this.db, fen, configHash, priority)
      }
    })

    insertAll()

    this.bus.emit('position:queue:updated', { reason: 'new_items' })
  }

  private onPgnMutated(payload: EventPayload<'pgn:mutated'>): void {
    this.populateFromPgn(payload.pgn, this.getActiveConfigHash(), payload.currentFen)
  }

  /**
   * Returns the config hash for the default analysis preset ('fast').
   * The orchestrator overrides this by passing the correct configHash
   * directly to populateFromPgn when starting a game.
   */
  private getActiveConfigHash(): string {
    const config: AnalysisModeConfig = {
      mode: 'pipeline',
      preset: 'fast',
      ...ANALYSIS_PRESETS.fast,
    }
    return buildConfigHash(config)
  }
}
