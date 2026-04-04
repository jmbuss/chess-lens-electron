import type {
  AnalysisNode,
  PositionalFeatures,
  EvalTermScore,
  PositionalRadarData,
  RadarAxisValue,
} from 'src/database/analysis/types'
import { expectedPointsFromWDL } from './MoveClassificationService'

// ==================== Eval-Delta Gating ====================

const GATE_MIDPOINT_CP = 50
const GATE_STEEPNESS = 0.04

/**
 * Returns a gate factor in [0, 1] based on the absolute eval swing between
 * adjacent positions. Small swings (equal trades) produce a value near 0;
 * meaningful eval shifts produce a value near 1.
 *
 * When prevEvalCp is null (root position), returns 1.0 (no damping).
 */
export function computeEvalDeltaGate(
  prevEvalCp: number | null | undefined,
  currentEvalCp: number | null | undefined,
): number {
  if (prevEvalCp == null || currentEvalCp == null) return 1.0
  const absSwing = Math.abs(currentEvalCp - prevEvalCp)
  return 1 / (1 + Math.exp(-GATE_STEEPNESS * (absSwing - GATE_MIDPOINT_CP)))
}

// ==================== WDL Volatility ====================

const DEFAULT_HALF_WINDOW = 3

/**
 * Computes standard deviation of EP values in a sliding window around `index`.
 * NaN entries (unanalyzed positions) are skipped. Returns 0 when the window
 * has fewer than 2 valid values.
 *
 * This is a shared signal: used by both the positional radar aggregation and
 * (in the future) the accuracy computation's volatility-weighted mean.
 */
export function computeWdlVolatility(
  epValues: number[],
  index: number,
  halfWindow: number = DEFAULT_HALF_WINDOW,
): number {
  const start = Math.max(0, index - halfWindow)
  const end = Math.min(epValues.length - 1, index + halfWindow)

  let sum = 0
  let count = 0
  for (let i = start; i <= end; i++) {
    if (!Number.isNaN(epValues[i])) {
      sum += epValues[i]
      count++
    }
  }
  if (count < 2) return 0

  const mean = sum / count
  let variance = 0
  for (let i = start; i <= end; i++) {
    if (!Number.isNaN(epValues[i])) {
      variance += (epValues[i] - mean) ** 2
    }
  }
  variance /= count

  return Math.sqrt(variance)
}

// ==================== Feature Helpers ====================

function blendMgEg(score: EvalTermScore | null | undefined, phaseWeight: number): number {
  if (!score) return 0
  return score.mg * phaseWeight + score.eg * (1 - phaseWeight)
}

type FeatureKey = keyof PositionalFeatures

const RADAR_AXES = [
  { key: 'pawnStructure' as const, terms: ['pawns', 'passed'] },
  { key: 'space' as const,         terms: ['space'] },
  { key: 'mobility' as const,      terms: ['mobility'] },
  { key: 'kingSafety' as const,    terms: ['kingSafety'] },
  { key: 'threats' as const,       terms: ['threats'] },
  { key: 'imbalance' as const,     terms: ['imbalance'] },
] as const

type RadarAxisKey = (typeof RADAR_AXES)[number]['key']

function computeAxisValueForSide(
  features: PositionalFeatures,
  terms: readonly string[],
  side: 'white' | 'black',
  phaseWeight: number,
): number {
  let sum = 0
  for (const term of terms) {
    const evalTerm = features[term as FeatureKey]
    if (evalTerm && typeof evalTerm === 'object' && 'white' in evalTerm) {
      sum += blendMgEg(evalTerm[side], phaseWeight)
    }
  }
  return sum
}

function computeMaterialForSide(
  features: PositionalFeatures,
  phaseWeight: number,
): number {
  return blendMgEg(features.material.total, phaseWeight)
}

// ==================== Main Aggregation ====================

const WEIGHT_ZERO_THRESHOLD = 1e-6

function emptyRadarData(): PositionalRadarData {
  const zeroAxis = (): RadarAxisValue => ({ white: 0, black: 0 })
  return {
    axes: {
      pawnStructure: zeroAxis(),
      space: zeroAxis(),
      mobility: zeroAxis(),
      kingSafety: zeroAxis(),
      threats: zeroAxis(),
      imbalance: zeroAxis(),
    },
    whiteMaterial: 0,
    blackMaterial: 0,
    hasData: false,
  }
}

/**
 * Walks the mainline (children[0] chain) and computes the weighted positional
 * radar data with two-stage noise reduction:
 *
 * 1. **Eval-delta gating** (per-move): suppresses feature values at positions
 *    where the eval barely changed (equal trades / quiet recaptures).
 * 2. **WDL volatility weighting** (aggregation): positions in strategically
 *    contested regions of the game carry more weight.
 *
 * Called from the game machine's `assign` blocks after each node completes.
 */
