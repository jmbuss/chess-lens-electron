# Chess Analysis Engine — Architecture & Implementation Plan

## Overview

This document describes the state-machine architecture for the chess game analysis engine. The system uses two cooperating state machines — one at the game level and one per position — coordinated by a central pipeline executor. **XState** is used to define, run, and rehydrate all machines. Analysis state is persisted to SQLite so sessions resume exactly where they left off.

## Goals

- Analyze a full game: identify what the player did well and where they went wrong
- Classify every move with a NAG annotation (blunder, mistake, brilliancy, best move, book move, etc.)
- Identify critical positions that the player should study
- Find structurally and positionally similar positions across all games played
- Detect game phase (opening, middlegame, endgame) per position

---

## New Dependency: XState

Before writing any code, install XState:

```bash
npm install xstate
```

XState provides:
- Explicit state definitions that prevent impossible states (e.g. `NAG_COMPLETE` without `ENGINE_COMPLETE`)
- Built-in snapshot serialization for persistence and rehydration
- Guards and actions that keep transition logic declarative and testable
- DevTools for visualizing machine state during development
- Works in both the Electron main process and renderer (for Vue reactivity)

---

## Architecture

The system is composed of four layers:

| Layer | Responsibility |
|---|---|
| **Game FSM** | Tracks overall analysis progress for a PGN. Runs once per game, persisted and resumable. |
| **Position FSM** | Tracks analysis progress for a single FEN. One instance per move. Drives both pipeline and UI-triggered deep analysis. |
| **Pipeline Coordinator** | Walks the move list, finds the first incomplete position, hands off to the Position FSM with pipeline engine config. |
| **Focus Manager** | Watches which position the user is viewing, starts/interrupts deep analysis sessions, decides whether to persist improved results. |

---

## Game FSM

The Game FSM tracks coarse progress for a loaded PGN. It is intentionally simple — it knows nothing about engines, NAG, or criticality. It delegates all per-position work to the Position FSM via the Pipeline Coordinator.

```
UNANALYZED → PHASE_CLASSIFICATION → PGN_ANALYSIS → COMPLETE
```

| State | Work Done | Transition Condition |
|---|---|---|
| `UNANALYZED` | Nothing yet. Game just loaded. | Automatically transitions on load. |
| `PHASE_CLASSIFICATION` | Assigns each move an opening / middlegame / endgame tag. Produces a game-level eval curve used by criticality scoring. | All moves have a phase tag. |
| `PGN_ANALYSIS` | Pipeline Coordinator walks move list, running the Position FSM for each position. Pauses when user triggers a Focus Session. | All positions reach `NAG_COMPLETE`. |
| `COMPLETE` | Full baseline analysis exists. Vectorization of critical positions is triggered as a non-blocking side effect. | — |

---

## Position FSM

One Position FSM exists per move in the game. Both the Pipeline Coordinator and the Focus Manager drive the same FSM — the only difference is the `AnalysisModeConfig` passed to it. The states are identical in both contexts.

```
ENGINE_RUNNING → ENGINE_COMPLETE → CRITICALITY_RUNNING → CRITICALITY_COMPLETE → NAG_RUNNING → NAG_COMPLETE
```

### Why this ordering?

Criticality precedes NAG because NAG classification is richer when it knows both the engine evaluation **and** the criticality score. A large eval swing in a critical position warrants a blunder (`??`) annotation; the same swing in a non-critical position might only be a mistake (`?`). Criticality, in turn, depends on the game-level eval curve produced during `PHASE_CLASSIFICATION`.

### Persisted vs. transient states

> **Key design rule:** Only terminal states are persisted. Running states (`ENGINE_RUNNING`, `CRITICALITY_RUNNING`, `NAG_RUNNING`) are always transient — they are reconstructed at runtime when the machine resumes. This makes the persistence model simple and crash-safe.

The four persisted states stored in the `PositionAnalysis` record:

```typescript
type PersistedPositionState =
  | 'UNANALYZED'
  | 'ENGINE_COMPLETE'       // has: eval, bestMove, depth
  | 'CRITICALITY_COMPLETE'  // has: criticalityScore
  | 'NAG_COMPLETE'          // has: nag classification
```

