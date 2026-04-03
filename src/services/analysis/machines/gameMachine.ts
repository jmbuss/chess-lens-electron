import { setup, assign, fromPromise } from 'xstate'
import type { NAG } from 'src/services/engine/types'
import type {
  AnalysisModeConfig,
  AnalysisNode,
  AnalysisPreset,
  GameAnalysisData,
  GameFSMState,
  PositionalRadarData,
} from 'src/database/analysis/types'
import { expectedPointsFromWDL, moveAccuracyFromEPL } from 'src/services/analysis/MoveClassificationService'
import { computePositionalRadarData } from 'src/services/analysis/featureAttribution'
import { positionMachine } from './positionMachine'
import type { PositionInput, PositionOutput, EngineResult } from './positionMachine'

// ==================== Tree Helpers ====================

/**
 * Find a node by id anywhere in the tree (DFS). Returns null if not found.
 */
export function findNodeById(root: AnalysisNode, id: number): AnalysisNode | null {
  if (root.id === id) return root
  for (const child of root.children) {
    const found = findNodeById(child, id)
    if (found) return found
  }
  return null
}

/**
 * Find the direct parent of a node by targetId (DFS). Returns null if not found
 * or if the target is the root.
 */
export function findParentOfNode(root: AnalysisNode, targetId: number): AnalysisNode | null {
  for (const child of root.children) {
    if (child.id === targetId) return root
    const found = findParentOfNode(child, targetId)
    if (found) return found
  }
  return null
}

/**
 * DFS traversal (children[0]-first so mainline is always processed before
 * variations at each depth). Returns the first UNANALYZED node that is not
 * the node identified by `skipId`.
 */
export function findNextUnanalyzedNode(
  node: AnalysisNode,
  skipId: number,
): AnalysisNode | null {
  if (node.id !== skipId && node.fsmState === 'UNANALYZED') return node
  for (const child of node.children) {
    const found = findNextUnanalyzedNode(child, skipId)
    if (found) return found
  }
  return null
}

/**
 * Walk the children[0] chain and collect evalCp values for every mainline
 * node that has been analyzed. Called after each node completes to keep the
 * eval curve in sync without requiring in-order processing.
 */
export function buildEvalCurveFromMainLine(root: AnalysisNode): number[] {
  const curve: number[] = []
  let current: AnalysisNode | undefined = root
  while (current) {
    if (current.engineResult?.evalCp != null) {
      curve.push(current.engineResult.evalCp)
    }
    current = current.children[0]
  }
  return curve
}

/**
 * Walk the children[0] chain and collect the floor Maia model's best-move
 * Stockfish eval for each analyzed mainline node.
 */
export function buildMaiaFloorEvalCurve(root: AnalysisNode): number[] {
  const curve: number[] = []
  let current: AnalysisNode | undefined = root
  while (current) {
    if (current.maiaFloorBestEval != null) {
      curve.push(current.maiaFloorBestEval)
    }
    current = current.children[0]
  }
  return curve
}

/**
 * Walk the children[0] chain and collect the ceiling Maia model's best-move
 * Stockfish eval for each analyzed mainline node.
 */
export function buildMaiaCeilingEvalCurve(root: AnalysisNode): number[] {
  const curve: number[] = []
  let current: AnalysisNode | undefined = root
  while (current) {
    if (current.maiaCeilingBestEval != null) {
      curve.push(current.maiaCeilingBestEval)
    }
    current = current.children[0]
  }
  return curve
}

// ==================== Player Stats ====================

export interface PlayerStats {
  accuracy: number | null
  nagCounts: Partial<Record<NAG, number>>
  bookMoveCount: number
  totalMoves: number
  bestMoveCount: number
}

function emptyStats(): PlayerStats {
  return { accuracy: null, nagCounts: {}, bookMoveCount: 0, totalMoves: 0, bestMoveCount: 0 }
}

