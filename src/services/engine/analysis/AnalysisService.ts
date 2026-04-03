import { UCIEngine } from '../UCIEngine'
import { applyUciMove, STARTING_FEN } from '../../../utils/chess/GameTree'
import type { AnalysisOptions, AnalysisLine, PositionAnalysis } from '../types'

/**
 * AnalysisService provides position and game analysis using Stockfish.
 */
export class AnalysisService {
  constructor(private engine: UCIEngine) {}

  /**
   * Analyze a single position from a FEN string.
   *
   * onProgress receives incremental line snapshots as the engine searches deeper.
   */
  async analyzePosition(
    fen: string,
    options: AnalysisOptions = {},
    onProgress?: (lines: AnalysisLine[]) => void
  ): Promise<PositionAnalysis> {
    const lines = await this.engine.analyze(fen, options, onProgress)

    return {
      fen,
      moveIndex: 0,
      lines,
      bestMove: lines[0]?.pv[0] ?? '',
    }
  }

  /**
   * Analyze all positions in a game, given a list of UCI moves from the starting position.
   *
   * Returns an analysis for every position in the game (including the starting position).
   */
  async analyzeGame(
    moves: string[],
    options: AnalysisOptions = {},
    startFen?: string,
    onProgress?: (completed: number, total: number) => void
  ): Promise<PositionAnalysis[]> {
    let currentFen = startFen ?? STARTING_FEN
    const results: PositionAnalysis[] = []
    const totalPositions = moves.length + 1

    await this.engine.newGame()

    const startingAnalysis = await this.engine.analyze(currentFen, options)
    results.push({
      fen: currentFen,
      moveIndex: 0,
      lines: startingAnalysis,
      bestMove: startingAnalysis[0]?.pv[0] ?? '',
    })
    onProgress?.(1, totalPositions)

    for (let i = 0; i < moves.length; i++) {
      const nextFen = applyUciMove(currentFen, moves[i])
      if (!nextFen) throw new Error(`Illegal move ${moves[i]} in position ${currentFen}`)
      currentFen = nextFen

      const lines = await this.engine.analyze(currentFen, options)

      results.push({
        fen: currentFen,
        moveIndex: i + 1,
        movePlayed: moves[i],
        lines,
        bestMove: lines[0]?.pv[0] ?? '',
      })
      onProgress?.(i + 2, totalPositions)
    }

    return results
  }

  /**
   * Analyze a single position and return just the top line.
   * Convenience method for quick evaluations.
   */
  async quickEval(fen: string, depth: number = 16): Promise<AnalysisLine | null> {
    const lines = await this.engine.analyze(fen, { depth, multipv: 1 })
    return lines[0] ?? null
  }
}
