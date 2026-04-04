import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import { GameAnalysisQueueModel } from 'src/database/analysis-queue/GameAnalysisQueueModel'
import { PositionAnalysisModel } from 'src/database/analysis-queue/PositionAnalysisModel'
import type {
  GameAnalysisResponse,
  PositionAnalysis,
  GameFSMState,
  PlayerStats,
  NodeResult,
  PositionalRadarData,
} from 'src/database/analysis/types'
import { ANALYSIS_PRESETS } from 'src/database/analysis/types'
import { buildConfigHash } from 'src/services/analysis/PositionQueueManager'
import { ChessGameModel } from 'src/database/chess/model'
import { gameTreeToAnalysis } from 'src/services/analysis/GameAggregateService'
import type { AnalysisNode } from 'src/database/analysis/types'
import type { PositionOutput } from 'src/services/analysis/machines/positionMachine'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:getGameAnalysis': {
      request: { gameId: string }
      response: GameAnalysisResponse | null
    }
  }
}

function queueStatusToFsmState(status: string | null): GameFSMState {
  switch (status) {
    case 'complete': return 'COMPLETE'
    case 'in_progress': return 'ANALYZING'
    case 'pending': return 'UNANALYZED'
    default: return 'UNANALYZED'
  }
}

function hydrateNodeFromCache(
  node: AnalysisNode,
  positionMap: Map<string, PositionOutput>,
  nodeResultsMap: Record<string, NodeResult>,
): void {
  const cached = positionMap.get(node.fen)
  if (cached && node.fsmState === 'UNANALYZED') {
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
  }

  // Merge game-context node results (NAG, isBestMove, etc.)
  const nodeResult = nodeResultsMap[node.fen]
  if (nodeResult) {
    node.nag = nodeResult.nag
    node.isBestMove = nodeResult.isBestMove
    node.criticalityScore = nodeResult.criticalityScore
    node.floorMistakeProb = nodeResult.floorMistakeProb ?? undefined
    node.ceilingMistakeProb = nodeResult.ceilingMistakeProb ?? undefined
  }

  for (const child of node.children) {
    hydrateNodeFromCache(child, positionMap, nodeResultsMap)
  }
}

function treeToPositions(node: AnalysisNode, positions: Record<string, PositionAnalysis>): void {
  positions[node.fen] = {
    fen: node.fen,
    fsmState: node.fsmState,
    engineResult: node.engineResult,
    nag: node.nag,
    isBestMove: node.isBestMove,
    criticalityScore: node.criticalityScore,
    maiaFloorResult: node.maiaFloorResult,
    maiaCeilingResult: node.maiaCeilingResult,
    augmentedMaiaFloor: node.augmentedMaiaFloor,
    augmentedMaiaCeiling: node.augmentedMaiaCeiling,
    floorMistakeProb: node.floorMistakeProb,
    ceilingMistakeProb: node.ceilingMistakeProb,
    phaseScore: node.phaseScore,
    openingScore: node.openingScore,
    middlegameScore: node.middlegameScore,
    endgameScore: node.endgameScore,
    ecoCode: node.ecoCode,
    isBookMove: node.isBookMove,
    positionalFeatures: node.positionalFeatures,
    maiaFloorBestEval: node.maiaFloorBestEval,
    maiaCeilingBestEval: node.maiaCeilingBestEval,
  }
  for (const child of node.children) {
    treeToPositions(child, positions)
  }
}

export class GetGameAnalysisHandler extends IpcHandler {
  static readonly channel = 'analysis:getGameAnalysis' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ gameId: string }>,
  ): Promise<IpcResponse<GameAnalysisResponse | null>> {
    if (!request.params?.gameId) {
      return { success: false, error: 'gameId is required' }
    }

    const { gameId } = request.params
    const queueRow = GameAnalysisQueueModel.findByGameId(this.db, gameId)
    if (!queueRow) {
      return { success: true, data: null }
    }

    const configHash = buildConfigHash({
      mode: 'pipeline',
      preset: 'fast',
      ...ANALYSIS_PRESETS.fast,
    })

    // Build the tree from PGN
    const game = ChessGameModel.findById(this.db, gameId)
    let tree: AnalysisNode | null = null
    const positions: Record<string, PositionAnalysis> = {}

    if (game?.pgn) {
      const { tree: skeleton } = gameTreeToAnalysis(game.pgn)

      // Collect all FENs from the tree for bulk query
      const fens: string[] = []
      const collectFens = (node: AnalysisNode) => {
        fens.push(node.fen)
        for (const child of node.children) collectFens(child)
      }
      collectFens(skeleton)

      // Load position data
      const positionRows = PositionAnalysisModel.findAllByFens(this.db, fens, configHash)
      const positionMap = new Map<string, PositionOutput>()
      for (const row of positionRows) {
        if (row.status === 'complete' && row.result_json) {
          try {
            positionMap.set(row.fen, JSON.parse(row.result_json) as PositionOutput)
          } catch {
            // Skip corrupt rows
          }
        }
      }

      // Load node results from queue row
      let nodeResultsMap: Record<string, NodeResult> = {}
      if (queueRow.node_results_json) {
        try {
          nodeResultsMap = JSON.parse(queueRow.node_results_json)
        } catch {
          // Skip corrupt JSON
        }
      }

      // Hydrate tree with position data + node results
      hydrateNodeFromCache(skeleton, positionMap, nodeResultsMap)

      // Build flat positions map from hydrated tree
      treeToPositions(skeleton, positions)

      tree = skeleton
    }

    // Parse aggregates from queue row
    let whiteStats: PlayerStats | null = null
    let blackStats: PlayerStats | null = null
    let evalCurve: number[] | null = null
    let maiaFloorEvalCurve: number[] | null = null
    let maiaCeilingEvalCurve: number[] | null = null
    let radarData: PositionalRadarData | null = null

    try {
      if (queueRow.white_stats_json) whiteStats = JSON.parse(queueRow.white_stats_json)
    } catch { /* skip */ }
    try {
      if (queueRow.black_stats_json) blackStats = JSON.parse(queueRow.black_stats_json)
    } catch { /* skip */ }
    try {
      if (queueRow.eval_curve_json) evalCurve = JSON.parse(queueRow.eval_curve_json)
    } catch { /* skip */ }
    try {
      if (queueRow.maia_floor_curve_json) maiaFloorEvalCurve = JSON.parse(queueRow.maia_floor_curve_json)
    } catch { /* skip */ }
    try {
      if (queueRow.maia_ceiling_curve_json) maiaCeilingEvalCurve = JSON.parse(queueRow.maia_ceiling_curve_json)
    } catch { /* skip */ }
    try {
      if (queueRow.radar_data_json) radarData = JSON.parse(queueRow.radar_data_json)
    } catch { /* skip */ }

    return {
      success: true,
      data: {
        gameId,
        gameFsmState: queueStatusToFsmState(queueRow.status),
        accuracy_white: queueRow.accuracy_white,
        accuracy_black: queueRow.accuracy_black,
        whiteStats,
        blackStats,
        evalCurve,
        maiaFloorEvalCurve,
        maiaCeilingEvalCurve,
        radarData,
        tree,
        positions,
      },
    }
  }
}