/**
 * Walk the mainline (children[0] chain) and compute per-player stats.
 * Accuracy uses EPL derived on-the-fly from adjacent nodes' WDL.
 * Currently a simple arithmetic mean — consider blending with a harmonic
 * mean (penalizes inconsistency) once volatility weighting is added.
 */
export function computePlayerStats(root: AnalysisNode, color: 'w' | 'b'): PlayerStats {
  const stats = emptyStats()
  const moveAccuracies: number[] = []

  let prev: AnalysisNode | undefined = root
  let current: AnalysisNode | undefined = root.children[0]

  while (current) {
    if (current.color === color && current.fsmState === 'NAG_COMPLETE') {
      stats.totalMoves++

      if (current.isBookMove) {
        stats.bookMoveCount++
      } else {
        if (current.isBestMove) stats.bestMoveCount++

        const nag = current.nag
        if (nag != null) {
          stats.nagCounts[nag] = (stats.nagCounts[nag] ?? 0) + 1
        }

        const prevWdl = prev?.engineResult?.wdl ?? null
        const currentWdl = current.engineResult?.wdl ?? null
        if (prevWdl && currentWdl) {
          const epBefore = expectedPointsFromWDL(prevWdl)
          const epAfter = expectedPointsFromWDL(currentWdl)
          const epLoss = color === 'w' ? epBefore - epAfter : epAfter - epBefore
          moveAccuracies.push(moveAccuracyFromEPL(Math.max(0, epLoss)))
        }
      }
    }

    prev = current
    current = current.children[0]
  }

  if (moveAccuracies.length > 0) {
    stats.accuracy = moveAccuracies.reduce((a, b) => a + b, 0) / moveAccuracies.length
  }

  return stats
}

// ==================== Tree Mutation Helpers ====================

/**
 * Return a new tree with `node` appended as a child of the node whose id
 * matches `parentId`. Uses path-cloning (structural sharing). Returns the
 * original tree unchanged if `parentId` is not found.
 */
export function insertChildNode(
  root: AnalysisNode,
  parentId: number,
  node: AnalysisNode,
): AnalysisNode {
  if (root.id === parentId) {
    return { ...root, children: [...root.children, node] }
  }
  let changed = false
  const newChildren = root.children.map(child => {
    const updated = insertChildNode(child, parentId, node)
    if (updated !== child) changed = true
    return updated
  })
  return changed ? { ...root, children: newChildren } : root
}

/**
 * Return a new tree with the node matching `nodeId` patched with analysis
 * results. Uses path-cloning (structural sharing): only nodes on the path
 * from root to the target are new objects. Returns the original tree
 * unchanged if `nodeId` is not found.
 */
export function setNodeResult(
  node: AnalysisNode,
  nodeId: number,
  result: PositionOutput,
): AnalysisNode {
  if (node.id === nodeId) {
    return {
      ...node,
      fsmState: 'NAG_COMPLETE',
      engineResult: result.engineResult ?? undefined,
      criticalityScore: result.criticalityScore ?? undefined,
      nag: result.nag,
      isBestMove: result.isBestMove,
      maiaFloorResult: result.maiaFloorResult ?? undefined,
      maiaCeilingResult: result.maiaCeilingResult ?? undefined,
      augmentedMaiaFloor: result.augmentedMaiaFloor ?? undefined,
      augmentedMaiaCeiling: result.augmentedMaiaCeiling ?? undefined,
      floorMistakeProb: result.floorMistakeProb ?? undefined,
      ceilingMistakeProb: result.ceilingMistakeProb ?? undefined,
      phaseScore: result.phaseResult?.phaseScore,
      openingScore: result.phaseResult?.openingScore,
      middlegameScore: result.phaseResult?.middlegameScore,
      endgameScore: result.phaseResult?.endgameScore,
      ecoCode: result.phaseResult?.ecoMatch?.eco ?? undefined,
      isBookMove: result.phaseResult != null
        ? result.phaseResult.ecoMatch != null
        : undefined,
      positionalFeatures: result.positionalFeatures ?? undefined,
      maiaFloorBestEval: result.maiaFloorBestEval,
      maiaCeilingBestEval: result.maiaCeilingBestEval,
    }
  }

  let changed = false
  const newChildren = node.children.map(child => {
    const updated = setNodeResult(child, nodeId, result)
    if (updated !== child) changed = true
    return updated
  })

  return changed ? { ...node, children: newChildren } : node
}

