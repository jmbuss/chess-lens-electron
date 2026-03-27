import { Chess } from 'chess.js'
import { UCIEngine } from '../UCIEngine'
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
    const chess = new Chess(startFen)
    const results: PositionAnalysis[] = []
    const totalPositions = moves.length + 1

    await this.engine.newGame()

    // Analyze starting position
    const startingAnalysis = await this.engine.analyze(chess.fen(), options)
    results.push({
      fen: chess.fen(),
      moveIndex: 0,
      lines: startingAnalysis,
      bestMove: startingAnalysis[0]?.pv[0] ?? '',
    })
    onProgress?.(1, totalPositions)

    // Analyze each position after a move is made
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i]

      // Apply the move (chess.js accepts UCI format via verbose move)
      const from = move.substring(0, 2)
      const to = move.substring(2, 4)
      const promotion = move.length > 4 ? move[4] : undefined
      chess.move({ from, to, promotion })

      const fen = chess.fen()
      const lines = await this.engine.analyze(fen, options)

      results.push({
        fen,
        moveIndex: i + 1,
        movePlayed: move,
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
