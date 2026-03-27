import { StockfishClassicEvalService } from './StockfishClassicEvalService'
import type { PositionalFeatures } from 'src/database/analysis/types'

/**
 * Derives per-position structural features using Stockfish Classic's static
 * `eval` command. Replaces the previous hand-coded heuristics with the full
 * Stockfish evaluation breakdown (pawns, mobility, king safety, etc.).
 *
 * Lifecycle mirrors the other analysis services:
 *   1. Construct with the binary path.
 *   2. Call `initialize()` once before use.
 *   3. Call `compute(fen)` for each position (sequential use; async).
 *   4. Call `quit()` when the coordinator is stopped.
 */
export class PositionalFeaturesService {
  private engine: StockfishClassicEvalService

  constructor(binaryPath: string) {
    this.engine = new StockfishClassicEvalService(binaryPath)
  }

  async initialize(): Promise<void> {
    await this.engine.initialize()
  }

  async compute(fen: string): Promise<PositionalFeatures> {
    return this.engine.evalPosition(fen)
  }

  async quit(): Promise<void> {
    await this.engine.quit()
  }
}