export function computePositionalRadarData(tree: AnalysisNode): PositionalRadarData {
  // Pass 1: collect mainline nodes and build the EP curve
  const mainline: AnalysisNode[] = []
  let current: AnalysisNode | undefined = tree
  while (current) {
    mainline.push(current)
    current = current.children[0]
  }

  const epCurve: number[] = []
  for (const node of mainline) {
    const wdl = node.engineResult?.wdl
    if (wdl) {
      epCurve.push(expectedPointsFromWDL(wdl))
    } else {
      epCurve.push(NaN)
    }
  }

  // Pass 2: accumulate gated, volatility-weighted feature values
  const whiteSums: Record<RadarAxisKey, number> = {
    pawnStructure: 0, space: 0, mobility: 0, kingSafety: 0, threats: 0, imbalance: 0,
  }
  const blackSums: Record<RadarAxisKey, number> = {
    pawnStructure: 0, space: 0, mobility: 0, kingSafety: 0, threats: 0, imbalance: 0,
  }
  let whiteWeightSum = 0
  let blackWeightSum = 0
  let whiteMaterialSum = 0
  let blackMaterialSum = 0
  let whiteMaterialWeightSum = 0
  let blackMaterialWeightSum = 0

  for (let i = 0; i < mainline.length; i++) {
    const node = mainline[i]
    const features = node.positionalFeatures
    const evalCp = node.engineResult?.evalCp
    const wdl = node.engineResult?.wdl
    if (!features || evalCp == null || !wdl) continue

    const phaseWeight = node.phaseScore != null
      ? Math.max(0, Math.min(1, node.phaseScore / 128))
      : 0.5

    // Stage 1: eval-delta gate
    const prevEvalCp = i > 0 ? mainline[i - 1].engineResult?.evalCp : null
    const gate = computeEvalDeltaGate(prevEvalCp, evalCp)

    // Stage 2: WDL volatility weight
    const volatility = computeWdlVolatility(epCurve, i)
    const weight = Math.max(volatility, WEIGHT_ZERO_THRESHOLD)

    // Combine: gated value * volatility weight
    const effectiveWeight = gate * weight

    if (evalCp > 0) {
      for (const axis of RADAR_AXES) {
        const value = computeAxisValueForSide(features, axis.terms, 'white', phaseWeight)
        whiteSums[axis.key] += value * effectiveWeight
      }
      whiteWeightSum += effectiveWeight

      whiteMaterialSum += computeMaterialForSide(features, phaseWeight) * effectiveWeight
      whiteMaterialWeightSum += effectiveWeight
    }

    if (evalCp < 0) {
      for (const axis of RADAR_AXES) {
        const value = computeAxisValueForSide(features, axis.terms, 'black', phaseWeight)
        blackSums[axis.key] += value * effectiveWeight
      }
      blackWeightSum += effectiveWeight

      blackMaterialSum += -computeMaterialForSide(features, phaseWeight) * effectiveWeight
      blackMaterialWeightSum += effectiveWeight
    }
  }

  // Weighted averages
  const whiteAvg: Record<RadarAxisKey, number> = {} as any
  const blackAvg: Record<RadarAxisKey, number> = {} as any
  for (const axis of RADAR_AXES) {
    whiteAvg[axis.key] = whiteWeightSum > WEIGHT_ZERO_THRESHOLD
      ? whiteSums[axis.key] / whiteWeightSum : 0
    blackAvg[axis.key] = blackWeightSum > WEIGHT_ZERO_THRESHOLD
      ? blackSums[axis.key] / blackWeightSum : 0
  }

  // Normalize per axis: stronger player scores 1.0, other is relative
  const result = emptyRadarData()
  for (const axis of RADAR_AXES) {
    const maxVal = Math.max(Math.abs(whiteAvg[axis.key]), Math.abs(blackAvg[axis.key]))
    if (maxVal > WEIGHT_ZERO_THRESHOLD) {
      result.axes[axis.key] = {
        white: Math.max(0, whiteAvg[axis.key] / maxVal),
        black: Math.max(0, blackAvg[axis.key] / maxVal),
      }
    }
  }

  result.whiteMaterial = whiteMaterialWeightSum > WEIGHT_ZERO_THRESHOLD
    ? whiteMaterialSum / whiteMaterialWeightSum : 0
  result.blackMaterial = blackMaterialWeightSum > WEIGHT_ZERO_THRESHOLD
    ? blackMaterialSum / blackMaterialWeightSum : 0

  result.hasData = whiteWeightSum > WEIGHT_ZERO_THRESHOLD || blackWeightSum > WEIGHT_ZERO_THRESHOLD

  return result
}