// ==================== Machine Input ====================

/**
 * Input required to create or resume the game actor. `currentNodeId` defaults
 * to the root — IDLE will dispatch BACKGROUND_PROCESSING to sweep all
 * UNANALYZED nodes naturally, so no cursor-scanning is needed on resume.
 */
export interface GameInput {
  data: GameAnalysisData & { tree: AnalysisNode }
  /** Config used when processing a position the user has navigated to. */
  focusConfig: AnalysisModeConfig
  /** Config used during the background sweep of all remaining positions. */
  backgroundConfig: AnalysisModeConfig
  /** The node the user currently has focused. Defaults to root on fresh start. */
  currentNodeId: number
}

// ==================== Context ====================

export interface GameContext {
  // ── Persisted (GameAnalysisData fields) ──────────────────────────────────
  gameId: string
  pgnHash: string
  schemaVersion: number
  gameFsmState: GameFSMState
  tree: AnalysisNode
  evalCurve: number[]
  maiaFloorEvalCurve: number[]
  maiaCeilingEvalCurve: number[]
  nextId: number
  preset: AnalysisPreset

  // ── Runtime only ──────────────────────────────────────────────────────────
  focusConfig: AnalysisModeConfig
  backgroundConfig: AnalysisModeConfig
  /** The node the user currently has focused (set via navigate event). */
  currentNodeId: number
  /**
   * Node IDs that have already received a deep (study) re-analysis in this
   * session. Not persisted — resets on each app session so the user always
   * gets fresh deep analysis when they revisit a position.
   */
  deepAnalyzedNodeIds: Set<number>
  /** Mainline stats for White, recomputed after each position completes. */
  whiteStats: PlayerStats
  /** Mainline stats for Black, recomputed after each position completes. */
  blackStats: PlayerStats
  /** Weighted positional radar data, recomputed after each node completes. */
  positionalRadarData: PositionalRadarData
}

// ==================== Events ====================

export type GameEvent =
  | { type: 'navigate'; nodeId: number }
  /**
   * Inject a newly created variation node into the machine's context tree and
   * immediately navigate to it. Must be sent instead of (not after) navigate
   * so the tree is updated before the guards evaluate.
   */
  | { type: 'insertNode'; parentId: number; node: AnalysisNode; nextId: number }
  /**
   * Sent by the orchestrator when position:queue:updated fires with a priority
   * change. Triggers STOP_AND_WAIT so the machine re-evaluates which position
   * should run next from IDLE.
   */
  | { type: 'priorityChanged' }

// ==================== Machine ====================