---

## Analysis Mode Configuration

The Position FSM is context-free. It does not know whether it is being driven by the pipeline or the UI. The calling coordinator passes an `AnalysisModeConfig` that controls how the engine stage behaves.

> **Note:** This is distinct from the existing `EngineConfig` in `src/services/engine/types.ts`, which configures engine binaries and paths. `AnalysisModeConfig` controls *how* an analysis session runs.

### Pipeline presets

When starting a game analysis, the user selects a preset that determines how the pipeline analyzes each position:

| Preset | `multipv` | Search limit | Use case |
|---|---|---|---|
| **Fast** | 1 | `timeMs: 3000` | Quick overview — get a baseline eval and NAG for every move |
| **Deep** | 1 | `depth: 20` | Thorough single-line analysis — more accurate eval and criticality |
| **Study** | 3–5 | Unbounded | Full study mode — multiple candidate lines per position, runs until interrupted or complete |

These presets map directly to `AnalysisModeConfig` values:

```typescript
type AnalysisPreset = 'fast' | 'deep' | 'study'

interface AnalysisModeConfig {
  mode: 'pipeline' | 'focus'
  preset?: AnalysisPreset

  // Passed directly to UCIEngine.analyze() as AnalysisOptions
  depth?: number    // UCI "go depth N"
  timeMs?: number   // UCI "go movetime N"
  nodes?: number    // UCI "go nodes N"
  multipv?: number  // UCI "MultiPV" option

  // Focus mode: run deep, stop when interrupted
  depthThreshold?: number // min depth gain over previous result to persist, e.g. 5
}

const ANALYSIS_PRESETS: Record<AnalysisPreset, Partial<AnalysisModeConfig>> = {
  fast:  { multipv: 1, timeMs: 3000 },
  deep:  { multipv: 1, depth: 20 },
  study: { multipv: 3 },  // unbounded — no depth or time limit
}
```

Pipeline mode options (`depth`, `timeMs`, `nodes`, `multipv`) map directly to the existing `AnalysisOptions` in `src/services/engine/types.ts` and are passed through to `UCIEngine.analyze()`.

| | Pipeline Mode | Focus Mode |
|---|---|---|
| Duration | Time-boxed (`timeMs`), fixed depth (`depth`), or unbounded (study) | Unbounded — runs until user navigates away |
| Advancement | Moves on automatically when done | Interrupted by move navigation |
| Priority | Lower priority thread | High priority thread |

---

## Focus Session & Interruption

> **Prerequisite:** Focus Sessions only become active after the Game FSM reaches `COMPLETE`. The pipeline must finish its baseline pass over all positions first. Once complete, the user can focus on individual positions for deeper analysis.

When the user navigates to a position, a Focus Session starts. When they navigate away, the session is interrupted. Interruption is not the same as wasted — even a partial deep run may have exceeded the previous depth, and that result should be evaluated and potentially persisted.

```typescript
interface FocusSession {
  fen: string
  startedAt: Date
  engineHandle: EngineHandle  // cancelable
  previousDepth: number       // depth at session start
  status: 'running' | 'interrupted' | 'complete'
}
```

### On interruption

When the user clicks to a different move, the following sequence runs:

1. Send stop signal to Stockfish — it returns its best result at current depth (via the existing `UCIEngine.stopAndWait()`)
2. Compare achieved depth against `previousDepth + depthThreshold`
3. **If depth improved enough:** persist new engine result, mark position `ENGINE_COMPLETE` (downstream criticality and NAG are now stale and will re-run)
4. **If depth did not improve:** discard result, position state unchanged
5. Start a new Focus Session for the newly selected position

### State regression is intentional

If a position previously reached `NAG_COMPLETE` and a deeper engine result is persisted on interruption, the position deliberately drops back to `ENGINE_COMPLETE`. The criticality and NAG results are now stale relative to the new depth and must be recomputed. This is not a bug — it is the correct behavior.

---

## XState Integration & Rehydration

### Defining the Position FSM

