import { StockfishClassicEvalService } from './StockfishClassicEvalService'
import type { PositionalFeatures, EvalRawFeatures } from 'src/database/analysis/types'

export interface ComputeBothResult {
  features: PositionalFeatures
  rawFeatures: EvalRawFeatures
}

/**
 * Derives per-position structural features using Stockfish Classic's static
 * `eval` and `evalraw` commands.
 *
 * Lifecycle mirrors the other analysis services:
 *   1. Construct with the binary path.
 *   2. Call `initialize()` once before use.
 *   3. Call `computeBoth(fen)` for each position (sequential use; async).
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

  /**
   * Run eval then evalraw sequentially on the single stockfish-classic process.
   * Both commands are serialized on the engine's internal command queue.
   */
  async computeBoth(fen: string): Promise<ComputeBothResult> {
    const features = await this.engine.evalPosition(fen)
    const rawFeatures = await this.engine.evalRawPosition(fen)
    return { features, rawFeatures }
  }

  async quit(): Promise<void> {
    await this.engine.quit()
  }
}
