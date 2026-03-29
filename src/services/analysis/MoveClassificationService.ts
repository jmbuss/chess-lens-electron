import { NAG } from 'src/services/engine/types'
import type { WDL } from 'src/services/engine/types'
import type { AugmentedMaiaResult, MistakeProbability } from 'src/database/analysis/types'
import type { EngineResult } from './machines/positionMachine'

// ==================== EP Helpers ====================

/**
 * Compute Expected Points from WDL (White-normalized).
 * EP = (win + draw/2) / 1000, ranges from 0.0 (White loses) to 1.0 (White wins).
 */
export function expectedPointsFromWDL(wdl: WDL): number {
  return (wdl.win + wdl.draw / 2) / 1000
}

/**
 * Compute Expected Points Loss from the mover's perspective.
 * Positive = the mover worsened their own position.
 * WDL values are White-normalized, so:
 *   White moved: EPL = EP(prev) - EP(current)
 *   Black moved: EPL = EP(current) - EP(prev)
 */
function computeEPL(
  prevWdl: WDL | null,
  currentWdl: WDL | null,
  color: 'w' | 'b' | null,
): number | null {
  if (!prevWdl || !currentWdl || !color) return null
  const epBefore = expectedPointsFromWDL(prevWdl)
  const epAfter = expectedPointsFromWDL(currentWdl)
  return color === 'w'
    ? epBefore - epAfter
    : epAfter - epBefore
}

// ==================== Move Accuracy ====================

/**
 * Map EPL (0–1 scale) to a move accuracy percentage (0–100%).
 * EPL=0 → ~100%, EPL≈0.5 → ~0%. Uses an exponential decay curve.
 */
export function moveAccuracyFromEPL(epLoss: number): number {
  const pctLoss = epLoss * 100
  const raw = 103.1668 * Math.exp(-0.04354 * pctLoss) - 3.1669
  return Math.min(100, Math.max(0, raw))
}

// ==================== EPL Thresholds ====================

const EPL_INACCURACY = 0.05
const EPL_MISTAKE = 0.10
const EPL_BLUNDER = 0.20
const EPL_GOOD = 0.05
const EPL_EXCELLENT = 0.02

// ==================== Input / Output ====================

export interface ClassifyInput {
  prevEngineResult: EngineResult | null
  engineResult: EngineResult
  augmentedMaiaFloor: AugmentedMaiaResult | null
  augmentedMaiaCeiling: AugmentedMaiaResult | null
  uciMove: string | null
  color: 'w' | 'b' | null
  /** True if the resulting position is in the opening book — skips EPL classification. */
  isBookMove: boolean
}

export interface ClassifyOutput {
  nag: NAG
  isBestMove: boolean
  moveAccuracy: number | null
  criticalityScore: number
  floorMistakeProb: MistakeProbability | null
  ceilingMistakeProb: MistakeProbability | null
}

// ==================== Service ====================

export class MoveClassificationService {
  classify(input: ClassifyInput): ClassifyOutput {
    const { prevEngineResult, engineResult, augmentedMaiaFloor, augmentedMaiaCeiling, uciMove, color, isBookMove } = input

    const isBestMove = uciMove !== null && prevEngineResult !== null && uciMove === prevEngineResult.bestMove

    const prevWdl = prevEngineResult?.wdl ?? null
    const currentWdl = engineResult.wdl ?? null
    const epLoss = computeEPL(prevWdl, currentWdl, color)

    const nag = this.classifyNAG(epLoss, isBestMove, isBookMove)
    const moveAccuracy = epLoss != null && !isBookMove
      ? moveAccuracyFromEPL(Math.max(0, epLoss))
      : null
    const criticalityScore = this.computeCriticality(prevEngineResult, engineResult, color)

    const floorMistakeProb = augmentedMaiaFloor
      ? this.computeMistakeProbability(augmentedMaiaFloor, engineResult)
      : null
    const ceilingMistakeProb = augmentedMaiaCeiling
      ? this.computeMistakeProbability(augmentedMaiaCeiling, engineResult)
      : null

    return {
      nag,
      isBestMove,
      moveAccuracy,
      criticalityScore,
      floorMistakeProb,
      ceilingMistakeProb,
    }
  }

