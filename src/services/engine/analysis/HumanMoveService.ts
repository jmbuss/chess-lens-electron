import { UCIEngine } from '../UCIEngine'
import type { HumanMovePrediction } from '../types'
import type { MaiaRating } from '../EngineManager'
import { applyUciMove, STARTING_FEN } from '../../../utils/chess/GameTree'

/**
 * HumanMoveService predicts what a human of a given rating would play,
 * using lc0 with Maia neural network weights.
 *
 * Maia is designed to predict human moves using a single node search (go nodes 1).
 * The network outputs the most likely human move at its trained rating level.
 */
export class HumanMoveService {
  private engines: Map<MaiaRating, UCIEngine> = new Map()

  /**
   * Register a Maia engine for a specific rating.
   * The engine should already be initialized.
   */
  registerEngine(rating: MaiaRating, engine: UCIEngine): void {
    this.engines.set(rating, engine)
  }

  /**
   * Get the registered engine for a rating, or throw.
   */
  private getEngine(rating: MaiaRating): UCIEngine {
    const engine = this.engines.get(rating)
    if (!engine) {
      throw new Error(
        `No Maia engine registered for rating ${rating}. ` +
          `Available: ${Array.from(this.engines.keys()).join(', ')}`
      )
    }
    return engine
  }

  /**
   * Predict what a human at the given rating would play in this position.
   *
   * Uses `go nodes 1` with MultiPV to get lc0's policy output.  With
   * VerboseMoveStats enabled on the engine the actual per-move policy
   * probabilities are captured from the "info string" lines lc0 emits and
   * stored in `policyProb` on each prediction.  This is the ground-truth
   * probability from Maia's neural network — no softmax approximation needed.
   *
   * @param topN - Number of top variations to return (default 1, max ~10)
   */
  async predictMove(
    fen: string,
    rating: MaiaRating,
    topN: number = 1
  ): Promise<HumanMovePrediction[]> {
    const engine = this.getEngine(rating)

    const multipv = Math.max(1, Math.min(topN, 10))
    const { lines, policy } = await engine.analyzeWithPolicy(fen, { nodes: 1, multipv })

    // Terminal positions (checkmate, stalemate) produce no lines — return
    // an empty array rather than throwing so the pipeline handles them gracefully.
    if (lines.length === 0) {
      console.log(`[HumanMoveService] Maia (${rating}) — no legal moves (terminal position): ${fen}`)
      return []
    }

    const predictions = lines
      .filter(line => line.pv[0] && line.pv[0] !== '')
      .map(line => ({
        move: line.pv[0],
        rating,
        score: line.score.type === 'cp' ? line.score.value : undefined,
        policyProb: policy.get(line.pv[0]),
      }))

    // Sort by policy probability when available, fall back to Q value.
    predictions.sort((a, b) => {
      if (a.policyProb !== undefined && b.policyProb !== undefined) {
        return b.policyProb - a.policyProb
      }
      return (b.score ?? 0) - (a.score ?? 0)
    })

    return predictions.map((p, i) => ({ ...p, rank: i + 1 }))
  }

  /**
   * Predict moves across multiple Maia rating levels for the same position.
   * Useful for seeing how different skill levels would approach a position.
   */
  async predictMoveAllRatings(
    fen: string,
    topN: number = 1
  ): Promise<HumanMovePrediction[]> {
    const results: HumanMovePrediction[] = []

    for (const [rating, engine] of this.engines) {
      const multipv = Math.max(1, Math.min(topN, 10))
      const lines = await engine.analyze(fen, { nodes: 1, multipv })

      for (let i = 0; i < lines.length; i++) {
        const move = lines[i]?.pv[0]
        if (move) {
          results.push({
            move,
            rating,
            rank: i + 1,
            score: lines[i].score.type === 'cp' ? lines[i].score.value : undefined,
          })
        }
      }
    }

    return results.sort((a, b) => a.rating - b.rating || (a.rank ?? 1) - (b.rank ?? 1))
  }

  /**
   * For a given game, predict what Maia would play at each position
   * and compare with the actual moves played.
   */
  async analyzeGameMoves(
    moves: string[],
    rating: MaiaRating,
    startFen?: string,
    onProgress?: (completed: number, total: number) => void
  ): Promise<
    Array<{
      moveIndex: number
      movePlayed: string
      maiaPrediction: string
      matchesPrediction: boolean
    }>
  > {
    let currentFen = startFen ?? STARTING_FEN
    const engine = this.getEngine(rating)
    const results: Array<{
      moveIndex: number
      movePlayed: string
      maiaPrediction: string
      matchesPrediction: boolean
    }> = []

    for (let i = 0; i < moves.length; i++) {
      const lines = await engine.analyze(currentFen, { nodes: 1, multipv: 1 })
      const prediction = lines[0]?.pv[0] ?? ''

      const move = moves[i]
      results.push({
        moveIndex: i,
        movePlayed: move,
        maiaPrediction: prediction,
        matchesPrediction: move === prediction,
      })

      const nextFen = applyUciMove(currentFen, move)
      if (!nextFen) throw new Error(`Illegal move ${move} in position ${currentFen}`)
      currentFen = nextFen

      onProgress?.(i + 1, moves.length)
    }

    return results
  }
}
