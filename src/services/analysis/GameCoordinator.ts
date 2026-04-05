import { createActor, fromPromise, toPromise } from 'xstate'
import type { WebContents } from 'electron'
import type Database from 'better-sqlite3'

import { getStockfish, getMaia, getStockfishClassicBinaryPath } from 'src/services/engine/manager'
import { VALID_MAIA_RATINGS, type MaiaRating } from 'src/services/engine/EngineManager'
import type { UCIEngine } from 'src/services/engine/UCIEngine'
import { AnalysisService } from 'src/services/engine/analysis/AnalysisService'
import { HumanMoveService } from 'src/services/engine/analysis/HumanMoveService'
import type { HumanMovePrediction } from 'src/services/engine/types'
import { PositionAnalysisModel } from 'src/database/analysis-queue'
import { GameAnalysisQueueModel } from 'src/database/analysis-queue'
import type { AnalysisModeConfig } from 'src/database/analysis/types'
import { ANALYSIS_PRESETS } from 'src/database/analysis/types'
import type { EventBus } from '../../events'

import { positionMachine } from './machines/positionMachine'
import type { EngineResult, PositionOutput } from './machines/positionMachine'
import { parseGameTree, collectAllFens } from 'src/utils/chess/GameTree'
import { ChessGameModel } from 'src/database/chess/model'

import { PhaseClassificationService } from './PhaseClassificationService'
import { PositionalFeaturesService } from './PositionalFeaturesService'
import type { PositionalFeatures, EvalTerm, EvalRawFeatures } from 'src/database/analysis/types'
import { EvalMaiaMovesService } from './EvalMaiaMovesService'
import { buildConfigHash } from './PositionQueueManager'
import { computeAndPersistAggregates } from './GameAggregateService'
import './events'

// ==================== Maia Rating Helpers ====================

function getMaiaFloorRating(userRating: number): MaiaRating {
  const floor = [...VALID_MAIA_RATINGS].reverse().find(r => r <= userRating)
  return floor ?? VALID_MAIA_RATINGS[0]
}

function getMaiaCeilingRating(userRating: number): MaiaRating {
  const ceiling = VALID_MAIA_RATINGS.find(r => r > userRating)
  return ceiling ?? VALID_MAIA_RATINGS[VALID_MAIA_RATINGS.length - 1]
}

function buildConfig(userRating?: number): AnalysisModeConfig {
  return { mode: 'pipeline', preset: 'fast', ...ANALYSIS_PRESETS.fast, userRating }
}

// ==================== Coordinator ====================

/**
 * Queue-driven worker that processes positions for a specific game.
 * Lifecycle: initialize() → start() → [position loop] → complete / preempted.
 *
 * No in-memory game tree. No navigate/insertNode. PGN in the DB is the
 * single source of truth for which FENs belong to this game. The queue
 * (position_analysis priorities) drives which FEN runs next.
 */
export class GameCoordinator {
  private configHash: string
  private stopped = false

  private stockfish: UCIEngine | null = null
  private maiaFloorEngine: UCIEngine | null = null
  private maiaCeilingEngine: UCIEngine | null = null
  private featuresService: PositionalFeaturesService | null = null

  private activePositionActor: ReturnType<typeof createActor<typeof positionMachine>> | null = null
  private inFlightFen: string | null = null
  private inFlightId: number | null = null

  private priorityChangedWhileRunning = false

  constructor(
    private db: Database.Database,
    private webContents: WebContents,
    private gameId: string,
    private userRating: number = 1500,
    private bus?: EventBus,
  ) {
    const config = buildConfig(userRating)
    this.configHash = buildConfigHash(config)
  }

  get activeConfigHash(): string {
    return this.configHash
  }

