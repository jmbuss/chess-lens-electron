import type { AnalysisService } from 'src/services/engine/analysis/AnalysisService'
import type { UCIScore } from 'src/services/engine/types'
import type { MaiaAnalysisResult, AugmentedMaiaResult, AugmentedHumanMovePrediction } from 'src/database/analysis/types'
import type { EngineResult } from './machines/positionMachine'

const GAP_EVAL_DEPTH = 12

interface EvalMaiaMovesInput {
  fen: string
  engineResult: EngineResult
  maiaFloorResult: MaiaAnalysisResult | null
  maiaCeilingResult: MaiaAnalysisResult | null
}

export interface EvalMaiaMovesOutput {
  augmentedFloor: AugmentedMaiaResult | null
  augmentedCeiling: AugmentedMaiaResult | null
}

/**
 * Cross-references Maia predictions with Stockfish multipv lines.
 * For any Maia-predicted move not already in the Stockfish top lines,
 * runs a second Stockfish pass using `searchmoves` to fill in evals.
 */
export class EvalMaiaMovesService {
  constructor(private analysisService: AnalysisService) {}

  async evaluate(input: EvalMaiaMovesInput): Promise<EvalMaiaMovesOutput> {
    const { fen, engineResult, maiaFloorResult, maiaCeilingResult } = input

    // engineResult.lines are already normalized to white's perspective by GameCoordinator.
    const stockfishScoreMap = this.buildStockfishScoreMap(engineResult)

    const sideToMove = fen.split(' ')[1]
    const sign = sideToMove === 'b' ? -1 : 1

    const allMaiaMoves = this.collectUniqueMaiaMoves(maiaFloorResult, maiaCeilingResult)
    const gapMoves = allMaiaMoves.filter(m => !stockfishScoreMap.has(m))

    let gapScoreMap = new Map<string, UCIScore>()
    if (gapMoves.length > 0) {
      // Gap moves come directly from the engine (raw side-to-move perspective),
      // so normalize them here to match the pre-normalized stockfishScoreMap.
      gapScoreMap = await this.evalGapMoves(fen, gapMoves, sign)
    }

    // All entries in combinedScoreMap are now from white's perspective.
    const combinedScoreMap = new Map<string, UCIScore>([...stockfishScoreMap, ...gapScoreMap])

    const augmentedFloor = maiaFloorResult
      ? this.augmentMaiaResult(maiaFloorResult, combinedScoreMap)
      : null
    const augmentedCeiling = maiaCeilingResult
      ? this.augmentMaiaResult(maiaCeilingResult, combinedScoreMap)
      : null

    return { augmentedFloor, augmentedCeiling }
  }

  /**
   * Build a map of UCI move → score from the Stockfish multipv lines.
   * The first move in each PV line (`pv[0]`) is the candidate move.
   */
  private buildStockfishScoreMap(engineResult: EngineResult): Map<string, UCIScore> {
    const map = new Map<string, UCIScore>()
    for (const line of engineResult.lines) {
      const move = line.pv[0]
      if (move && !map.has(move)) {
        map.set(move, line.score)
      }
    }
    return map
  }

  private collectUniqueMaiaMoves(
    floor: MaiaAnalysisResult | null,
    ceiling: MaiaAnalysisResult | null,
  ): string[] {
    const moves = new Set<string>()
    for (const prediction of floor?.predictions ?? []) {
      moves.add(prediction.move)
    }
    for (const prediction of ceiling?.predictions ?? []) {
      moves.add(prediction.move)
    }
    return Array.from(moves)
  }

  /**
   * Run a single Stockfish call with `searchmoves` to evaluate all gap moves
   * in one batch. Normalizes scores to white's perspective using sign.
   * Returns a map of UCI move → normalized score.
   */
  private async evalGapMoves(fen: string, gapMoves: string[], sign: number): Promise<Map<string, UCIScore>> {
    const result = await this.analysisService.analyzePosition(fen, {
      searchmoves: gapMoves,
      multipv: gapMoves.length,
      depth: GAP_EVAL_DEPTH,
    })

    const map = new Map<string, UCIScore>()
    for (const line of result.lines) {
      const move = line.pv[0]
      if (move) {
        map.set(move, { type: line.score.type, value: line.score.value * sign })
      }
    }
    return map
  }

  private augmentMaiaResult(
    maiaResult: MaiaAnalysisResult,
    scoreMap: Map<string, UCIScore>,
  ): AugmentedMaiaResult {
    const predictions: AugmentedHumanMovePrediction[] = maiaResult.predictions.map(p => {
      const score = scoreMap.get(p.move) ?? null
      // Scores are already normalized to white's perspective.
      // For mate scores, use ±100_000 cp as a sentinel so the chart's
      // ÷100 + clamp(±10) pipeline treats them identically to evalMate.
      let stockfishEval: number | null = null
      if (score?.type === 'cp') {
        stockfishEval = score.value
      } else if (score?.type === 'mate') {
        stockfishEval = score.value > 0 ? 100_000 : -100_000
      }
      return {
        ...p,
        stockfishEval,
        stockfishScore: score ?? null,
      }
    })

    return { rating: maiaResult.rating, predictions }
  }
}
