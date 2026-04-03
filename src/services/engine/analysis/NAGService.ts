import { UCIEngine } from '../UCIEngine'
import { NAG, NAG_SYMBOLS, type MoveNAG, type AnalysisOptions, type WDL } from '../types'
import { applyUciMove, getTurn, STARTING_FEN } from '../../../utils/chess/GameTree'

/** EP = (win + draw/2) / 1000 */
function expectedPointsFromWDL(wdl: WDL): number {
  return (wdl.win + wdl.draw / 2) / 1000
}

/** EPL thresholds matching Chess.com Expected Points Model. */
const EPL_INACCURACY = 0.05
const EPL_MISTAKE = 0.10
const EPL_BLUNDER = 0.20
const EPL_GOOD = 0.05
const EPL_EXCELLENT = 0.02

/**
 * NAGService classifies moves using Numeric Annotation Glyphs.
 *
 * Evaluates each position with Stockfish (WDL enabled), computes Expected
 * Points Loss, and assigns NAG codes based on Chess.com's EP model.
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

    let currentFen = startFen ?? STARTING_FEN
    const results: MoveNAG[] = []

    await this.engine.newGame()

    let prevLines = await this.engine.analyze(currentFen, analysisOptions)
    let prevWdl = prevLines[0]?.wdl ?? null
    let prevTurn = getTurn(currentFen)

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i]
      const bestMoveBeforePlay = prevLines[0]?.pv[0] ?? ''
      const moverColor = prevTurn

      const nextFen = applyUciMove(currentFen, move)
      if (!nextFen) throw new Error(`Illegal move ${move} in position ${currentFen}`)
      currentFen = nextFen

      const currentLines = await this.engine.analyze(currentFen, analysisOptions)
      const currentRawWdl = currentLines[0]?.wdl ?? null

      // Normalize WDL to White's perspective.
      // Engine WDL is side-to-move relative: after a move, the side to move
      // is now the opponent. So we normalize based on whose turn it is now.
      const currentTurn = getTurn(currentFen)
      const normalizedPrevWdl = prevWdl && moverColor === 'b'
        ? { win: prevWdl.loss, draw: prevWdl.draw, loss: prevWdl.win }
        : prevWdl
      const normalizedCurrentWdl = currentRawWdl && currentTurn === 'b'
        ? { win: currentRawWdl.loss, draw: currentRawWdl.draw, loss: currentRawWdl.win }
        : currentRawWdl

      const isBestMove = move === bestMoveBeforePlay
      let nag = NAG.Neutral

      if (normalizedPrevWdl && normalizedCurrentWdl) {
        const epBefore = expectedPointsFromWDL(normalizedPrevWdl)
        const epAfter = expectedPointsFromWDL(normalizedCurrentWdl)
        const epLoss = moverColor === 'w'
          ? epBefore - epAfter
          : epAfter - epBefore
        nag = this.classifyMove(epLoss, isBestMove)
      }

      results.push({
        moveIndex: i,
        move,
        nag,
        symbol: NAG_SYMBOLS[nag],
        bestMove: bestMoveBeforePlay,
        isBestMove,
      })

      prevLines = currentLines
      prevWdl = currentRawWdl
      prevTurn = currentTurn
      onProgress?.(i + 1, moves.length)
    }

    return results
  }

  // TODO: Implement special classifications (Brilliant, Great, Interesting, Miss) per Chess.com rules
  private classifyMove(epLoss: number, isBestMove: boolean): NAG {
    if (epLoss >= EPL_BLUNDER) return NAG.Blunder
    if (epLoss >= EPL_MISTAKE) return NAG.Mistake
    if (epLoss >= EPL_INACCURACY) return NAG.Inaccuracy
    if (epLoss <= 0 && isBestMove) return NAG.Best
    if (epLoss < EPL_EXCELLENT) return NAG.Excellent
    if (epLoss < EPL_GOOD) return NAG.Good
    return NAG.Neutral
  }
}