  /**
   * Acquire engines, wire the position machine, and run the position loop.
   * Returns when the game completes or the coordinator is stopped.
   */
  async start(): Promise<void> {
    const config = buildConfig(this.userRating)

    this.stockfish = await getStockfish()
    await this.stockfish.stopAndWait()
    const analysisService = new AnalysisService(this.stockfish)
    await this.stockfish.newGame()

    const floorRating = getMaiaFloorRating(this.userRating)
    const ceilingRating = getMaiaCeilingRating(this.userRating)
    const humanMoveService = new HumanMoveService()

    ;[this.maiaFloorEngine, this.maiaCeilingEngine] = await Promise.all([
      getMaia(floorRating),
      getMaia(ceilingRating),
    ])
    humanMoveService.registerEngine(floorRating, this.maiaFloorEngine)
    if (ceilingRating !== floorRating) {
      humanMoveService.registerEngine(ceilingRating, this.maiaCeilingEngine)
    }

    const evalMaiaMovesService = new EvalMaiaMovesService(analysisService)
    const phaseService = new PhaseClassificationService()
    this.featuresService = new PositionalFeaturesService(getStockfishClassicBinaryPath())
    await this.featuresService.initialize()
    const featuresService = this.featuresService

    const configHash = this.configHash
    const db = this.db
    const stockfish = this.stockfish
    const maiaFloor = this.maiaFloorEngine
    const maiaCeiling = this.maiaCeilingEngine

    const concretePositionMachine = positionMachine.provide({
      actors: {
        loadPositionCache: fromPromise(async ({ input: actorInput }) => {
          const row = PositionAnalysisModel.findByFen(db, actorInput.fen, configHash)
          if (row && row.status === 'complete' && row.result_json) {
            return JSON.parse(row.result_json) as PositionOutput
          }
          return null
        }),
        analyzePosition: fromPromise(async ({ input: actorInput }) => {
          const result = await analysisService.analyzePosition(actorInput.fen, {
            depth: actorInput.config.depth,
            timeMs: actorInput.config.timeMs,
            nodes: actorInput.config.nodes,
            multipv: actorInput.config.multipv,
          })
          const topLine = result.lines[0]
          const sideToMove = actorInput.fen.split(' ')[1]
          const sign = sideToMove === 'b' ? -1 : 1
          const isBlack = sideToMove === 'b'
          const normalizedLines = result.lines.map(line => ({
            ...line,
            score: { type: line.score.type, value: line.score.value * sign },
            wdl: line.wdl && isBlack
              ? { win: line.wdl.loss, draw: line.wdl.draw, loss: line.wdl.win }
              : line.wdl,
          }))
          const topWdl = topLine?.wdl
          const normalizedTopWdl = topWdl && isBlack
            ? { win: topWdl.loss, draw: topWdl.draw, loss: topWdl.win }
            : topWdl ?? null
          return {
            evalCp: topLine?.score.type === 'cp' ? topLine.score.value * sign : null,
            evalMate: topLine?.score.type === 'mate' ? topLine.score.value * sign : null,
            wdl: normalizedTopWdl,
            bestMove: result.bestMove,
            depth: topLine?.depth ?? 0,
            lines: normalizedLines,
          } satisfies EngineResult
        }),
        analyzeMaiaPair: fromPromise(async ({ input: actorInput }) => {
          const topN = actorInput.config.multipv ?? 6
          const sideToMove = actorInput.fen.split(' ')[1]
          const sign = sideToMove === 'b' ? -1 : 1

          const normalize = (predictions: HumanMovePrediction[]) =>
            predictions.map(p => ({
              ...p,
              score: p.score !== undefined ? p.score * sign : undefined,
            }))

          const [floorPredictions, ceilingPredictions] = await Promise.all([
            humanMoveService.predictMove(actorInput.fen, floorRating, topN),
            ceilingRating !== floorRating
              ? humanMoveService.predictMove(actorInput.fen, ceilingRating, topN)
              : Promise.resolve(null),
          ])
          return {
            floor: { rating: floorRating, predictions: normalize(floorPredictions) },
            ceiling:
              ceilingRating !== floorRating && ceilingPredictions
                ? { rating: ceilingRating, predictions: normalize(ceilingPredictions) }
                : { rating: floorRating, predictions: normalize(floorPredictions) },
          }
        }),
        evalMaiaMoves: fromPromise(async ({ input: actorInput }) =>
          evalMaiaMovesService.evaluate(actorInput)
        ),
        computePositionalData: fromPromise(async ({ input: actorInput }) => {
          const [phase, { features, rawFeatures }] = await Promise.all([
            phaseService.classifyPosition(actorInput.fen, actorInput.ply),
            featuresService.computeBoth(actorInput.fen),
          ])
          return { phase, features, rawFeatures }
        }),
        stopEngines: fromPromise(async () => {
          await Promise.all([
            stockfish.stopAndWait(),
            maiaFloor.stopAndWait(),
            ...(ceilingRating !== floorRating ? [maiaCeiling.stopAndWait()] : []),
          ])
        }),
      },
    })

    // ── Position loop ──────────────────────────────────────────────────────

    while (!this.stopped) {
      const game = ChessGameModel.findById(db, this.gameId)
      if (!game?.pgn) break

      const { root } = parseGameTree(game.pgn)
      const allFens = collectAllFens(root).map(f => f.fen)

      const next = PositionAnalysisModel.fetchHeadForFens(db, allFens, configHash)
      if (!next) {
        GameAnalysisQueueModel.markComplete(db, this.gameId, this.buildFinalAggregates())
        this.emitGameAnalysisUpdated()
        this.bus?.emit('game:analysis:complete', { gameId: this.gameId })
        break
      }

      PositionAnalysisModel.markInProgress(db, next.id)
      this.inFlightFen = next.fen
      this.inFlightId = next.id
      this.priorityChangedWhileRunning = false

      const ply = allFens.indexOf(next.fen)

      const actor = createActor(concretePositionMachine, {
        input: { fen: next.fen, ply: Math.max(0, ply), config },
      })
      this.activePositionActor = actor

      try {
        actor.start()
        const output = await toPromise(actor)

        if (this.stopped) {
          PositionAnalysisModel.markPending(db, next.id)
          break
        }

        if (this.priorityChangedWhileRunning) {
          PositionAnalysisModel.markPending(db, next.id)
          continue
        }

        this.writePositionToCache(next.id, next.fen, output)
        computeAndPersistAggregates(db, this.gameId, configHash)
        this.emitGameAnalysisUpdated()
      } catch (err) {
        if (this.priorityChangedWhileRunning) {
          PositionAnalysisModel.markPending(db, next.id)
          continue
        }
        const retried = PositionAnalysisModel.retryOrFail(db, next.id)
        if (retried) {
          console.warn(
            `[GameCoordinator] Position analysis failed for ${next.fen}, re-queued for retry:`,
            err,
          )
        } else {
          console.error(
            `[GameCoordinator] Position analysis permanently failed for ${next.fen} after ${PositionAnalysisModel.MAX_RETRIES} attempts:`,
            err,
          )
        }
      } finally {
        this.activePositionActor = null
        this.inFlightFen = null
        this.inFlightId = null
      }
    }
  }

