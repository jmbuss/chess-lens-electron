import { NAG } from 'src/services/engine/types'
import type { AugmentedMaiaResult, MistakeProbability } from 'src/database/analysis/types'
import type { EngineResult } from './machines/positionMachine'

// ==================== Thresholds ====================

/** Eval-loss thresholds (centipawns) for bucketing move quality. */
const INACCURACY_THRESHOLD = 30
const MISTAKE_THRESHOLD = 80
const BLUNDER_THRESHOLD = 200

/** Eval-swing thresholds for NAG classification. */
const NAG_BRILLIANT_THRESHOLD = -150
const NAG_GOOD_THRESHOLD = -50
const NAG_DUBIOUS_THRESHOLD = 30
const NAG_MISTAKE_THRESHOLD = 80
const NAG_BLUNDER_THRESHOLD = 200

// ==================== Helpers ====================

/**
 * Convert centipawns to win probability using the standard logistic model.
 * Formula: winRate = 1 / (1 + 10^(-cp / 400))
 * Returns value in [0, 1] where 0.5 = equal.
 */
function cpToWinRate(cp: number): number {
  return 1 / (1 + Math.pow(10, -cp / 400))
}

// ==================== Input / Output ====================

export interface ClassifyInput {
  prevEngineResult: EngineResult | null
  engineResult: EngineResult
  augmentedMaiaFloor: AugmentedMaiaResult | null
  augmentedMaiaCeiling: AugmentedMaiaResult | null
  uciMove: string | null
  color: 'w' | 'b' | null
}

export interface ClassifyOutput {
  evalSwing: number | null
  nag: NAG
  winRateBefore: number
  winRateAfter: number
  winRateLoss: number
  isBestMove: boolean
  criticalityScore: number
  floorMistakeProb: MistakeProbability | null
  ceilingMistakeProb: MistakeProbability | null
}

// ==================== Service ====================

export class MoveClassificationService {
  classify(input: ClassifyInput): ClassifyOutput {
    const { prevEngineResult, engineResult, augmentedMaiaFloor, augmentedMaiaCeiling, uciMove, color } = input

    const evalSwing = this.computeEvalSwing(prevEngineResult, engineResult, color)
    const isBestMove = uciMove !== null && uciMove === engineResult.bestMove

    const winRateBefore = prevEngineResult?.evalCp != null
      ? cpToWinRate(prevEngineResult.evalCp)
      : 0.5
    const winRateAfter = engineResult.evalCp != null
      ? cpToWinRate(engineResult.evalCp)
      : 0.5

    const winRateLoss = Math.max(0, this.computeWinRateLoss(winRateBefore, winRateAfter, color))

    const nag = this.classifyNAG(evalSwing, isBestMove, engineResult)
    const criticalityScore = this.computeCriticality(evalSwing)

    const floorMistakeProb = augmentedMaiaFloor
      ? this.computeMistakeProbability(augmentedMaiaFloor, engineResult)
      : null
    const ceilingMistakeProb = augmentedMaiaCeiling
      ? this.computeMistakeProbability(augmentedMaiaCeiling, engineResult)
      : null

    return {
      evalSwing,
      nag,
      winRateBefore,
      winRateAfter,
      winRateLoss,
      isBestMove,
      criticalityScore,
      floorMistakeProb,
      ceilingMistakeProb,
    }
  }

  private computeEvalSwing(
    prev: EngineResult | null,
    current: EngineResult,
    color: 'w' | 'b' | null,
  ): number | null {
    if (!prev || prev.evalCp == null || current.evalCp == null || !color) {
      return null
    }
    // Positive = the player who moved made things worse for themselves
    return color === 'w'
      ? prev.evalCp - current.evalCp
      : current.evalCp - prev.evalCp
  }

  private computeWinRateLoss(
    winRateBefore: number,
    winRateAfter: number,
    color: 'w' | 'b' | null,
  ): number {
    if (!color) return 0
    // Win rate is from White's perspective.
    // For White: loss = before - after (positive = lost winning chances)
    // For Black: loss = after - before (positive = eval went up for White = bad for Black)
    return color === 'w'
      ? winRateBefore - winRateAfter
      : winRateAfter - winRateBefore
  }

