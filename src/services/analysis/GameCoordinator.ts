import crypto from 'crypto'
import { createActor, fromPromise } from 'xstate'
import type { IpcMainEvent } from 'electron'
import type Database from 'better-sqlite3'

import { getStockfish, getMaia, getStockfishClassicBinaryPath } from 'src/services/engine/manager'
import { VALID_MAIA_RATINGS, type MaiaRating } from 'src/services/engine/EngineManager'
import type { UCIEngine } from 'src/services/engine/UCIEngine'
import { AnalysisService } from 'src/services/engine/analysis/AnalysisService'
import { HumanMoveService } from 'src/services/engine/analysis/HumanMoveService'
import type { HumanMovePrediction } from 'src/services/engine/types'
import { GameAnalysisModel } from 'src/database/analysis/GameAnalysisModel'
import type {
  AnalysisPreset,
  AnalysisModeConfig,
  AnalysisNode,
  GameAnalysisData,
  GameFSMState,
} from 'src/database/analysis/types'
import { ANALYSIS_PRESETS } from 'src/database/analysis/types'

import {
  gameMachine,
  setNodeResult,
  findNodeById,
  buildEvalCurveFromMainLine,
  buildMaiaFloorEvalCurve,
  buildMaiaCeilingEvalCurve,
  type GameContext,
  type GameInput,
} from './machines/gameMachine'
import { positionMachine } from './machines/positionMachine'
import type { EngineResult } from './machines/positionMachine'
import { parseGameTree, STARTING_FEN } from 'src/utils/chess/GameTree'
import type { GameChildNode, GameNode } from 'src/utils/chess/types'

import { PhaseClassificationService } from './PhaseClassificationService'
import { PositionalFeaturesService } from './PositionalFeaturesService'
import { EvalMaiaMovesService } from './EvalMaiaMovesService'
import { MoveClassificationService } from './MoveClassificationService'

const SCHEMA_VERSION = 5

// ==================== Maia Rating Helpers ====================

function getMaiaFloorRating(userRating: number): MaiaRating {
  const floor = [...VALID_MAIA_RATINGS].reverse().find(r => r <= userRating)
  return floor ?? VALID_MAIA_RATINGS[0]
}

function getMaiaCeilingRating(userRating: number): MaiaRating {
  const ceiling = VALID_MAIA_RATINGS.find(r => r > userRating)
  return ceiling ?? VALID_MAIA_RATINGS[VALID_MAIA_RATINGS.length - 1]
}

// ==================== GameTree → AnalysisNode conversion ====================

function gameTreeToAnalysis(pgn: string): { tree: AnalysisNode; nextId: number } {
  const { root: gameTreeRoot } = parseGameTree(pgn)
  let idCounter = 0

  const treeRoot: AnalysisNode = {
    id: idCounter++,
    ply: 0,
    fen: STARTING_FEN,
    uciMove: null,
    fsmState: 'UNANALYZED',
    children: [],
  }

  function convert(gameChild: GameChildNode, ply: number): AnalysisNode {
    const d = gameChild.data
    const node: AnalysisNode = {
      id: idCounter++,
      ply,
      fen: d.fen,
      uciMove: d.from + d.to + (d.promotion ?? ''),
      san: d.san,
      from: d.from,
      to: d.to,
      piece: d.piece,
      color: d.color,
      captured: d.captured,
      promotion: d.promotion,
      moveNumber: d.moveNumber,
      fsmState: 'UNANALYZED',
      children: [],
    }
    node.children = gameChild.children.map(child => convert(child, ply + 1))
    return node
  }

  treeRoot.children = gameTreeRoot.children.map(child => convert(child, 1))
  return { tree: treeRoot, nextId: idCounter }
}

// ==================== Helpers ====================

function hashPgn(pgn: string): string {
  return crypto.createHash('sha256').update(pgn).digest('hex')
}

function buildConfig(preset: AnalysisPreset, userRating?: number): AnalysisModeConfig {
  return { mode: 'pipeline', preset, ...ANALYSIS_PRESETS[preset], userRating }
}

// ==================== Coordinator ====================

export class GameCoordinator {
  private gameInput: GameInput | null = null

  // Engine references held for the lifetime of this coordinator so that
  // stopEngines can drain all three in STOP_AND_WAIT.
  private stockfish: UCIEngine | null = null
  private maiaFloorEngine: UCIEngine | null = null
  private maiaCeilingEngine: UCIEngine | null = null
  private featuresService: PositionalFeaturesService | null = null

