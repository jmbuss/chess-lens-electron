import { setup, assign, fromPromise } from 'xstate'
import type { NAG, AnalysisLine, WDL } from 'src/services/engine/types'
import type {
  AnalysisModeConfig,
  MaiaAnalysisResult,
  AugmentedMaiaResult,
  MistakeProbability,
  PositionalFeatures,
} from 'src/database/analysis/types'
import type { PhaseResult } from 'src/services/analysis/PhaseClassificationService'

// ==================== Shared Result Types ====================

export interface EngineResult {
  evalCp: number | null
  evalMate: number | null
  wdl: WDL | null
  bestMove: string
  depth: number
  lines: AnalysisLine[]
}

export interface MaiaPairResult {
  floor: MaiaAnalysisResult | null
  ceiling: MaiaAnalysisResult | null
}

// ==================== Machine Input / Output ====================

export interface PositionInput {
  fen: string
  ply: number
  /** The UCI move that was played to reach this position. Null for the starting position. */
  uciMove: string | null
  /** Color that made this move: 'w' or 'b'. Null for the root position. */
  color: 'w' | 'b' | null
  config: AnalysisModeConfig
  evalCurve: number[]
  /** Engine result from the previous position, needed for classification. */
  prevEngineResult: EngineResult | null
}

export interface PositionOutput {
  engineResult: EngineResult | null
  maiaFloorResult: MaiaAnalysisResult | null
  maiaCeilingResult: MaiaAnalysisResult | null
  augmentedMaiaFloor: AugmentedMaiaResult | null
  augmentedMaiaCeiling: AugmentedMaiaResult | null
  nag: NAG
  isBestMove: boolean
  moveAccuracy: number | null
  criticalityScore: number | null
  floorMistakeProb: MistakeProbability | null
  ceilingMistakeProb: MistakeProbability | null
  phaseResult: PhaseResult | null
  positionalFeatures: PositionalFeatures | null
  maiaFloorBestEval: number | null
  maiaCeilingBestEval: number | null
}

// ==================== Context ====================

interface PositionContext extends PositionInput {
  // GATHERING.ENGINE
  engineResult: EngineResult | null

  // GATHERING.MAIA
  maiaFloorResult: MaiaAnalysisResult | null
  maiaCeilingResult: MaiaAnalysisResult | null

  // GATHERING.FEATURES
  phaseResult: PhaseResult | null
  positionalFeatures: PositionalFeatures | null

  // EVAL_MAIA_MOVES
  augmentedMaiaFloor: AugmentedMaiaResult | null
  augmentedMaiaCeiling: AugmentedMaiaResult | null

  // CLASSIFY
  nag: NAG | null
  isBestMove: boolean | null
  moveAccuracy: number | null
  criticalityScore: number | null
  floorMistakeProb: MistakeProbability | null
  ceilingMistakeProb: MistakeProbability | null
}

// ==================== Actor Input Types ====================

interface AnalyzePositionInput {
  fen: string
  config: AnalysisModeConfig
}

interface AnalyzeMaiaPairInput {
  fen: string
  config: AnalysisModeConfig
}

export interface EvalMaiaMovesInput {
  fen: string
  engineResult: EngineResult
  maiaFloorResult: MaiaAnalysisResult | null
  maiaCeilingResult: MaiaAnalysisResult | null
  config: AnalysisModeConfig
}

export interface EvalMaiaMovesResult {
  augmentedFloor: AugmentedMaiaResult | null
  augmentedCeiling: AugmentedMaiaResult | null
}

export interface ClassifyPositionInput {
  prevEngineResult: EngineResult | null
  engineResult: EngineResult
  augmentedMaiaFloor: AugmentedMaiaResult | null
  augmentedMaiaCeiling: AugmentedMaiaResult | null
  uciMove: string | null
  color: 'w' | 'b' | null
  isBookMove: boolean
}

export interface ClassifyPositionResult {
  nag: NAG
  isBestMove: boolean
  moveAccuracy: number | null
  criticalityScore: number
  floorMistakeProb: MistakeProbability | null
  ceilingMistakeProb: MistakeProbability | null
}

export interface ComputePositionalDataInput {
  fen: string
  ply: number
}

export interface ComputePositionalDataResult {
  phase: PhaseResult
  features: PositionalFeatures
}

// ==================== Cache Probe ====================