  private classifyNAG(
    evalSwing: number | null,
    isBestMove: boolean,
    engineResult: EngineResult,
  ): NAG {
    if (evalSwing == null) return NAG.Neutral

    // Brilliant: the move significantly improved the position beyond what was expected,
    // and it's the best move or very close to it.
    if (evalSwing <= NAG_BRILLIANT_THRESHOLD && isBestMove) return NAG.Brilliant

    if (evalSwing >= NAG_BLUNDER_THRESHOLD) return NAG.Blunder
    if (evalSwing >= NAG_MISTAKE_THRESHOLD) return NAG.Mistake
    if (evalSwing >= NAG_DUBIOUS_THRESHOLD) return NAG.Dubious

    if (evalSwing <= NAG_GOOD_THRESHOLD && isBestMove) return NAG.Good

    // Check if the move was forced (all alternatives are equally bad)
    const isForced = engineResult.lines.length <= 1
    if (isBestMove && !isForced) return NAG.Good

    return NAG.Neutral
  }

  /**
   * Simple criticality: positions with large eval swings are more critical.
   * Normalized to [0, 1] using a sigmoid-like curve.
   */
  private computeCriticality(evalSwing: number | null): number {
    if (evalSwing == null) return 0
    const absSwing = Math.abs(evalSwing)
    // Sigmoid centered at 100cp, steepness factor of 0.02
    return 1 / (1 + Math.exp(-0.02 * (absSwing - 100)))
  }

  private computeMistakeProbability(
    augmentedMaia: AugmentedMaiaResult,
    engineResult: EngineResult,
  ): MistakeProbability {
    const bestEval = engineResult.evalCp

    if (bestEval == null) {
      return { goodMoveProb: 0, inaccuracyProb: 0, mistakeProb: 0, blunderProb: 0 }
    }

    const predictions = augmentedMaia.predictions

    // Prefer ground-truth policy probabilities captured from lc0 VerboseMoveStats.
    // Fall back to softmax of Q values for older analysis records that pre-date
    // the VerboseMoveStats pipeline.
    const weights = predictions.every(p => p.policyProb !== undefined)
      ? predictions.map(p => p.policyProb!)
      : this.normalizeMaiaProbabilities(predictions.map(p => p.score))

    let goodMoveProb = 0
    let inaccuracyProb = 0
    let mistakeProb = 0
    let blunderProb = 0

    for (let i = 0; i < predictions.length; i++) {
      const pred = predictions[i]
      const w = weights[i]

      if (pred.stockfishEval == null) {
        // Can't evaluate — assume neutral
        inaccuracyProb += w
        continue
      }

      const evalLoss = Math.abs(bestEval - pred.stockfishEval)

      if (evalLoss < INACCURACY_THRESHOLD) {
        goodMoveProb += w
      } else if (evalLoss < MISTAKE_THRESHOLD) {
        inaccuracyProb += w
      } else if (evalLoss < BLUNDER_THRESHOLD) {
        mistakeProb += w
      } else {
        blunderProb += w
      }
    }

    return { goodMoveProb, inaccuracyProb, mistakeProb, blunderProb }
  }

  /**
   * Convert Maia policy scores to normalized probabilities via softmax.
   * If scores are not available, distributes weight equally.
   */
  private normalizeMaiaProbabilities(scores: (number | undefined)[]): number[] {
    const hasScores = scores.some(s => s !== undefined)
    if (!hasScores || scores.length === 0) {
      const uniform = 1 / Math.max(scores.length, 1)
      return scores.map(() => uniform)
    }

    // Maia policy scores are in centipawns scale from lc0 — use as logits for softmax
    const logits = scores.map(s => (s ?? -Infinity) / 100)
    const maxLogit = Math.max(...logits.filter(l => l !== -Infinity))
    const exps = logits.map(l => Math.exp(l - maxLogit))
    const sum = exps.reduce((a, b) => a + b, 0)

    return exps.map(e => (sum > 0 ? e / sum : 0))
  }
}
