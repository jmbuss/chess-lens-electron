import { setup, assign, fromPromise } from 'xstate'
import type { AnalysisLine, WDL } from 'src/services/engine/types'
import type {
  AnalysisModeConfig,
  MaiaAnalysisResult,
  AugmentedMaiaResult,
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
  config: AnalysisModeConfig
}

export interface PositionOutput {
  engineResult: EngineResult | null
  maiaFloorResult: MaiaAnalysisResult | null
  maiaCeilingResult: MaiaAnalysisResult | null
  augmentedMaiaFloor: AugmentedMaiaResult | null
  augmentedMaiaCeiling: AugmentedMaiaResult | null
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
    events: {} as { type: 'STOP' },
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
    computePositionalData: fromPromise<ComputePositionalDataResult, ComputePositionalDataInput>(async () => {
      throw new Error('computePositionalData actor not provided — use .provide()')
    }),
    stopEngines: fromPromise<void>(async () => {
      throw new Error('stopEngines actor not provided — use .provide()')
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
  }),
  output: ({ context }) => ({
    engineResult: context.engineResult,
    maiaFloorResult: context.maiaFloorResult,
    maiaCeilingResult: context.maiaCeilingResult,
    augmentedMaiaFloor: context.augmentedMaiaFloor,
    augmentedMaiaCeiling: context.augmentedMaiaCeiling,
    phaseResult: context.phaseResult,
    positionalFeatures: context.positionalFeatures,
    maiaFloorBestEval: context.augmentedMaiaFloor?.predictions[0]?.stockfishEval ?? null,
    maiaCeilingBestEval: context.augmentedMaiaCeiling?.predictions[0]?.stockfishEval ?? null,
  }),

  on: {
    STOP: { target: '.STOP_AND_WAIT' },
  },

  states: {
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
              }
            }),
          },
          { target: 'GATHERING' },
        ],
        onError: 'GATHERING',
      },
    },

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

    EVAL_MAIA_MOVES: {
      always: [
        {
          guard: ({ context }) => context.engineResult == null,
          target: 'COMPLETE',
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
          target: 'COMPLETE',
          actions: assign(({ event }) => ({
            augmentedMaiaFloor: event.output.augmentedFloor,
            augmentedMaiaCeiling: event.output.augmentedCeiling,
          })),
        },
        onError: 'COMPLETE',
      },
    },

    /**
     * Engine drain: entered via the STOP event from any active state.
     * XState auto-cancels in-flight actors on exit; stopEngines sends UCI
     * `stop` and waits for `bestmove` so engines are clean for the next search.
     */
    STOP_AND_WAIT: {
      invoke: {
        src: 'stopEngines',
        onDone: 'STOPPED',
        onError: 'STOPPED',
      },
    },

    /** Coordinator awaits this via toPromise(actor). */
    STOPPED: { type: 'final' },

    COMPLETE: { type: 'final' },
  },
})
