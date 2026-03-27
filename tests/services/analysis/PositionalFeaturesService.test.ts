import { describe, it, expect } from 'vitest'
import { parseEvalOutput } from 'src/services/analysis/StockfishClassicEvalService'

// Sample output captured from stockfish-classic for the starting position.
const SAMPLE_OUTPUT = `
     Term    |    White    |    Black    |    Total   
             |   MG    EG  |   MG    EG  |   MG    EG 
 ------------+-------------+-------------+------------
    Material |  ----  ---- |  ----  ---- | -0.17  0.06
   Imbalance |  ----  ---- |  ----  ---- |  0.00  0.00
       Pawns |  0.76 -0.00 |  0.49 -0.03 |  0.28  0.03
     Knights |  0.08 -0.05 |  0.17 -0.03 | -0.08 -0.02
     Bishops | -0.35 -0.74 | -0.08 -0.30 | -0.27 -0.44
       Rooks |  0.17  0.03 |  0.08  0.00 |  0.09  0.03
      Queens |  0.00  0.00 | -0.27 -0.07 |  0.27  0.07
    Mobility |  0.91  1.96 |  0.70  1.74 |  0.21  0.22
 King safety |  0.28 -0.05 |  0.46 -0.05 | -0.18  0.00
     Threats |  0.31  0.31 |  0.37  0.33 | -0.06 -0.02
      Passed |  0.00  0.00 |  0.00  0.00 |  0.00  0.00
       Space |  0.93  0.00 |  0.54  0.00 |  0.39  0.00
    Winnable |  ----  ---- |  ----  ---- |  0.00 -0.12
 ------------+-------------+-------------+------------
       Total |  ----  ---- |  ----  ---- |  0.47 -0.19

Final evaluation: 0.45 (white side)
`.trim().split('\n')

describe('parseEvalOutput', () => {
  it('parses pawns term correctly', () => {
    const result = parseEvalOutput(SAMPLE_OUTPUT)
    expect(result.pawns.white).toEqual({ mg: 0.76, eg: -0.00 })
    expect(result.pawns.black).toEqual({ mg: 0.49, eg: -0.03 })
    expect(result.pawns.total).toEqual({ mg: 0.28, eg: 0.03 })
  })

  it('parses null for terms reported as ----', () => {
    const result = parseEvalOutput(SAMPLE_OUTPUT)
    expect(result.material.white).toBeNull()
    expect(result.material.black).toBeNull()
    expect(result.imbalance.white).toBeNull()
    expect(result.winnable.white).toBeNull()
  })

  it('parses material total (white/black are ----)', () => {
    const result = parseEvalOutput(SAMPLE_OUTPUT)
    expect(result.material.total).toEqual({ mg: -0.17, eg: 0.06 })
  })

  it('parses mobility term', () => {
    const result = parseEvalOutput(SAMPLE_OUTPUT)
    expect(result.mobility.white).toEqual({ mg: 0.91, eg: 1.96 })
    expect(result.mobility.black).toEqual({ mg: 0.70, eg: 1.74 })
    expect(result.mobility.total).toEqual({ mg: 0.21, eg: 0.22 })
  })

  it('parses king safety term', () => {
    const result = parseEvalOutput(SAMPLE_OUTPUT)
    expect(result.kingSafety.white).toEqual({ mg: 0.28, eg: -0.05 })
    expect(result.kingSafety.black).toEqual({ mg: 0.46, eg: -0.05 })
    expect(result.kingSafety.total).toEqual({ mg: -0.18, eg: 0.00 })
  })

  it('parses final evaluation', () => {
    const result = parseEvalOutput(SAMPLE_OUTPUT)
    expect(result.finalEvaluation).toBeCloseTo(0.45)
  })

  it('all 13 terms are present', () => {
    const result = parseEvalOutput(SAMPLE_OUTPUT)
    const terms = [
      'material', 'imbalance', 'pawns', 'knights', 'bishops',
      'rooks', 'queens', 'mobility', 'kingSafety', 'threats',
      'passed', 'space', 'winnable',
    ] as const
    for (const term of terms) {
      expect(result[term], `term "${term}" missing`).toBeDefined()
    }
  })

  it('returns defaults when given empty input', () => {
    const result = parseEvalOutput([])
    expect(result.finalEvaluation).toBe(0)
    expect(result.pawns.white).toBeNull()
  })
})