export interface CacheProbeInput {
  fen: string
}

// ==================== Machine ====================

export const positionMachine = setup({
  types: {
    input: {} as PositionInput,
    context: {} as PositionContext,
    output: {} as PositionOutput,
  },
  actors: {
    loadPositionCache: fromPromise<PositionOutput | null, CacheProbeInput>(async () => {
      throw new Error('loadPositionCache actor not provided — use .provide()')
    }),
    analyzePosition: fromPromise<EngineResult, AnalyzePositionInput>(async () => {
      throw new Error('analyzePosition actor not provided — use .provide()')
    }),
    analyzeMaiaPair: fromPromise<MaiaPairResult, AnalyzeMaiaPairInput>(async () => {
      throw new Error('analyzeMaiaPair actor not provided — use .provide()')
    }),
    evalMaiaMoves: fromPromise<EvalMaiaMovesResult, EvalMaiaMovesInput>(async () => {
      throw new Error('evalMaiaMoves actor not provided — use .provide()')
    }),
    classifyPosition: fromPromise<ClassifyPositionResult, ClassifyPositionInput>(async () => {
      throw new Error('classifyPosition actor not provided — use .provide()')
    }),
    computePositionalData: fromPromise<ComputePositionalDataResult, ComputePositionalDataInput>(async () => {
      throw new Error('computePositionalData actor not provided — use .provide()')
    }),
  },
  guards: {
    isCacheHit: (_, params: { result: PositionOutput | null }) => params.result != null,
  },
}).createMachine({
  id: 'position',
  initial: 'CACHE_PROBE',
  context: ({ input }) => ({
    ...input,
    engineResult: null,
    maiaFloorResult: null,
    maiaCeilingResult: null,
    phaseResult: null,
    positionalFeatures: null,
    augmentedMaiaFloor: null,
    augmentedMaiaCeiling: null,
    nag: null,
    isBestMove: null,
    moveAccuracy: null,
    criticalityScore: null,
    floorMistakeProb: null,
    ceilingMistakeProb: null,
  }),
  output: ({ context }) => ({
    engineResult: context.engineResult,
    maiaFloorResult: context.maiaFloorResult,
    maiaCeilingResult: context.maiaCeilingResult,
    augmentedMaiaFloor: context.augmentedMaiaFloor,
    augmentedMaiaCeiling: context.augmentedMaiaCeiling,
    nag: context.nag!,
    isBestMove: context.isBestMove!,
    moveAccuracy: context.moveAccuracy,
    criticalityScore: context.criticalityScore,
    floorMistakeProb: context.floorMistakeProb,
    ceilingMistakeProb: context.ceilingMistakeProb,
    phaseResult: context.phaseResult,
    positionalFeatures: context.positionalFeatures,
    maiaFloorBestEval: context.augmentedMaiaFloor?.predictions[0]?.stockfishEval ?? null,
    maiaCeilingBestEval: context.augmentedMaiaCeiling?.predictions[0]?.stockfishEval ?? null,
  }),
  states: {
    /**
     * Step 0: Check position_analysis cache before running engines.
     * The cache loader is injected by GameCoordinator so the machine
     * has no direct dependency on SQLite.
     */
    CACHE_PROBE: {
      invoke: {
        src: 'loadPositionCache',
        input: ({ context }): CacheProbeInput => ({ fen: context.fen }),
        onDone: [
          {
            guard: {
              type: 'isCacheHit',
              params: ({ event }) => ({ result: event.output }),
            },
            target: 'COMPLETE',
            actions: assign(({ event }) => {
              const cached = event.output as PositionOutput
              return {
                engineResult: cached.engineResult,
                maiaFloorResult: cached.maiaFloorResult,
                maiaCeilingResult: cached.maiaCeilingResult,
                phaseResult: cached.phaseResult,
                positionalFeatures: cached.positionalFeatures,
                augmentedMaiaFloor: cached.augmentedMaiaFloor,
                augmentedMaiaCeiling: cached.augmentedMaiaCeiling,
                nag: cached.nag,
                isBestMove: cached.isBestMove,
                moveAccuracy: cached.moveAccuracy,
                criticalityScore: cached.criticalityScore,
                floorMistakeProb: cached.floorMistakeProb,
                ceilingMistakeProb: cached.ceilingMistakeProb,
              }
            }),
          },
          { target: 'GATHERING' },
        ],
        onError: 'GATHERING',
      },
    },

    /**
     * Step 1: Parallel data gathering.
     * Stockfish finds top N lines while Maia predicts human moves.
     * Both branches are non-fatal — errors land in their DONE state.
     */
    GATHERING: {
      type: 'parallel',
      states: {
        ENGINE: {
          initial: 'RUNNING',
          states: {
            RUNNING: {
              invoke: {
                src: 'analyzePosition',
                input: ({ context }) => ({
                  fen: context.fen,
                  config: context.config,
                }),
                onDone: {
                  target: 'DONE',
                  actions: assign({ engineResult: ({ event }) => event.output }),
                },
                onError: 'DONE',
              },
            },
            DONE: { type: 'final' },
          },
        },

        MAIA: {
          initial: 'RUNNING',
          states: {
            RUNNING: {
              invoke: {
                src: 'analyzeMaiaPair',
                input: ({ context }) => ({ fen: context.fen, config: context.config }),
                onDone: {
                  target: 'DONE',
                  actions: assign(({ event }) => ({
                    maiaFloorResult: event.output.floor,
                    maiaCeilingResult: event.output.ceiling,
                  })),
                },
                onError: 'DONE',
              },
            },
            DONE: { type: 'final' },
          },
        },

        /**
         * Positional data gathering: phase classification + structural features.
         * Pure FEN-based computation — runs in parallel with Stockfish and Maia
         * at effectively zero latency cost.
         */
        FEATURES: {
          initial: 'RUNNING',
          states: {
            RUNNING: {
              invoke: {
                src: 'computePositionalData',
                input: ({ context }) => ({ fen: context.fen, ply: context.ply }),
                onDone: {
                  target: 'DONE',
                  actions: assign(({ event }) => ({
                    phaseResult: event.output.phase,
                    positionalFeatures: event.output.features,
                  })),
                },
                onError: 'DONE',
              },
            },
            DONE: { type: 'final' },
          },
        },
      },
      onDone: 'EVAL_MAIA_MOVES',
    },

    /**
     * Step 2: Cross-reference Maia predictions with Stockfish lines.
     * Runs a second Stockfish pass for any Maia moves not in the top N.
     * Skipped if engine analysis failed (no engine result to cross-reference).
     */
    EVAL_MAIA_MOVES: {
      always: [
        {
          guard: ({ context }) => context.engineResult == null,
          target: 'CLASSIFY',
        },
      ],
      invoke: {
        src: 'evalMaiaMoves',
        input: ({ context }) => ({
          fen: context.fen,
          engineResult: context.engineResult!,
          maiaFloorResult: context.maiaFloorResult,
          maiaCeilingResult: context.maiaCeilingResult,
          config: context.config,
        }),
        onDone: {
          target: 'CLASSIFY',
          actions: assign(({ event }) => ({
            augmentedMaiaFloor: event.output.augmentedFloor,
            augmentedMaiaCeiling: event.output.augmentedCeiling,
          })),
        },
        onError: 'CLASSIFY',
      },
    },

    /**
     * Step 3: Derive NAG, mistake probabilities.
     * Pure computation — no engine calls.
     * Skipped if engine analysis failed.
     */
    CLASSIFY: {
      always: [
        {
          guard: ({ context }) => context.engineResult == null,
          target: 'COMPLETE',
        },
      ],
      invoke: {
        src: 'classifyPosition',
        input: ({ context }) => ({
          prevEngineResult: context.prevEngineResult,
          engineResult: context.engineResult!,
          augmentedMaiaFloor: context.augmentedMaiaFloor,
          augmentedMaiaCeiling: context.augmentedMaiaCeiling,
          uciMove: context.uciMove,
          color: context.color,
          isBookMove: context.phaseResult?.ecoMatch != null,
        }),
        onDone: {
          target: 'COMPLETE',
          actions: assign(({ event }) => ({
            nag: event.output.nag,
            isBestMove: event.output.isBestMove,
            moveAccuracy: event.output.moveAccuracy,
            criticalityScore: event.output.criticalityScore,
            floorMistakeProb: event.output.floorMistakeProb,
            ceilingMistakeProb: event.output.ceilingMistakeProb,
          })),
        },
        onError: 'COMPLETE',
      },
    },

    COMPLETE: { type: 'final' },
  },
})
