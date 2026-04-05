import type Database from 'better-sqlite3'
import type { EventBus } from '../../../events'
import type { PositionOutput } from '../machines/positionMachine'
import type { NodeResult } from 'src/database/analysis/types'
import { NAG } from 'src/services/engine/types'
import type { PositionIndexInsertRow, IndexReason, VectorInsertRow } from 'src/database/vectors/types'
import { PositionIndexModel } from 'src/database/vectors/PositionIndexModel'
import { VectorModel } from 'src/database/vectors/VectorModel'
import { PositionAnalysisModel } from 'src/database/analysis-queue'
import { GameAnalysisQueueModel } from 'src/database/analysis-queue'
import { ChessGameModel } from 'src/database/chess/model'
import { parseGameTree, collectAllFens } from 'src/utils/chess/GameTree'
import { buildPositionalVector } from './VectorBuilder'
import { buildConfigHash } from '../PositionQueueManager'
import { ANALYSIS_PRESETS } from 'src/database/analysis/types'
import './events'

function getActiveConfigHash(): string {
  return buildConfigHash({ mode: 'pipeline', preset: 'fast', ...ANALYSIS_PRESETS.fast })
}

/**
 * Event-driven service that indexes interesting positions into vector tables
 * after a game's analysis completes. Listens to `game:analysis:complete`.
 */
export class PositionIndexer {
  constructor(
    private db: Database.Database,
    private bus: EventBus,
  ) {
    this.bus.on('game:analysis:complete', (p) => this.reindexGame(p.gameId))
  }

  reindexGame(gameId: string): void {
    try {
      const game = ChessGameModel.findById(this.db, gameId)
      if (!game?.pgn) return

      const { root } = parseGameTree(game.pgn)
      const allFenEntries = collectAllFens(root)
      const allFens = allFenEntries.map(f => f.fen)

      const configHash = getActiveConfigHash()
      const positionRows = PositionAnalysisModel.findAllByFens(this.db, allFens, configHash)
      const positionByFen = new Map(positionRows.map(r => [r.fen, r]))

      const queueRow = GameAnalysisQueueModel.findByGameId(this.db, gameId)
      const nodeResults: Record<string, NodeResult> = queueRow?.node_results_json
        ? JSON.parse(queueRow.node_results_json)
        : {}

      const indexRows: PositionIndexInsertRow[] = []
      const fenDataMap = new Map<number, { fen: string; posOutput: PositionOutput | null }>()

      const walkChildren = (node: typeof root, ply: number): void => {
        for (const child of node.children) {
          const childPly = ply + 1
          const data = child.data
          const fen = data.fen
          const paRow = positionByFen.get(fen)
          const nodeResult = nodeResults[fen]
          const posOutput: PositionOutput | null = paRow?.result_json
            ? JSON.parse(paRow.result_json)
            : null

          const reasons = this.classifyPosition(posOutput, nodeResult)
          if (reasons.length === 0) {
            walkChildren(child, childPly)
            continue
          }

          const reason = reasons[0]
          const er = posOutput?.engineResult ?? null

          indexRows.push({
            game_id: gameId,
            ply: childPly,
            fen,
            san: data.san ?? null,
            uci_move: data.from && data.to ? `${data.from}${data.to}${data.promotion ?? ''}` : null,
            color: data.color,
            move_number: data.moveNumber,
            nag: nodeResult?.nag != null ? String(nodeResult.nag) : null,
            eval_cp: er?.evalCp ?? null,
            eval_mate: er?.evalMate ?? null,
            wdl_win: er?.wdl?.win ?? null,
            wdl_draw: er?.wdl?.draw ?? null,
            wdl_loss: er?.wdl?.loss ?? null,
            criticality_score: nodeResult?.criticalityScore ?? null,
            phase_score: posOutput?.phaseResult?.phaseScore ?? null,
            is_best_move: nodeResult?.isBestMove ? 1 : 0,
            move_accuracy: null,
            index_reason: reason,
            opening_eco: posOutput?.phaseResult?.ecoMatch?.eco ?? null,
            opening_name: posOutput?.phaseResult?.ecoMatch?.name ?? null,
          })

          fenDataMap.set(indexRows.length - 1, { fen, posOutput })
          walkChildren(child, childPly)
        }
      }

      walkChildren(root, 0)

      if (indexRows.length === 0) {
        this.bus.emit('positions:indexed', { gameId, positionsIndexed: 0 })
        return
      }

      this.db.transaction(() => {
        const oldRows = PositionIndexModel.findByGameId(this.db, gameId)
        if (oldRows.length > 0) {
          VectorModel.deleteByPositionIndexIds(this.db, oldRows.map(r => r.id))
          PositionIndexModel.deleteByGameId(this.db, gameId)
        }

        const insertedIds = PositionIndexModel.bulkInsert(this.db, indexRows)

        const positionalVectors: VectorInsertRow[] = []

        for (let i = 0; i < insertedIds.length; i++) {
          const positionIndexId = insertedIds[i]
          const entry = fenDataMap.get(i)
          if (!entry?.posOutput) continue

          const posVec = buildPositionalVector(entry.posOutput)
          if (posVec) {
            positionalVectors.push({ positionIndexId, vector: posVec })
          }
        }

        if (positionalVectors.length > 0) {
          VectorModel.insertPositionalBatch(this.db, positionalVectors)
        }
      })()

      this.bus.emit('positions:indexed', { gameId, positionsIndexed: indexRows.length })
    } catch {
      // Best-effort indexing; DB state unchanged after rollback.
    }
  }

  private classifyPosition(
    _posOutput: PositionOutput | null,
    nodeResult: NodeResult | undefined,
  ): IndexReason[] {
    const reasons: IndexReason[] = []

    if (!nodeResult) return reasons

    if (nodeResult.nag === NAG.Blunder) {
      reasons.push('blunder')
    }

    return reasons
  }
}