```typescript
import { createMachine } from 'xstate'

export const positionMachine = createMachine({
  id: 'position',
  initial: 'UNANALYZED',
  context: {
    fen: '',
    engineResult: null,
    criticalityScore: null,
    nag: null,
    analysisModeConfig: null,
  },
  states: {
    UNANALYZED:           { on: { START: 'ENGINE_RUNNING' } },
    ENGINE_RUNNING:       { on: { ENGINE_DONE: 'ENGINE_COMPLETE' } },
    ENGINE_COMPLETE:      { on: { NEXT: 'CRITICALITY_RUNNING' } },
    CRITICALITY_RUNNING:  { on: { CRITICALITY_DONE: 'CRITICALITY_COMPLETE' } },
    CRITICALITY_COMPLETE: { on: { NEXT: 'NAG_RUNNING' } },
    NAG_RUNNING:          { on: { NAG_DONE: 'NAG_COMPLETE' } },
    NAG_COMPLETE:         { type: 'final' },
  },
})
```

### Persisting a snapshot

After each terminal state is reached, serialize the machine snapshot and update the corresponding node in the analysis tree, then persist the tree:

```typescript
import { createActor } from 'xstate'

const actor = createActor(positionMachine, { input: { fen, analysisModeConfig } })
actor.start()

actor.subscribe((snapshot) => {
  if (isPersistedState(snapshot.value)) {
    // Update the node in the analysis tree
    const node = findNodeByFen(analysisTree, fen)
    node.fsmState = snapshot.value
    node.fsmSnapshot = JSON.stringify(snapshot)
    // Persist the updated tree
    GameAnalysisModel.updateTree(db, gameAnalysisId, analysisTree)
  }
})
```

### Rehydrating on app open

When the app opens and a game is loaded, read the analysis tree from the database and restore each position's actor from its stored snapshot:

```typescript
function rehydratePosition(
  node: AnalysisNodeData,
  analysisModeConfig: AnalysisModeConfig,
) {
  const snapshot = node.fsmSnapshot ? JSON.parse(node.fsmSnapshot) : undefined

  const actor = createActor(positionMachine, {
    snapshot,
    input: { fen: node.fen, analysisModeConfig },
  })
  actor.start()
  return actor
}
```

### Resumption logic in the Pipeline Coordinator

On game load, the coordinator reads the analysis tree, rehydrates actors from each node's stored snapshot, then finds the first incomplete position and begins driving it:

```typescript
async function resumePipeline(gameAnalysis: GameAnalysisData) {
  const nodes = getMainlineNodes(gameAnalysis.analysisTree)
  const actors = nodes.map((node) => rehydratePosition(node, pipelineConfig))

  const startIndex = actors.findIndex(
    (actor) => actor.getSnapshot().value !== 'NAG_COMPLETE'
  )

  if (startIndex === -1) {
    transitionGameFSM('COMPLETE')
    return
  }

  for (let i = startIndex; i < actors.length; i++) {
    await runPositionCycle(actors[i], pipelineConfig)
  }
  transitionGameFSM('COMPLETE')
}
```

---

## Data Model

Analysis data is stored as a **single JSON document per game**, structured as a tree that mirrors the existing `GameTree` (`Node<AugmentedNodeData>` from `chessops/pgn`). Each node in the analysis tree extends the game tree's node data with engine results, criticality scores, game phase, NAG classification, and FSM state.

This is a document model, not a relational model. A single `game_analyses` table stores one row per game with the analysis tree serialized as a JSON blob. This avoids complex joins, makes persistence/rehydration of the full analysis trivial, and naturally handles variations (since the tree structure already supports them via `children` arrays).

### Analysis node data

Each node in the analysis tree carries the same fields as `AugmentedNodeData` (see `src/utils/chess/types.ts`) plus analysis-specific extensions:

```typescript
import type { NAG, AnalysisLine } from 'src/services/engine/types'

export type GameFSMState = 'UNANALYZED' | 'PHASE_CLASSIFICATION' | 'PGN_ANALYSIS' | 'COMPLETE'
export type GamePhase = 'opening' | 'middlegame' | 'endgame'
export type PersistedPositionState = 'UNANALYZED' | 'ENGINE_COMPLETE' | 'CRITICALITY_COMPLETE' | 'NAG_COMPLETE'

/**
 * Analysis data attached to each node in the analysis tree.
 * Extends the existing AugmentedNodeData from the GameTree.
 */
export interface AnalysisNodeData {
  // Engine results
  engineResult?: {
    evalCp: number | null
    evalMate: number | null
    bestMove: string
    depth: number
    lines: AnalysisLine[]
  }

  // Criticality
  criticalityScore?: number

  // Game phase
  gamePhase?: GamePhase

  // NAG classification
  nag?: NAG
  winRateBefore?: number
  winRateAfter?: number
  winRateLoss?: number
  isBestMove?: boolean

  // Position FSM state (only terminal states are persisted)
  fsmState?: PersistedPositionState
  fsmSnapshot?: string

  // Feature debug data (for tuning UI)
  featuresJson?: Record<string, { raw: number; normalized: number; weight: number }>
}
```

### Game-level analysis record

The game analysis document wraps the analysis tree with game-level metadata:

```typescript
export interface GameAnalysisData {
  id?: number
  gameId: string
  pgnHash: string              // invalidation key — changes when PGN changes
  schemaVersion: number        // invalidation key — increments on significant engine/algorithm updates
  gameFsmState: GameFSMState
  evalCurve: number[]          // centipawn values per ply, produced by PHASE_CLASSIFICATION
  vectorized: boolean
  analysisTree: string         // serialized analysis tree JSON
  createdAt?: string
  updatedAt?: string
}
```

### Storage

A single `game_analyses` table following the `BaseModel` pattern (see `.ai/database/model-creation-guide.md`):

```
src/database/
  analysis/
    types.ts                   # GameAnalysisData, AnalysisNodeData, enums
    GameAnalysisModel.ts       # BaseModel with CRUD + tree serialization
    index.ts
  vectors/
    VectorModel.ts             # sqlite-vec virtual tables (Phase 6)
    index.ts
```

The `GameAnalysisModel` stores the analysis tree as a JSON TEXT column. On read, it deserializes back into the tree structure. On write (after each FSM state transition), it re-serializes the updated tree. This keeps the persistence model simple — one row, one document, one write per update.

### Relationship to the GameTree

The analysis tree is **not** the same object as the renderer's `GameTree`. The renderer builds a `GameTree` from the PGN (via `chessops/pgn`) for navigation and board display. The analysis tree is a parallel structure that carries the analysis data per node.

**Main process:** Owns the authoritative analysis tree. The Pipeline Coordinator and Focus Manager update nodes in this tree as FSM transitions complete, then persist it to SQLite.

**Renderer:** Holds a copy of the full analysis tree in the TanStack Query cache (keyed on `['game-analysis', gameId]`). This cached tree is the single source of truth for all analysis UI — the PGN viewer reads NAG badges and criticality from it, the eval panel reads engine results, and computed properties derive filtered views (e.g., critical positions). When the main process completes an FSM transition, it pushes the updated node data on the `analysis:node-update` channel, and the composable merges it into the cached tree via `queryClient.setQueryData()`. This is the same push + cache-patch pattern used by `useEngineAnalysis` with `engine:analysis-update`.

### Vector storage: `sqlite-vec`

Vector similarity search uses the `sqlite-vec` SQLite extension (consistent with the existing `better-sqlite3` database):

```bash
npm install sqlite-vec
```

Load the extension once after opening the database connection:

```typescript
// src/database/db.ts
import * as sqliteVec from 'sqlite-vec'

// Inside DatabaseService constructor, after opening the DB:
sqliteVec.load(this.db)
```

Two virtual tables store position vectors:
- `positional_vectors` — computed features (material, mobility, king safety, etc.)
- `structural_vectors` — bitboard representation of piece placement

Only critical positions and blunders (`criticalityScore` above threshold or `nag` is `??` / `?`) are written. The `vectorized` flag on `GameAnalysisData` prevents duplicate writes.

---

## IPC API Handlers

Handlers follow the existing pattern (see `.ai/api/api-creation-guide.md`): extend `IpcHandler`, define a static `channel`, use module augmentation for type-safe channels.

### File structure