export const gameMachine = setup({
  types: {
    input: {} as GameInput,
    context: {} as GameContext,
    events: {} as GameEvent,
  },
  actors: {
    positionMachine,
    stopEngines: fromPromise<void>(async () => {
      throw new Error('stopEngines actor not provided — use .provide()')
    }),
  },
  guards: {
    currentNodeNeedsAnalysis: ({ context }) => {
      const node = findNodeById(context.tree, context.currentNodeId)
      if (!node) return false
      if (node.fsmState === 'UNANALYZED') return true
      // Trigger a deep re-analysis for already-analyzed nodes the user has
      // focused, but skip the root (ply 0) since it has no played move to
      // classify and depth 40 on the starting position runs indefinitely.
      return (
        node.ply > 0 &&
        node.fsmState === 'NAG_COMPLETE' &&
        !context.deepAnalyzedNodeIds.has(node.id)
      )
    },
    backgroundWorkExists: ({ context }) => {
      return findNextUnanalyzedNode(context.tree, context.currentNodeId) !== null
    },
  },
}).createMachine({
  id: 'game',
  initial: 'ANALYZING',
  context: ({ input }) => ({
    ...input.data,
    focusConfig: input.focusConfig,
    backgroundConfig: input.backgroundConfig,
    currentNodeId: input.currentNodeId,
    deepAnalyzedNodeIds: new Set<number>(),
    whiteStats: computePlayerStats(input.data.tree, 'w'),
    blackStats: computePlayerStats(input.data.tree, 'b'),
    positionalRadarData: computePositionalRadarData(input.data.tree),
  }),

  states: {
    /**
     * The primary compound state. Handles all analysis work and the navigate
     * top-level event. IDLE dispatches to POSITION_ANALYSIS (user-focused,
     * highest priority), BACKGROUND_PROCESSING (DFS sweep), or COMPLETE.
     */
    ANALYZING: {
      initial: 'IDLE',
      entry: assign({ gameFsmState: 'ANALYZING' as GameFSMState }),

      // Top-level events: interrupt current analysis, drain engines, then
      // re-evaluate from IDLE with the updated currentNodeId / tree.
      on: {
        navigate: {
          target: '.STOP_AND_WAIT',
          actions: assign({ currentNodeId: ({ event }) => event.nodeId }),
        },
        insertNode: {
          target: '.STOP_AND_WAIT',
          actions: assign(({ context, event }) => ({
            tree: insertChildNode(context.tree, event.parentId, event.node),
            currentNodeId: event.node.id,
            nextId: event.nextId,
          })),
        },
        priorityChanged: {
          target: '.STOP_AND_WAIT',
        },
      },

      states: {
        /**
         * Pure decision node. No async work — always transitions immediately
         * via guarded `always` entries in priority order.
         */
        IDLE: {
          always: [
            {
              guard: 'currentNodeNeedsAnalysis',
              target: 'POSITION_ANALYSIS',
            },
            {
              guard: 'backgroundWorkExists',
              target: 'BACKGROUND_PROCESSING',
            },
            {
              target: '#game.COMPLETE',
            },
          ],
        },

        /**
         * Analyze the position the user currently has focused. Uses focusConfig
         * so the user gets deeper analysis on the node they are viewing.
         */
        POSITION_ANALYSIS: {
          invoke: {
            src: 'positionMachine',
            input: ({ context }): PositionInput => {
              const node = findNodeById(context.tree, context.currentNodeId)!
              const parent = findParentOfNode(context.tree, context.currentNodeId)
              // First-time analysis uses the fast background config so the
              // initial sweep completes quickly. Re-analysis of an already
              // analyzed node (NAG_COMPLETE) uses the deep focus config.
              const isFirstAnalysis = node.fsmState === 'UNANALYZED'
              return {
                fen: node.fen,
                ply: node.ply,
                uciMove: node.uciMove,
                color: node.color ?? null,
                config: isFirstAnalysis ? context.backgroundConfig : context.focusConfig,
                evalCurve: context.evalCurve,
                prevEngineResult: (parent?.engineResult ?? null) as EngineResult | null,
              }
            },
            onDone: {
              target: 'IDLE',
              actions: assign(({ context, event }) => {
                const node = findNodeById(context.tree, context.currentNodeId)!
                // If the node was already NAG_COMPLETE, this was a deep
                // re-analysis — record it so the guard doesn't re-trigger.
                const wasDeepAnalysis = node.fsmState === 'NAG_COMPLETE'
                const newTree = setNodeResult(context.tree, context.currentNodeId, event.output)
                return {
                  tree: newTree,
                  evalCurve: buildEvalCurveFromMainLine(newTree),
                  maiaFloorEvalCurve: buildMaiaFloorEvalCurve(newTree),
                  maiaCeilingEvalCurve: buildMaiaCeilingEvalCurve(newTree),
                  deepAnalyzedNodeIds: wasDeepAnalysis
                    ? new Set([...context.deepAnalyzedNodeIds, context.currentNodeId])
                    : context.deepAnalyzedNodeIds,
                  whiteStats: computePlayerStats(newTree, 'w'),
                  blackStats: computePlayerStats(newTree, 'b'),
                  positionalRadarData: computePositionalRadarData(newTree),
                }
              }),
            },
            onError: 'IDLE',
          },
        },

        /**
         * Analyze the next UNANALYZED node found via DFS (mainline-first).
         * Skips currentNodeId since POSITION_ANALYSIS owns that node.
         * Uses backgroundConfig for the throughput sweep.
         */
        BACKGROUND_PROCESSING: {
          invoke: {
            src: 'positionMachine',
            input: ({ context }): PositionInput => {
              const node = findNextUnanalyzedNode(context.tree, context.currentNodeId)!
              const parent = findParentOfNode(context.tree, node.id)
              return {
                fen: node.fen,
                ply: node.ply,
                uciMove: node.uciMove,
                color: node.color ?? null,
                config: context.backgroundConfig,
                evalCurve: context.evalCurve,
                prevEngineResult: (parent?.engineResult ?? null) as EngineResult | null,
              }
            },
            onDone: {
              target: 'IDLE',
              actions: assign(({ context, event }) => {
                // Identify which node we just finished (same logic used in input).
                const node = findNextUnanalyzedNode(context.tree, context.currentNodeId)!
                const newTree = setNodeResult(context.tree, node.id, event.output)
                return {
                  tree: newTree,
                  evalCurve: buildEvalCurveFromMainLine(newTree),
                  maiaFloorEvalCurve: buildMaiaFloorEvalCurve(newTree),
                  maiaCeilingEvalCurve: buildMaiaCeilingEvalCurve(newTree),
                  whiteStats: computePlayerStats(newTree, 'w'),
                  blackStats: computePlayerStats(newTree, 'b'),
                  positionalRadarData: computePositionalRadarData(newTree),
                }
              }),
            },
            onError: 'IDLE',
          },
        },

        /**
         * Drains all engines before returning to IDLE. Entered whenever a
         * navigate event fires mid-analysis. XState auto-cancels the child
         * positionMachine actor on exit from POSITION_ANALYSIS /
         * BACKGROUND_PROCESSING, and this state ensures the underlying engine
         * processes have flushed before the next analysis begins.
         *
         * Additional navigate events while draining only update currentNodeId
         * (child transition shadows the parent-level navigate handler above).
         * No need to re-invoke stopEngines — it is already draining.
         */
        STOP_AND_WAIT: {
          invoke: {
            src: 'stopEngines',
            onDone: 'IDLE',
            onError: 'IDLE',
          },
          on: {
            navigate: {
              actions: assign({ currentNodeId: ({ event }) => event.nodeId }),
            },
            // If another variation arrives while still draining, absorb it here
            // so the parent-level handler doesn't re-enter STOP_AND_WAIT.
            insertNode: {
              actions: assign(({ context, event }) => ({
                tree: insertChildNode(context.tree, event.parentId, event.node),
                currentNodeId: event.node.id,
                nextId: event.nextId,
              })),
            },
            // Absorb while already draining — IDLE will re-evaluate priorities.
            priorityChanged: {},
          },
        },
      },
    },

    /**
     * All known nodes are analyzed. Not a final state — stays alive so that
     * navigate events (triggered by new variations being added) can re-enter
     * ANALYZING and process the new UNANALYZED nodes.
     */
    COMPLETE: {
      entry: assign({ gameFsmState: 'COMPLETE' as GameFSMState }),
      on: {
        navigate: {
          target: 'ANALYZING.STOP_AND_WAIT',
          actions: assign({ currentNodeId: ({ event }) => event.nodeId }),
        },
        insertNode: {
          target: 'ANALYZING.STOP_AND_WAIT',
          actions: assign(({ context, event }) => ({
            tree: insertChildNode(context.tree, event.parentId, event.node),
            currentNodeId: event.node.id,
            nextId: event.nextId,
          })),
        },
      },
    },

    FAILED: { type: 'final' },
  },
})
