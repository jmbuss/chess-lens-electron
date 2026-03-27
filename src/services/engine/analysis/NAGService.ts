import { Chess } from 'chess.js'
import { UCIEngine } from '../UCIEngine'
import { scoreToWinRate } from '../cpToWinRate'
import { NAG, NAG_SYMBOLS, type MoveNAG, type AnalysisOptions } from '../types'

/**
 * Win rate loss thresholds for NAG classification.
 * These are applied as the absolute drop in win rate (0-1 scale).
 *
 * Example: a win rate drop from 0.60 to 0.52 = 0.08 loss = Mistake
 */
const NAG_THRESHOLDS = {
  GOOD: 0.02, // < 2% loss = Good or Best
  DUBIOUS: 0.05, // 2-5% loss = Dubious
  MISTAKE: 0.1, // 5-10% loss = Mistake
  // > 10% loss = Blunder
} as const

/**
 * NAGService classifies moves using Numeric Annotation Glyphs.
 *
 * It evaluates each position with Stockfish, computes win rate loss
 * using the empirical Maia cp-to-winrate table, and assigns NAG codes.
 */
export class NAGService {
  constructor(private engine: UCIEngine) {}

  /**
   * Classify all moves in a game with NAG annotations.
   *
   * @param moves - UCI format moves from the starting position (e.g., ["e2e4", "e7e5", ...])
   * @param options - Analysis options (depth, timeMs, etc.)
   * @param startFen - Optional custom starting FEN
   * @param onProgress - Optional callback for progress updates
   */
  async classifyGame(
    moves: string[],
    options: AnalysisOptions = {},
    startFen?: string,
    onProgress?: (completed: number, total: number) => void
  ): Promise<MoveNAG[]> {
    const depth = options.depth ?? 18
    const analysisOptions: AnalysisOptions = { ...options, depth, multipv: 1 }

    const chess = new Chess(startFen)
    const results: MoveNAG[] = []

    await this.engine.newGame()

    // Evaluate the starting position
    let prevLines = await this.engine.analyze(chess.fen(), analysisOptions)
    let prevScore = prevLines[0]?.score
    let prevTurn = chess.turn() // 'w' or 'b'

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i]
      const bestMoveBeforePlay = prevLines[0]?.pv[0] ?? ''

      // Apply the move
      const from = move.substring(0, 2)
      const to = move.substring(2, 4)
      const promotion = move.length > 4 ? move[4] : undefined
      chess.move({ from, to, promotion })

      // Evaluate the new position
      const currentLines = await this.engine.analyze(chess.fen(), analysisOptions)
      const currentScore = currentLines[0]?.score

      if (prevScore && currentScore) {
        // Compute win rates from the perspective of the player who just moved.
        // UCI scores are always from the perspective of the side to move.
        // Before the move: score is from the mover's perspective.
        // After the move: score is from the opponent's perspective, so we invert.
        const winRateBefore = scoreToWinRate(prevScore.type, prevScore.value)
        const winRateAfter = 1 - scoreToWinRate(currentScore.type, currentScore.value)

        const winRateLoss = Math.max(0, winRateBefore - winRateAfter)
        const isBestMove = move === bestMoveBeforePlay

        const nag = this.classifyMove(winRateLoss, isBestMove, winRateBefore, winRateAfter)

        results.push({
          moveIndex: i,
          move,
          nag,
          symbol: NAG_SYMBOLS[nag],
          winRateBefore,
          winRateAfter,
          winRateLoss,
          bestMove: bestMoveBeforePlay,
          isBestMove,
        })
      }

      prevLines = currentLines
      prevScore = currentScore
      prevTurn = chess.turn()
      onProgress?.(i + 1, moves.length)
    }

    return results
  }

  /**
   * Classify a single move based on win rate loss.
   */
  private classifyMove(
    winRateLoss: number,
    isBestMove: boolean,
    winRateBefore: number,
    winRateAfter: number
  ): NAG {
    // Best engine move
    if (isBestMove) {
      return NAG.Good
    }

    // Brilliant: found the only good move in a difficult position,
    // or made a move that significantly improved a losing position
    if (winRateAfter > winRateBefore + 0.05 && winRateBefore < 0.4) {
      return NAG.Brilliant
    }

    // Classify by win rate loss
    if (winRateLoss < NAG_THRESHOLDS.GOOD) {
      return NAG.Neutral
    }
    if (winRateLoss < NAG_THRESHOLDS.DUBIOUS) {
      return NAG.Dubious
    }
    if (winRateLoss < NAG_THRESHOLDS.MISTAKE) {
      return NAG.Mistake
    }

    return NAG.Blunder
  }
}
