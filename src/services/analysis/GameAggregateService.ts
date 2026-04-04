import type Database from 'better-sqlite3'
import type { NAG } from 'src/services/engine/types'
import type {
  AnalysisNode,
  NodeResult,
  PlayerStats,
  PositionalRadarData,
} from 'src/database/analysis/types'
import { GameAnalysisQueueModel } from 'src/database/analysis-queue'
import { PositionAnalysisModel } from 'src/database/analysis-queue'
import { ChessGameModel } from 'src/database/chess/model'
import { parseGameTree, collectAllFens, STARTING_FEN } from 'src/utils/chess/GameTree'
import type { GameChildNode } from 'src/utils/chess/types'
import { MoveClassificationService } from './MoveClassificationService'
import { expectedPointsFromWDL, moveAccuracyFromEPL } from './MoveClassificationService'
import { computePositionalRadarData } from './featureAttribution'
import type { PositionOutput, EngineResult } from './machines/positionMachine'

// ==================== PGN → AnalysisNode conversion ====================

export function gameTreeToAnalysis(pgn: string): { tree: AnalysisNode; nextId: number } {
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

// ==================== Tree Helpers ====================

export function buildEvalCurveFromMainLine(root: AnalysisNode): number[] {
  const curve: number[] = []
  let current: AnalysisNode | undefined = root
  while (current) {
    if (current.engineResult?.evalCp != null) {
      curve.push(current.engineResult.evalCp)
    }
    current = current.children[0]
  }
  return curve
}

export function buildMaiaFloorEvalCurve(root: AnalysisNode): number[] {
  const curve: number[] = []
  let current: AnalysisNode | undefined = root
  while (current) {
    if (current.maiaFloorBestEval != null) {
      curve.push(current.maiaFloorBestEval)
    }
    current = current.children[0]
  }
  return curve
}

export function buildMaiaCeilingEvalCurve(root: AnalysisNode): number[] {
  const curve: number[] = []
  let current: AnalysisNode | undefined = root
  while (current) {
    if (current.maiaCeilingBestEval != null) {
      curve.push(current.maiaCeilingBestEval)
    }
    current = current.children[0]
  }
  return curve
}

// ==================== Player Stats ====================

function emptyStats(): PlayerStats {
  return { accuracy: null, nagCounts: {}, bookMoveCount: 0, totalMoves: 0, bestMoveCount: 0 }
}

export function computePlayerStats(root: AnalysisNode, color: 'w' | 'b'): PlayerStats {
  const stats = emptyStats()
  const moveAccuracies: number[] = []

  let prev: AnalysisNode | undefined = root
  let current: AnalysisNode | undefined = root.children[0]

  while (current) {
    if (current.color === color && current.fsmState === 'NAG_COMPLETE') {
      stats.totalMoves++

      if (current.isBookMove) {
        stats.bookMoveCount++
      } else {
        if (current.isBestMove) stats.bestMoveCount++

        const nag = current.nag
        if (nag != null) {
          stats.nagCounts[nag] = (stats.nagCounts[nag] ?? 0) + 1
        }

        const prevWdl = prev?.engineResult?.wdl ?? null
        const currentWdl = current.engineResult?.wdl ?? null
        if (prevWdl && currentWdl) {
          const epBefore = expectedPointsFromWDL(prevWdl)
          const epAfter = expectedPointsFromWDL(currentWdl)
          const epLoss = color === 'w' ? epBefore - epAfter : epAfter - epBefore
          moveAccuracies.push(moveAccuracyFromEPL(Math.max(0, epLoss)))
        }
      }
    }

    prev = current
    current = current.children[0]
  }

  if (moveAccuracies.length > 0) {
    stats.accuracy = moveAccuracies.reduce((a, b) => a + b, 0) / moveAccuracies.length
  }

  return stats
}

// ==================== Hydration ====================

/**
 * Hydrate position-only data from position_analysis cache onto tree nodes.
 */
function hydrateTreeFromCache(
  tree: AnalysisNode,
  db: Database.Database,
  configHash: string,
): void {
  const walk = (node: AnalysisNode) => {
    if (node.fsmState === 'UNANALYZED') {
      const row = PositionAnalysisModel.findByFen(db, node.fen, configHash)
      if (row && row.status === 'complete' && row.result_json) {
        try {
          const cached = JSON.parse(row.result_json) as PositionOutput
          Object.assign(node, {
            fsmState: 'NAG_COMPLETE' as const,
            engineResult: cached.engineResult ?? undefined,
            maiaFloorResult: cached.maiaFloorResult ?? undefined,
            maiaCeilingResult: cached.maiaCeilingResult ?? undefined,
            augmentedMaiaFloor: cached.augmentedMaiaFloor ?? undefined,
            augmentedMaiaCeiling: cached.augmentedMaiaCeiling ?? undefined,
            phaseScore: cached.phaseResult?.phaseScore,
            openingScore: cached.phaseResult?.openingScore,
            middlegameScore: cached.phaseResult?.middlegameScore,
            endgameScore: cached.phaseResult?.endgameScore,
            ecoCode: cached.phaseResult?.ecoMatch?.eco ?? undefined,
            isBookMove: cached.phaseResult != null
              ? cached.phaseResult.ecoMatch != null
              : undefined,
            positionalFeatures: cached.positionalFeatures ?? undefined,
            maiaFloorBestEval: cached.maiaFloorBestEval,
            maiaCeilingBestEval: cached.maiaCeilingBestEval,
          })
        } catch {
          // Corrupt cache row — leave node as UNANALYZED
        }
      }
    }
    for (const child of node.children) walk(child)
  }
  walk(tree)
}

/**
 * Apply game-context-dependent node classifications. Walks the entire tree
 * (mainline + variations) and classifies each analyzed node using its parent's
 * engine result for context.
 */
function classifyNodes(tree: AnalysisNode): Record<string, NodeResult> {
  const classifier = new MoveClassificationService()
  const nodeResults: Record<string, NodeResult> = {}

  const walk = (node: AnalysisNode, parent: AnalysisNode | null) => {
    if (node.fsmState === 'NAG_COMPLETE' && node.uciMove && node.color) {
      const prevEngineResult = (parent?.engineResult ?? null) as EngineResult | null
      const engineResult = node.engineResult as EngineResult | undefined

      if (engineResult) {
        const result = classifier.classify({
          prevEngineResult,
          engineResult,
          augmentedMaiaFloor: node.augmentedMaiaFloor ?? null,
          augmentedMaiaCeiling: node.augmentedMaiaCeiling ?? null,
          uciMove: node.uciMove,
          color: node.color,
          isBookMove: node.isBookMove ?? false,
        })

        node.nag = result.nag
        node.isBestMove = result.isBestMove
        node.criticalityScore = result.criticalityScore
        node.floorMistakeProb = result.floorMistakeProb ?? undefined
        node.ceilingMistakeProb = result.ceilingMistakeProb ?? undefined

        nodeResults[node.fen] = {
          nag: result.nag,
          isBestMove: result.isBestMove,
          criticalityScore: result.criticalityScore,
          floorMistakeProb: result.floorMistakeProb,
          ceilingMistakeProb: result.ceilingMistakeProb,
        }
      }
    }

    for (const child of node.children) {
      walk(child, node)
    }
  }

  walk(tree, null)
  return nodeResults
}

// ==================== Aggregate Service ====================

/**
 * Builds a hydrated analysis tree from PGN + position_analysis cache,
 * computes per-node classifications and game-level aggregates, and
 * persists everything to game_analysis_queue.
 *
 * Called by the coordinator after each position completes and once on
 * game completion.
 */
export function computeAndPersistAggregates(
  db: Database.Database,
  gameId: string,
  configHash: string,
): AnalysisNode | null {
  const game = ChessGameModel.findById(db, gameId)
  if (!game?.pgn) return null

  const { tree } = gameTreeToAnalysis(game.pgn)

  // Hydrate position-only data from cache
  hydrateTreeFromCache(tree, db, configHash)

  // Compute game-context-dependent per-node classifications
  const nodeResults = classifyNodes(tree)

  // Compute game-level aggregates from the classified tree
  const whiteStats = computePlayerStats(tree, 'w')
  const blackStats = computePlayerStats(tree, 'b')
  const evalCurve = buildEvalCurveFromMainLine(tree)
  const maiaFloorCurve = buildMaiaFloorEvalCurve(tree)
  const maiaCeilingCurve = buildMaiaCeilingEvalCurve(tree)
  const radarData = computePositionalRadarData(tree)

  GameAnalysisQueueModel.updateAggregates(db, gameId, {
    accuracy_white: whiteStats.accuracy ?? 0,
    accuracy_black: blackStats.accuracy ?? 0,
    white_stats_json: JSON.stringify(whiteStats),
    black_stats_json: JSON.stringify(blackStats),
    eval_curve_json: JSON.stringify(evalCurve),
    node_results_json: JSON.stringify(nodeResults),
    radar_data_json: JSON.stringify(radarData),
    maia_floor_curve_json: JSON.stringify(maiaFloorCurve),
    maia_ceiling_curve_json: JSON.stringify(maiaCeilingCurve),
  })

  return tree
}