  constructor(
    private db: Database.Database,
    private sender: IpcMainEvent['sender'],
    private gameId: string,
    private pgn: string,
    private backgroundPreset: AnalysisPreset,
    private userRating: number = 1500,
  ) {}

  /**
   * Load-or-create the analysis record and build the GameInput. Must be called
   * before start(). Synchronous — no engine access yet.
   *
   * On resume the machine starts at IDLE with currentNodeId = root. IDLE's
   * BACKGROUND_PROCESSING guard finds the first UNANALYZED node via DFS, so
   * no cursor-scanning is needed here.
   */
  initialize(): void {
    const pgnHash = hashPgn(this.pgn)
    const existing = GameAnalysisModel.findByGameId(this.db, this.gameId)
    // Background sweep always uses fast (time-bounded) so all positions
    // receive a quick first-pass result. The focus config (study) is applied
    // only when the user navigates to an already-analyzed position.
    const backgroundConfig = buildConfig('fast', this.userRating)
    const focusConfig = buildConfig('fast', this.userRating)

    let data: GameAnalysisData & { tree: AnalysisNode }

    if (existing && existing.pgnHash === pgnHash && existing.tree) {
      data = existing as GameAnalysisData & { tree: AnalysisNode }
    } else {
      const { tree, nextId } = gameTreeToAnalysis(this.pgn)
      data = {
        gameId: this.gameId,
        pgnHash,
        schemaVersion: SCHEMA_VERSION,
        gameFsmState: 'UNANALYZED',
        evalCurve: [],
        maiaFloorEvalCurve: [],
        maiaCeilingEvalCurve: [],
        tree,
        nextId,
        preset: this.backgroundPreset,
      }
      GameAnalysisModel.save(this.db, data)
    }

    this.gameInput = {
      data,
      backgroundConfig,
      focusConfig,
      currentNodeId: data.tree.id,
    }
  }

  /**
   * Acquire all engines, wire concrete actors, and start the game machine.
   * Returns immediately — results stream back via IPC push channels.
   * Must call initialize() first.
   */
  async start(): Promise<void> {
    if (!this.gameInput) {
      throw new Error('GameCoordinator.initialize() must be called before start()')
    }

    const input = this.gameInput

    // Acquire engines once for the full coordinator lifetime.
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
    const moveClassificationService = new MoveClassificationService()
    const phaseService = new PhaseClassificationService()
    this.featuresService = new PositionalFeaturesService(getStockfishClassicBinaryPath())
    await this.featuresService.initialize()
    const featuresService = this.featuresService

    const concretePositionMachine = positionMachine.provide({
      actors: {
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
          // Normalize all scores to white's perspective so that positive = white winning
          // throughout the entire pipeline (evalCp, evalMate, WDL, and every line score).
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
        classifyPosition: fromPromise(async ({ input: actorInput }) =>
          moveClassificationService.classify(actorInput)
        ),
        computePositionalData: fromPromise(async ({ input: actorInput }) => {
          const [phase, features] = await Promise.all([
            phaseService.classifyPosition(actorInput.fen, actorInput.ply),
            featuresService.compute(actorInput.fen),
          ])
          return { phase, features }
        }),
      },
    })

    // Capture engine refs for the closure below.
    const stockfish = this.stockfish
    const maiaFloor = this.maiaFloorEngine
    const maiaCeiling = this.maiaCeilingEngine

    const actor = createActor(
      gameMachine.provide({
        actors: {
          positionMachine: concretePositionMachine,
          stopEngines: fromPromise(async () => {
            await Promise.all([
              stockfish.stopAndWait(),
              maiaFloor.stopAndWait(),
              ...(ceilingRating !== floorRating ? [maiaCeiling.stopAndWait()] : []),
            ])
          }),
        },
      }),
      { input },
    )

    // Pre-populate with nodes already analyzed in previous runs so they are
    // not re-pushed when the actor starts on a resumed or COMPLETE game.
    const pushedNodeIds = new Set<number>()
    const prepopulatePushed = (node: AnalysisNode) => {
      if (node.fsmState === 'NAG_COMPLETE') pushedNodeIds.add(node.id)
      for (const child of node.children) prepopulatePushed(child)
    }
    prepopulatePushed(input.data.tree)

    // Track consecutive gameFsmState values so game-level transitions are
    // pushed exactly once. COMPLETE can be reached multiple times (e.g. after
    // a variation is added and re-analyzed), so we re-fire on each entry.
    let prevGameFsmState: GameFSMState = input.data.gameFsmState

    actor.subscribe((snapshot) => {
      const { context } = snapshot

      // Push any newly completed nodes (mainline and variations).
      this.pushNewlyCompletedNodes(context, pushedNodeIds)

      // Push COMPLETE whenever gameFsmState transitions into it. Using
      // prevGameFsmState prevents duplicate pushes on multiple ticks while
      // already in COMPLETE, but allows re-entry after a new variation.
      if (context.gameFsmState === 'COMPLETE' && prevGameFsmState !== 'COMPLETE') {
        this.saveAndPushGameState(context, 'COMPLETE')
      }

      prevGameFsmState = context.gameFsmState
    })

    actor.start()

    // Store actor for navigate() calls.
    this.actor = actor
  }