```
src/api/analysis/
  register.ts
  handlers/
    analyzeGame.ts             # 'analysis:analyzeGame'
    getGameAnalysis.ts         # 'analysis:getGameAnalysis'
    getCriticalPositions.ts    # 'analysis:getCriticalPositions'
    scorePosition.ts           # 'analysis:scorePosition'
    findSimilarPositions.ts    # 'analysis:findSimilarPositions'
    index.ts
```

### Channel definitions

#### `analysis:analyzeGame`

Long-running; streams node-level updates via push channel `analysis:node-update` (same pattern as `engine:analyze` / `engine:analysis-update`). The renderer merges each node update into the cached analysis tree via `setQueryData`.

```typescript
declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:analyzeGame': {
      request: { gameId: string; moves: string[]; preset: AnalysisPreset }
      response: { gameAnalysisId: number }
    }
    // Push channel: main process sends updated node data after each FSM transition.
    // Use ipcService.on('analysis:node-update', cb) to receive updates.
    'analysis:node-update': {
      request: never
      response: {
        gameId: string
        ply: number
        node: AnalysisNodeData
        gameFsmState: GameFSMState
        totalPlies: number
      }
    }
  }
}
```

The handler uses `ipcService.emit()` on the renderer side (fire-and-forget) and pushes node updates to `analysis:node-update` as each position completes an FSM stage. The composable patches these into the TanStack Query cache.

#### `analysis:getGameAnalysis`

Returns the full `GameAnalysisData` including the serialized analysis tree. This is what the renderer fetches once on load and then keeps in sync via `analysis:node-update` pushes.

```typescript
declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:getGameAnalysis': {
      request: { gameId: string }
      response: GameAnalysisData | null
    }
  }
}
```

#### `analysis:getCriticalPositions`

```typescript
declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:getCriticalPositions': {
      request: { gameId: string; threshold: number }
      response: { positions: AnalysisNodeData[] }
    }
  }
}
```

#### `analysis:scorePosition`

Tuning endpoint. Given a FEN, returns engine eval, criticality score vs. previous FEN, and full feature debug info.

```typescript
declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:scorePosition': {
      request: { fen: string; previousFen?: string; depth?: number }
      response: {
        fen: string
        evalCp: number | null
        evalMate: number | null
        bestMove: string
        criticalityScore: number
        features: FeatureDebugEntry[]
      }
    }
  }
}
```

#### `analysis:findSimilarPositions`

KNN search using `sqlite-vec`.

```typescript
declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:findSimilarPositions': {
      request: { fen: string; k: number; vectorType: 'positional' | 'structural' }
      response: {
        matches: Array<{
          fen: string
          gameId: string
          ply: number
          distance: number
        }>
      }
    }
  }
}
```

### Registration

```typescript
// src/api/analysis/register.ts
import { IPCHandlerRegistry } from 'src/ipc/IPCHandlerRegistry'
import Database from 'better-sqlite3'
import { /* handler imports */ } from './handlers'

export const registerAnalysisHandlers = (
  ipcHandlerRegistry: IPCHandlerRegistry,
  db: Database.Database
) => {
  const handlers = [
    new AnalyzeGameHandler(db),
    new GetGameAnalysisHandler(db),
    new GetCriticalPositionsHandler(db),
    new ScorePositionHandler(db),
    new FindSimilarPositionsHandler(db),
  ]
  ipcHandlerRegistry.registerHandlers(...handlers)
}
```

Then add `registerAnalysisHandlers(ipcHandlerRegistry, db)` in `src/api/register.ts`.

---

## Renderer Integration

### Composable: `src/renderer/analysis/composables/useGameAnalysis.ts`

Follows the existing TanStack Query pattern used by `useEngineAnalysis` and `useChessGame`:

```typescript
import { computed, ref, toValue, type MaybeRef } from 'vue'
import { useMutation, useQuery } from '@tanstack/vue-query'
import { ipcService } from 'src/ipc/renderer'
import { queryClient } from 'src/renderer/query/queryClient'
import type { GameAnalysisData, AnalysisNodeData } from 'src/database/analysis/types'

interface NodeUpdatePayload {
  gameId: string
  ply: number
  node: AnalysisNodeData
  gameFsmState: GameFSMState
  totalPlies: number
}

export const useGameAnalysis = (gameId: MaybeRef<string>) => {
  const queryKey = computed(() => ['game-analysis', toValue(gameId)] as const)

  const { data: gameAnalysis, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      ipcService.send('analysis:getGameAnalysis', { gameId: toValue(gameId) }),
    staleTime: Infinity,
  }, queryClient)

  const { mutate: runAnalysis, isPending: isAnalyzing } = useMutation({
    mutationFn: (opts: { moves: string[]; preset: AnalysisPreset }) =>
      ipcService.send('analysis:analyzeGame', {
        gameId: toValue(gameId),
        ...opts,
      }),
  }, queryClient)

  // Subscribe to node-level updates pushed by the main process.
  // Merge each updated node into the cached analysis tree via setQueryData.
  // This is the same pattern as useEngineAnalysis with engine:analysis-update.
  ipcService.on('analysis:node-update', (response: NodeUpdatePayload) => {
    if (response.gameId !== toValue(gameId)) return

    queryClient.setQueryData(
      ['game-analysis', toValue(gameId)],
      (prev: GameAnalysisData | undefined) => {
        if (!prev) return prev
        return mergeNodeUpdate(prev, response)
      }
    )
  })

  // Derived state — all reactive, all update automatically as nodes are patched in
  const analysisTree = computed(() => gameAnalysis.value?.analysisTree)
  const gameFsmState = computed(() => gameAnalysis.value?.gameFsmState)
  const isComplete = computed(() => gameFsmState.value === 'COMPLETE')

  const criticalPositions = computed(() =>
    getNodesAboveThreshold(analysisTree.value, 0.4)
  )

  return {
    gameAnalysis,
    analysisTree,
    gameFsmState,
    isComplete,
    criticalPositions,
    isLoading,
    runAnalysis,
    isAnalyzing,
  }
}
```

### IPC reactivity pattern

The main process owns the authoritative analysis tree. On each FSM state transition, it pushes the updated node to the renderer via `analysis:node-update`. The renderer merges it into the cached tree via `setQueryData` — no refetch round-trip needed.

```typescript
// Main process — push node update when a position FSM reaches a terminal state
actor.subscribe((snapshot) => {
  if (!isPersistedState(snapshot.value)) return

  mainWindow.webContents.send('analysis:node-update', {
    gameId,
    ply: snapshot.context.ply,
    node: buildAnalysisNodeData(snapshot),
    gameFsmState: currentGameFsmState,
    totalPlies,
  })
})

// Renderer — composable merges into cached tree (see useGameAnalysis above)
// queryClient.setQueryData(['game-analysis', gameId], (prev) => mergeNodeUpdate(prev, payload))
```

This mirrors the existing `useEngineAnalysis` pattern where `engine:analysis-update` pushes intermediate results and the composable patches them into the query cache via `setQueryData`.

### UI changes

Extend the existing Analysis page (`/analysis/:gameId`) — no new routes needed.

- **`ChessPGNViewer.vue`:** Accept a `criticalPositions: Map<number, number>` prop. Add colored criticality indicators next to each move (red for score >= 0.7, orange for >= 0.4). Add a "jump to next critical position" button.
- **`AnalysisPage.vue`:** Add an "Analyze Game" button that calls `runAnalysis(moves)` with a progress bar. Pass `criticalPositions` to `ChessPGNViewer`. Add a `ChessFeatureDebugPanel` toggle next to `ChessAnalysisViewer`.
- **New component `ChessFeatureDebugPanel.vue`:** Displays `FeatureDebugEntry[]` from `analysis:scorePosition` for the current position. Collapsible table with feature name, raw value, normalized value, weight, and weighted contribution.

---

## Key Design Decisions

### Game pipeline pauses during Focus Sessions (v1)

When the user triggers deep analysis on a position, the pipeline pauses. This avoids running two Stockfish processes simultaneously and is the simpler v1 approach. The pipeline automatically resumes when the Focus Session ends. A two-engine architecture can be added in a future version if needed.