  /**
   * Called by the orchestrator when position priorities change.
   * Checks whether the queue head changed and preempts if needed.
   *
   * Sets a flag and sends STOP; the position loop detects the flag after
   * toPromise resolves, marks the row pending, and picks up the new head.
   * This avoids a race where both onPriorityChanged and the position loop
   * compete to clean up shared state.
   */
  onPriorityChanged(): void {
    if (!this.activePositionActor || !this.inFlightFen || this.inFlightId == null) return

    const game = ChessGameModel.findById(this.db, this.gameId)
    if (!game?.pgn) return

    const { root } = parseGameTree(game.pgn)
    const allFens = collectAllFens(root).map(f => f.fen)

    const head = PositionAnalysisModel.fetchHeadForFens(this.db, allFens, this.configHash)
    if (!head || head.fen === this.inFlightFen) return

    this.priorityChangedWhileRunning = true
    this.activePositionActor.send({ type: 'STOP' })
  }

  /**
   * Gracefully shut down the coordinator. Stops the current position actor
   * (if running), drains engines, and signals the loop to exit.
   */
  async stop(): Promise<void> {
    this.stopped = true

    if (this.activePositionActor) {
      this.activePositionActor.send({ type: 'STOP' })
      try {
        await toPromise(this.activePositionActor)
      } catch {
        // Already in final state
      }
      this.activePositionActor = null
    }

    if (this.inFlightId != null) {
      PositionAnalysisModel.markPending(this.db, this.inFlightId)
      this.inFlightId = null
      this.inFlightFen = null
    }

    await Promise.allSettled([
      this.stockfish?.stopAndWait() ?? Promise.resolve(),
      this.maiaFloorEngine?.stopAndWait() ?? Promise.resolve(),
      this.maiaCeilingEngine?.stopAndWait() ?? Promise.resolve(),
      this.featuresService?.quit() ?? Promise.resolve(),
    ])
  }

