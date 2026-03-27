import { computed, type ComputedRef } from 'vue'
import type { AnalysisNode, PositionalFeatures, EvalTermScore } from 'src/database/analysis/types'

export interface GameSummaryRadarData {
  white: number[]
  black: number[]
  labels: string[]
  whiteMaterial: number
  blackMaterial: number
  hasData: boolean
}

/**
 * Radar axes — sourced directly from Stockfish HCE terms.
 * Material (material + imbalance) and piece-specific terms are excluded;
 * material is tracked as a scalar, piece terms are eval-transient.
 */
const RADAR_AXES = [
  { label: 'Pawn Structure', terms: ['pawns', 'passed'] },
  { label: 'Space',          terms: ['space'] },
  { label: 'Mobility',       terms: ['mobility'] },
  { label: 'King Safety',    terms: ['kingSafety'] },
  { label: 'Threats',        terms: ['threats'] },
] as const

const MATERIAL_TERMS = ['material', 'imbalance'] as const

const WEIGHT_ZERO_THRESHOLD = 1e-6
const DIVERGENCE_THRESHOLD_CP = 150

type FeatureKey = keyof PositionalFeatures

function blendMgEg(score: EvalTermScore | null | undefined, phaseWeight: number): number {
  if (!score) return 0
  return score.mg * phaseWeight + score.eg * (1 - phaseWeight)
}

function computeAxisValue(
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

function computeMaterialValue(
  features: PositionalFeatures,
  phaseWeight: number,
): number {
  let sum = 0
  for (const term of MATERIAL_TERMS) {
    sum += blendMgEg(features[term].total, phaseWeight)
  }
  return sum
}

export function useGameSummaryRadar(analysisByFen: ComputedRef<Map<string, AnalysisNode>>) {
  return computed<GameSummaryRadarData>(() => {
    const labels = RADAR_AXES.map(a => a.label)
    const axisCount = RADAR_AXES.length

    const whiteSums = new Array<number>(axisCount).fill(0)
    const blackSums = new Array<number>(axisCount).fill(0)
    let whiteWeightSum = 0
    let blackWeightSum = 0
    let whiteMaterialSum = 0
    let blackMaterialSum = 0
    let whiteMaterialWeightSum = 0
    let blackMaterialWeightSum = 0

    for (const node of analysisByFen.value.values()) {
      const features = node.positionalFeatures
      const evalCp = node.engineResult?.evalCp
      if (!features || evalCp == null) continue

      const phaseWeight = node.phaseScore != null
        ? Math.max(0, Math.min(1, node.phaseScore / 128))
        : 0.5

      let weight = 1 - Math.exp(-Math.abs(evalCp) / 100)

      // NNUE / classical divergence → halve weight when evals disagree significantly.
      // features.finalEvaluation is in pawns; evalCp is in centipawns.
      const classicalCp = features.finalEvaluation * 100
      if (Math.abs(evalCp - classicalCp) > DIVERGENCE_THRESHOLD_CP) {
        weight *= 0.5
      }

      if (evalCp > 0) {
        for (let i = 0; i < axisCount; i++) {
          whiteSums[i] += computeAxisValue(features, RADAR_AXES[i].terms, 'white', phaseWeight) * weight
        }
        whiteWeightSum += weight

        whiteMaterialSum += computeMaterialValue(features, phaseWeight) * weight
        whiteMaterialWeightSum += weight
      }

      if (evalCp < 0) {
        for (let i = 0; i < axisCount; i++) {
          blackSums[i] += computeAxisValue(features, RADAR_AXES[i].terms, 'black', phaseWeight) * weight
        }
        blackWeightSum += weight

        // Negate material total so Black's advantage is expressed as a positive value
        blackMaterialSum += -computeMaterialValue(features, phaseWeight) * weight
        blackMaterialWeightSum += weight
      }
    }

    // Weighted averages
    const whiteAvg = whiteSums.map(s => whiteWeightSum > WEIGHT_ZERO_THRESHOLD ? s / whiteWeightSum : 0)
    const blackAvg = blackSums.map(s => blackWeightSum > WEIGHT_ZERO_THRESHOLD ? s / blackWeightSum : 0)

    // Normalize per axis: stronger player scores 1.0, other is relative
    const white: number[] = []
    const black: number[] = []
    for (let i = 0; i < axisCount; i++) {
      const maxVal = Math.max(whiteAvg[i], blackAvg[i])
      if (maxVal > WEIGHT_ZERO_THRESHOLD) {
        white.push(Math.max(0, whiteAvg[i] / maxVal))
        black.push(Math.max(0, blackAvg[i] / maxVal))
      } else {
        white.push(0)
        black.push(0)
      }
    }

    const whiteMaterial = whiteMaterialWeightSum > WEIGHT_ZERO_THRESHOLD
      ? whiteMaterialSum / whiteMaterialWeightSum
      : 0
    const blackMaterial = blackMaterialWeightSum > WEIGHT_ZERO_THRESHOLD
      ? blackMaterialSum / blackMaterialWeightSum
      : 0

    const hasData = whiteWeightSum > WEIGHT_ZERO_THRESHOLD || blackWeightSum > WEIGHT_ZERO_THRESHOLD

    return { white, black, labels, whiteMaterial, blackMaterial, hasData }
  })
}