### Stale analysis uses `pgnHash` + `schemaVersion`

Analysis is invalidated when either the PGN changes (different game) or the schema version increments (engine significantly updated). A manual re-analyze button allows the user to force a fresh run.

### NAG depends on criticality which depends on the eval curve

This ordering is load-bearing. The eval curve must exist before criticality scores can be computed, and criticality scores must exist before NAG annotations can be classified. The `PHASE_CLASSIFICATION` stage of the Game FSM produces the eval curve, which is why it runs first as a separate stage before `PGN_ANALYSIS` begins.

### Existing engine infrastructure

This feature builds on top of the existing `UCIEngine` class and `AnalysisService` in `src/services/engine/`. The `UCIEngine` already provides `analyze()`, `stopAndWait()`, and `newGame()` — the Focus Manager uses `stopAndWait()` for graceful interruption.

The existing `AnalysisService.analyzePosition()` is directly usable for the Position FSM's engine stage. `AnalysisService.analyzeGame()` and `NAGService.classifyGame()` are batch methods that walk all positions in one blocking loop — these are superseded by the per-position FSM approach but can remain available for simpler use cases.

### Engine manager: single engine, focus-first (v1)

The engine manager (`src/services/engine/manager.ts`) currently provides a single Stockfish instance via `getStockfish()`. **This is intentional for v1.** The initial implementation only analyzes the game the user is actively viewing — there is no background pipeline processing yet.

This means two consumers share the single engine:

1. **The interactive analysis viewer** (`engine:analyze` / `useEngineAnalysis`) — real-time eval as the user navigates moves
2. **The analysis FSM** — runs the Position FSM for the currently-viewed game

Both already use `stopAndWait()` before starting a new analysis, so they can preempt each other safely. The Focus Manager naturally fits this model: when the user navigates to a position, the Focus Session takes the engine; when they navigate away, it yields back.

> **Future work:** Background pipeline processing (analyzing games the user is not viewing) will require either a second Stockfish instance or an engine lease/lock system in `manager.ts` to coordinate access. This is deferred until the focus-first approach is working as expected.

### Superseded existing handlers

Once the analysis FSM pipeline is built, the following existing handlers become redundant:

- `engine:analyzeGame` — batch-analyzes all positions in one call with no persistence or pause/resume. Replaced by the Pipeline Coordinator driving per-position FSMs.
- `engine:classifyMoves` — batch-classifies all moves in one call. NAG classification becomes a per-position FSM stage (`NAG_RUNNING` → `NAG_COMPLETE`).

The remaining `engine:*` handlers (`engine:analyze`, `engine:analysis-update`, `engine:stop`, `engine:predictHumanMove`, `engine:status`) remain as-is — they serve the interactive analysis viewer which is a separate concern.

---

## Implementation Phases

| Phase | Name | Deliverables |
|---|---|---|
| 1 | **Data Layer** | `GameAnalysisModel` following `BaseModel` pattern with JSON tree storage. `AnalysisNodeData` and `GameAnalysisData` types. |
| 2 | **Position FSM** | XState machine definition. Snapshot persistence and rehydration into the analysis tree. Unit tests for all state transitions. `AnalysisModeConfig` interface. |
| 3 | **Game FSM + Pipeline** | Game-level XState machine. Pipeline Coordinator walk logic. Phase classification service. End-to-end analysis of a single game the user is viewing. |
| 4 | **Criticality + NAG** | Criticality scoring service (uses eval curve from phase classification). Integration of existing `NAGService` classification logic into Position FSM cycle. |
| 5 | **Focus Manager** | `FocusSession` lifecycle. Interruption handling via `UCIEngine.stopAndWait()` and depth threshold evaluation. State regression logic. Push channel to renderer via `analysis:game-progress`. |
| 6 | **Vector DB** | Load `sqlite-vec` in `DatabaseService`. Virtual tables for positional and structural vectors. Write path for critical positions. `analysis:findSimilarPositions` handler. |
| 7 | **UI Wiring** | `useGameAnalysis` composable. Move list criticality badges in `ChessPGNViewer`. `ChessFeatureDebugPanel`. Progress bar for game analysis. |