  // ==================== Private Helpers ====================

  private writePositionToCache(id: number, fen: string, output: PositionOutput): void {
    const positionalColumns = buildPositionalColumns(
      output.positionalFeatures ?? null,
      output.evalRawFeatures ?? null,
    )
    PositionAnalysisModel.markComplete(
      this.db,
      id,
      JSON.stringify(output),
      output.engineResult?.depth ?? 0,
      positionalColumns,
    )
  }

  private buildFinalAggregates() {
    const game = ChessGameModel.findById(this.db, this.gameId)
    if (!game?.pgn) {
      return {
        accuracy_white: 0,
        accuracy_black: 0,
        white_stats_json: '{}',
        black_stats_json: '{}',
        eval_curve_json: '[]',
        node_results_json: '{}',
        radar_data_json: '{}',
        maia_floor_curve_json: '[]',
        maia_ceiling_curve_json: '[]',
      }
    }

    // computeAndPersistAggregates already wrote incremental aggregates;
    // read them back for the final markComplete call.
    const row = GameAnalysisQueueModel.findByGameId(this.db, this.gameId)
    return {
      accuracy_white: row?.accuracy_white ?? 0,
      accuracy_black: row?.accuracy_black ?? 0,
      white_stats_json: row?.white_stats_json ?? '{}',
      black_stats_json: row?.black_stats_json ?? '{}',
      eval_curve_json: row?.eval_curve_json ?? '[]',
      node_results_json: row?.node_results_json ?? '{}',
      radar_data_json: row?.radar_data_json ?? '{}',
      maia_floor_curve_json: row?.maia_floor_curve_json ?? '[]',
      maia_ceiling_curve_json: row?.maia_ceiling_curve_json ?? '[]',
    }
  }

  private emitGameAnalysisUpdated(): void {
    if (this.webContents.isDestroyed()) return
    this.webContents.send('game:analysis:updated', {
      success: true,
      data: { gameId: this.gameId },
    })
  }
}

// ==================== Column Flattening ====================

const EVAL_TERM_TO_COL: Record<string, string> = {
  material: 'material', imbalance: 'imbalance', pawns: 'pawns',
  knights: 'knights', bishops: 'bishops', rooks: 'rooks',
  queens: 'queens', mobility: 'mobility', kingSafety: 'kingsafety',
  threats: 'threats', passed: 'passed', space: 'space', winnable: 'winnable',
}

function buildPositionalColumns(
  pf: PositionalFeatures | null,
  raw: EvalRawFeatures | null,
): Record<string, number | null> {
  const cols: Record<string, number | null> = {}

  if (pf) {
    for (const [key, colName] of Object.entries(EVAL_TERM_TO_COL)) {
      const term = pf[key as keyof PositionalFeatures] as EvalTerm | undefined
      cols[`eval_${colName}_white_mg`] = term?.white?.mg ?? null
      cols[`eval_${colName}_white_eg`] = term?.white?.eg ?? null
      cols[`eval_${colName}_black_mg`] = term?.black?.mg ?? null
      cols[`eval_${colName}_black_eg`] = term?.black?.eg ?? null
      cols[`eval_${colName}_total_mg`] = term?.total?.mg ?? null
      cols[`eval_${colName}_total_eg`] = term?.total?.eg ?? null
    }
    cols.eval_final = pf.finalEvaluation
  }

  if (raw) {
    for (const [key, val] of Object.entries(raw)) {
      cols[key] = val
    }
  }

  return cols
}