  // TODO: Implement special classifications (Brilliant, Great, Interesting, Miss) per Chess.com rules
  private classifyNAG(epLoss: number | null, isBestMove: boolean, isBookMove: boolean): NAG {
    if (isBookMove) return NAG.BookMove
    if (epLoss == null) return NAG.Neutral
    if (epLoss >= EPL_BLUNDER) return NAG.Blunder
    if (epLoss >= EPL_MISTAKE) return NAG.Mistake
    if (epLoss >= EPL_INACCURACY) return NAG.Inaccuracy
    if (epLoss <= 0 && isBestMove) return NAG.Best
    if (epLoss < EPL_EXCELLENT) return NAG.Excellent
    if (epLoss < EPL_GOOD) return NAG.Good
    return NAG.Neutral
  }

  /**
   * Criticality: positions with large eval swings are more critical.
   * Computes eval swing inline from adjacent nodes' evalCp.
   * Normalized to [0, 1] using a sigmoid-like curve.
   */
  private computeCriticality(
    prev: EngineResult | null,
    current: EngineResult,
    color: 'w' | 'b' | null,
  ): number {
    if (!prev || prev.evalCp == null || current.evalCp == null || !color) return 0
    const evalSwing = color === 'w'
      ? prev.evalCp - current.evalCp
      : current.evalCp - prev.evalCp
    const absSwing = Math.abs(evalSwing)
    return 1 / (1 + Math.exp(-0.02 * (absSwing - 100)))
  }

  private computeMistakeProbability(
    augmentedMaia: AugmentedMaiaResult,
    engineResult: EngineResult,
  ): MistakeProbability {
    const bestWdl = engineResult.wdl
    if (!bestWdl) {
      return { goodMoveProb: 0, inaccuracyProb: 0, mistakeProb: 0, blunderProb: 0 }
    }

    const bestEP = expectedPointsFromWDL(bestWdl)
    const predictions = augmentedMaia.predictions

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
        inaccuracyProb += w
        continue
      }

      // Approximate EP loss for this prediction using cp-based EP delta.
      // The prediction's stockfishEval is already White-normalized cp.
      // We compare it against the best move's EP.
      const predEP = this.cpToApproxEP(pred.stockfishEval, bestEP, engineResult.evalCp)
      const epLoss = Math.max(0, bestEP - predEP)

      if (epLoss < EPL_INACCURACY) {
        goodMoveProb += w
      } else if (epLoss < EPL_MISTAKE) {
        inaccuracyProb += w
      } else if (epLoss < EPL_BLUNDER) {
        mistakeProb += w
      } else {
        blunderProb += w
      }
    }

    return { goodMoveProb, inaccuracyProb, mistakeProb, blunderProb }
  }

  /**
   * Approximate EP for a predicted move's eval, relative to the best move's EP.
   * Uses the ratio of eval difference to scale from the known best EP.
   * Falls back to a simple linear approximation when the best cp is unavailable.
   */
  private cpToApproxEP(predCp: number, bestEP: number, bestCp: number | null): number {
    if (bestCp == null) return bestEP
    const cpDiff = bestCp - predCp
    // Scale: ~400cp difference ≈ 0.5 EP difference (logistic approximation)
    const epDelta = cpDiff / 800
    return Math.max(0, Math.min(1, bestEP - epDelta))
  }

  private normalizeMaiaProbabilities(scores: (number | undefined)[]): number[] {
    const hasScores = scores.some(s => s !== undefined)
    if (!hasScores || scores.length === 0) {
      const uniform = 1 / Math.max(scores.length, 1)
      return scores.map(() => uniform)
    }

    const logits = scores.map(s => (s ?? -Infinity) / 100)
    const maxLogit = Math.max(...logits.filter(l => l !== -Infinity))
    const exps = logits.map(l => Math.exp(l - maxLogit))
    const sum = exps.reduce((a, b) => a + b, 0)

    return exps.map(e => (sum > 0 ? e / sum : 0))
  }
}