  private actor: ReturnType<typeof createActor<typeof gameMachine>> | null = null

  /**
   * Tell the game machine which node the user has navigated to. The machine
   * transitions to STOP_AND_WAIT, drains all engines, then returns to IDLE
   * where POSITION_ANALYSIS takes priority for the new currentNodeId.
   */
  navigate(nodeId: number): void {
    this.actor?.send({ type: 'navigate', nodeId })
  }

  /**
   * Inject a newly created variation node into the machine's context tree and
   * navigate to it atomically. This must be used instead of `navigate` when
   * the node was just created, because the machine's in-memory tree is a
   * separate copy from the database and will not yet contain the new node.
   */
  insertNode(parentId: number, node: AnalysisNode, nextId: number): void {
    this.actor?.send({ type: 'insertNode', parentId, node, nextId })
  }

  /**
   * Gracefully shut down the coordinator. Stops the XState actor so no further
   * transitions occur, then drains all three engines in parallel. Safe to call
   * multiple times. Awaiting ensures engines have fully stopped before the
   * caller proceeds (e.g. before starting a new coordinator for the same game).
   */
  async stop(): Promise<void> {
    this.actor?.stop()
    this.actor = null

    await Promise.allSettled([
      this.stockfish?.stopAndWait() ?? Promise.resolve(),
      this.maiaFloorEngine?.stopAndWait() ?? Promise.resolve(),
      this.maiaCeilingEngine?.stopAndWait() ?? Promise.resolve(),
      this.featuresService?.quit() ?? Promise.resolve(),
    ])
  }

  // ==================== Private Helpers ====================

  private toData(context: GameContext, gameFsmState: GameFSMState): GameAnalysisData {
    return {
      gameId: context.gameId,
      pgnHash: context.pgnHash,
      schemaVersion: context.schemaVersion,
      gameFsmState,
      tree: context.tree,
      evalCurve: context.evalCurve,
      maiaFloorEvalCurve: context.maiaFloorEvalCurve,
      maiaCeilingEvalCurve: context.maiaCeilingEvalCurve,
      nextId: context.nextId,
      preset: context.preset,
    }
  }

  private saveAndPushGameState(context: GameContext, state: GameFSMState): void {
    const data = this.toData(context, state)
    GameAnalysisModel.save(this.db, data)
    if (this.sender.isDestroyed()) return
    this.sender.send('analysis:game-state-update', {
      success: true,
      data: { gameId: this.gameId, gameFsmState: state },
    })
  }

  private saveAndPushNode(context: GameContext, node: AnalysisNode): void {
    const data = this.toData(context, context.gameFsmState)
    GameAnalysisModel.save(this.db, data)
    if (this.sender.isDestroyed()) return
    const { children: _children, ...nodeWithoutChildren } = node
    this.sender.send('analysis:node-update', {
      success: true,
      data: {
        gameId: this.gameId,
        nodeId: node.id,
        ply: node.ply,
        node: nodeWithoutChildren,
        gameFsmState: context.gameFsmState,
      },
    })
  }

  /**
   * Walk the entire tree (DFS) and push any NAG_COMPLETE nodes that have not
   * been pushed yet. Using a Set of node IDs rather than a linear index means
   * variation nodes are handled identically to mainline nodes.
   */
  private pushNewlyCompletedNodes(
    context: GameContext,
    pushedNodeIds: Set<number>,
  ): void {
    const walk = (node: AnalysisNode) => {
      if (node.fsmState === 'NAG_COMPLETE' && !pushedNodeIds.has(node.id)) {
        pushedNodeIds.add(node.id)
        this.saveAndPushNode(context, node)
      }
      for (const child of node.children) walk(child)
    }
    walk(context.tree)
  }
}
