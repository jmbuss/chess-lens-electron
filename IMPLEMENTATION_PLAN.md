# Chess Lens — Event Architecture Refactor Implementation Plan

## Overview

This plan refactors the analysis pipeline from a **single-game-at-a-time coordinator** into an **event-driven queue system** that automatically schedules analysis after sync, prioritizes the user's current game/position, and shares position results across games.

The core changes:

1. **Event bus** in the main process to decouple sync → analysis → indexing
2. **Priority queues** (backed by SQLite) for both games and positions
3. **Cross-game position sharing** — analyze a FEN once, reuse everywhere
4. **PGN as source of truth** — mutations flow through a single API, tree is always derived
5. **Orchestrator pattern** — a singleton replaces `GameCoordinatorRegistry` and owns all scheduling

### What stays the same

- **XState `gameMachine`** — keeps its tree, incremental eval curve / player stats / positional radar recomputation, navigate/insertNode events, IDLE → POSITION_ANALYSIS / BACKGROUND_PROCESSING / COMPLETE flow. Minor additions only (e.g. `priorityChanged` for orchestrator preemption). **Does not** perform SQLite reads/writes.
- **XState `positionMachine`** — same engine pipeline (GATHERING → EVAL_MAIA_MOVES → CLASSIFY), plus a **leading cache-probe** state: async lookup (promise/`invoke`) against normalized results; on a hit that matches current `config` / depth (via `config_hash` or equivalent), jump straight to the terminal output path and skip engine work.
- **`GameCoordinator`** — keeps its role of wiring engines, building the concrete position machine, subscribing to the actor, and pushing IPC updates. Wrapped by the new orchestrator instead of being managed by `GameCoordinatorRegistry`.
- **IPC patterns** — `IpcHandler`, module augmentation, `IPCHandlerRegistry`
- **Database patterns** — `BaseModel`, static CRUD, `better-sqlite3`
- **Renderer patterns** — TanStack Query, composables, `ipcService`, push-channel cache patching
- **Engine management** — singleton Stockfish + Maia pair via `manager.ts`
- **Analysis algorithms** — `MoveClassificationService`, `EvalMaiaMovesService`, `PhaseClassificationService`, `PositionalFeaturesService` remain unchanged
- **White-normalized eval convention** — all evals, WDL, and EP values remain White-perspective

### What changes

| Current | After refactor |
|---------|---------------|
| `GameCoordinatorRegistry` starts/stops coordinators in IPC handlers | `AnalysisOrchestrator` wraps coordinators, manages lifecycle via queue priority |
| One game analyzed at a time, only when user is viewing | Games auto-queued after sync, analyzed in priority order |
| Analysis stored as one JSON blob per game (no cross-game sharing) | Position results also written to a normalized table; cache hits skip engine work |
| No backend event system | Typed `EventBus` (module augmentation, like `IpcChannels`) coordinates all services |
| PGN mutations handled ad-hoc per handler | Single `pgn:mutate` API with event emission |
| `GameCoordinatorRegistry.stopAll()` before new analysis | Orchestrator manages preemption via priority comparison |
| `gameMachine` + `positionMachine` own the analysis runtime | `positionMachine` gains a cache-probe front door; `gameMachine` gains orchestration hooks only; **SQLite dual-write stays in `GameCoordinator`** (not in assign blocks) |

---

## Architecture

### Event flow

```
app:started
  → SyncCoordinator.runInitialSync()

game:synced (per game from SyncWorker)
  → GameAnalysisScheduler.onGameSynced()
    → INSERT game_analysis_queue if not exists
    → emit game:queue:updated

game:queue:updated
  → AnalysisOrchestrator.onQueueUpdated()
    → compare priorities, start/preempt game machine
    → on start: PositionQueueManager.populateFromPgn(game.pgn)
      → parse PGN, upsert all FENs into position_analysis
      → emit position:queue:updated

position:queue:updated
  → AnalysisOrchestrator.forwardToActiveGameMachine()
    → game machine re-evaluates position priority

pgn:mutated (user adds variation / comment)
  → PositionQueueManager.onPgnMutated()
    → populateFromPgn(payload.pgn, currentFen boosted to priority 1)
    → emit position:queue:updated

game:analysis:complete
  → GameAnalysisModel.computeAggregates()
  → PositionIndexer.onGameComplete() (future)
```

### Service hierarchy

```
Main Process
├── EventBus (singleton, typed via module augmentation)
├── AnalysisOrchestrator (singleton)
│   ├── listens: game:queue:updated, position:queue:updated
│   ├── owns: one active GameCoordinator at a time
│   └── GameCoordinator (existing, per game)
│       ├── owns gameMachine (XState, existing)
│       │   ├── tree, evalCurve, playerStats, radar — incremental recompute
│       │   ├── spawns positionMachine (cache probe is *inside* positionMachine)
│       │   └── on each finished position: coordinator dual-writes to position_analysis
│       ├── pushes analysis:node-update, analysis:game-state-update
│       └── NEW: writes game aggregates + emits game:analysis:complete
├── GameAnalysisScheduler (singleton)
│   ├── listens: game:synced
│   └── writes: game_analysis_queue
├── PositionQueueManager (singleton)
│   ├── listens: pgn:mutated
│   └── writes: position_analysis (upserts all FENs from PGN)
├── SyncCoordinator (singleton)
│   ├── listens: app:started
│   └── emits: game:synced
└── IPC Handlers (existing pattern)
    ├── game:prioritize → writes priority, emits queue:updated
    ├── position:prioritize → writes priority, emits queue:updated
    └── pgn:mutate → writes PGN, emits pgn:mutated
```

---

## Phase 0 — Consolidate PGN Parsing: Migrate off chess.js ✅

**Goal:** Make `GameTree.ts` the single authority for all PGN parsing and serialization. Remove `chess.js` from services and the main process wherever it is used as a position stepper or tree builder.

### Motivation

The codebase currently has two parallel ways to work with PGN and positions:
- **`GameTree.ts`** (`chessops`-based) — used by `GameCoordinator`, `PositionQueueManager`, renderer navigation, and variation mutation. Parses PGN into a rich `AnalysisNode`-compatible tree with FENs, move metadata, and variation support.
- **`chess.js`** — used ad-hoc in services and components for FEN-stepping through UCI move lists and simple position queries.

With the refactor, the sync worker and `PositionQueueManager` both need to walk full game trees (including variations) to extract FENs. `parseGameTree` already does this. Converging on a single library avoids parsing the same PGN twice and eliminates the ambiguity of which library is authoritative.

### What chess.js is currently used for

| File | Usage |
|------|-------|
| `SyncWorker.ts` | `loadPgn` + `history()` for move count; FEN stepping for position extraction; `lookupByMoves` wrapper |
| `AnalysisService.ts` | FEN stepping through UCI move list (`analyzeGame`) |
| `NAGService.ts` | FEN stepping through UCI move list (`classifyGame`) |
| `useChessOpening.ts` | `loadPgn` + `lookupByMoves` wrapper |
| `ChessPositionAnalysisTab.vue` | `isGameOver()` check on current FEN |

### What GameTree.ts needs added

**`src/utils/chess/GameTree.ts` — new exports:**

1. **`serializePgn(root: GameNode, headers?: PgnHeaders): string`** — serialize a tree back to a PGN string. Uses `chessops/pgn`'s `makePgn`. This is the most important addition: it enables the `pgn:mutate` API to round-trip (parse → mutate → serialize) and gives the sync worker a single code path.

2. **`collectMainlineFens(root: GameNode): { fen: string; ply: number }[]`** — walks the `children[0]` chain only. Returns the starting position FEN at ply 0 through the final mainline move. Used by the sync worker to populate `game_positions` — variations are intentionally excluded here.

3. **`collectAllFens(root: GameNode): { fen: string; ply: number }[]`** — full DFS walk that collects every FEN from the tree including all variations. Available as a utility but not used for `game_positions` population — see design note below.

4. **`applyUciMove(fen: string, uciMove: string): string | null`** — apply a single UCI move to a FEN and return the resulting FEN string. Uses chessops `parseFen` / `Chess.fromSetup` / `pos.play()`. Replaces the `chess.move()` + `chess.fen()` pattern in `AnalysisService` and `NAGService`.

5. **`isGameOver(fen: string): boolean`** — returns true if the position is checkmate or stalemate. Uses chessops `pos.isEnd()` (or `pos.outcome() !== undefined`). Replaces `new Chess(fen).isGameOver()` in the renderer component.

### Migrations

**`SyncWorker.ts`:**
- Replace `chess.loadPgn(game.pgn); chess.history()` with `parseGameTree(game.pgn)` — the tree has every node's FEN already computed, so no separate FEN-stepping loop is needed
- `moveCount` derived from `getMoveList(root).length`
- `collectAllFens(root)` replaces the manual position replay loop (and correctly captures variation FENs)
- `lookupByMoves` from `@chess-openings/eco.json` explicitly takes a `chess.js` `Chess` instance — keep a minimal chess.js usage here solely for this call, or use the FEN-based position book lookup (`positionBook` from `getOpeningBookSingleton`) which doesn't require a chess.js instance

**`AnalysisService.ts`:**
- `analyzeGame(moves, options)` — replace the chess.js FEN-stepping loop with `applyUciMove(fen, uciMove)` from GameTree utils
- `analyzePosition(fen, options)` — already FEN-based, no change needed

**`NAGService.ts`:**
- `classifyGame(moves, options)` — same as AnalysisService: replace chess.js FEN-stepping loop with `applyUciMove`

**`useChessOpening.ts`:**
- `openingFromPGN` — `parseGameTree(pgn)` gives the root node; use `collectAllFens` to get the move sequence; check whether `lookupByMoves` can be swapped for a FEN-based lookup. The `positionBook` built by `getPositionBook()` supports position-based matching — investigate if this can replace the chess.js-dependent `lookupByMoves` call entirely. If not, keep chess.js here as the sole remaining use.

**`ChessPositionAnalysisTab.vue`:**
- Replace `new Chess(currentFen.value).isGameOver()` with `isGameOver(currentFen.value)` from `src/utils/chess/GameTree`

### Removal target

Once migrations are complete, `chess.js` should appear in **at most one place**: the `lookupByMoves` call in `useChessOpening.ts`, if the `@chess-openings/eco.json` API cannot be satisfied without it. All other usages are eliminated.

### Files changed

```
src/utils/chess/GameTree.ts          — add serializePgn, collectAllFens, applyUciMove, isGameOver
src/services/sync/worker.ts          — migrate to parseGameTree
src/services/engine/analysis/AnalysisService.ts  — migrate FEN stepping to applyUciMove
src/services/engine/analysis/NAGService.ts       — migrate FEN stepping to applyUciMove
src/renderer/composables/useChessOpening.ts      — investigate / migrate lookupByMoves
src/renderer/analysis/components/ChessPositionAnalysisTab.vue  — migrate isGameOver
```

---

## Phase 1 — Event Bus ✅

**Goal:** Introduce a typed, synchronous event emitter in the main process. All subsequent phases depend on this.

**Scope:** A few new files, no changes to existing code.

### Design

The event bus uses **module augmentation** — the same pattern the IPC layer uses for `IpcChannels`. An empty `EventChannels` interface is declared in a base file, and each service that defines events augments it with its own channel names and payload types. This means:

- Adding a new event = one `declare module` block in the file that owns the event
- Type safety is enforced at every call site — `bus.emit('game:synced', { wrong: 'shape' })` is a compile error
- No central "god file" that lists every event in the system

### Files

```
src/events/
  EventBus.ts        — typed EventBus class
  channels.ts        — base EventChannels interface (empty, augmented by services)
  types.ts           — type helpers (EventName, EventPayload)
  index.ts           — singleton export
```

### `channels.ts`

Same role as `src/ipc/handlers.ts` — the empty interface that gets augmented:

```typescript
/**
 * Base event channel definitions for the main-process event bus.
 * This interface is augmented by each service that defines events,
 * following the same pattern as IpcChannels for IPC handlers.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface EventChannels {
  // Augmented by individual services
}
```

### `types.ts`

```typescript
import type { EventChannels } from './channels'

export type EventName = keyof EventChannels
export type EventPayload<K extends EventName> = EventChannels[K]
```

### `EventBus.ts`

```typescript
import { EventEmitter } from 'node:events'
import type { EventChannels } from './channels'

export class EventBus {
  private emitter = new EventEmitter()

  on<K extends keyof EventChannels & string>(
    event: K,
    handler: (payload: EventChannels[K]) => void,
  ): void {
    this.emitter.on(event, handler as any)
  }

  off<K extends keyof EventChannels & string>(
    event: K,
    handler: (payload: EventChannels[K]) => void,
  ): void {
    this.emitter.off(event, handler as any)
  }

  emit<K extends keyof EventChannels & string>(
    event: K,
    payload: EventChannels[K],
  ): void {
    this.emitter.emit(event, payload)
  }
}
```

### `index.ts`

```typescript
import { EventBus } from './EventBus'

export const eventBus = new EventBus()
export { EventBus } from './EventBus'
export type { EventChannels } from './channels'
export type { EventName, EventPayload } from './types'
```

### How services declare events (module augmentation)

Each service that emits or listens to events augments `EventChannels` in its own file, just like IPC handlers augment `IpcChannels`:

```typescript
// src/services/sync/events.ts
declare module 'src/events/channels' {
  export interface EventChannels {
    'game:synced': {
      gameId: string
      playedAt: string
      platform: string
    }
  }
}
```

```typescript
// src/services/analysis/events.ts
declare module 'src/events/channels' {
  export interface EventChannels {
    'game:queue:updated': {
      reason: 'new_items' | 'priority_changed'
    }
    'position:queue:updated': {
      reason: 'new_items' | 'priority_changed'
    }
    'game:analysis:complete': {
      gameId: string
    }
  }
}
```

```typescript
// src/api/analysis/events.ts
declare module 'src/events/channels' {
  export interface EventChannels {
    'pgn:mutated': {
      gameId: string
      pgn: string
      currentFen: string
    }
  }
}
```

```typescript
// src/events/app.ts
declare module 'src/events/channels' {
  export interface EventChannels {
    'app:started': undefined
  }
}
```

### Integration point

The event bus singleton is created in `src/events/index.ts` and imported by any service that needs to emit or listen. It is **not** passed through IPC — renderer-to-main communication continues via the existing `IpcHandler` pattern.

---

## Phase 2 — Database Schema ✅

**Goal:** Add the new tables that back the priority queues and normalized position storage. Existing tables (`chess_games`, `game_analyses`) remain untouched during this phase.

### Design decisions

**Why normalize positions?** The current JSON blob approach (`game_analyses.state`) stores the entire analysis tree inline. This works for one-game-at-a-time but cannot share position results across games. A FEN analyzed in game A should not be re-analyzed when it appears in game B. Normalization enables this via the `position_analysis` + `game_positions` join.

**Queue columns on the data tables.** Rather than separate queue and results tables, each table carries both queue semantics (`priority`, `status`, `queued_at`) and result data. This avoids orphan cleanup and keeps the "fetch head of queue" query simple (`WHERE status = 'pending' ORDER BY priority DESC, queued_at ASC LIMIT 1`).

**`config_hash` on positions.** Engine configuration (depth, multipv, preset) affects results. A position analyzed at depth 10 is not equivalent to one analyzed at depth 20. `config_hash` is a SHA-256 of the serialized config, making `(fen, config_hash)` the natural unique key.

### New models

```
src/database/
  analysis-queue/
    types.ts
    GameAnalysisQueueModel.ts
    PositionAnalysisModel.ts
    GamePositionsModel.ts
    index.ts
```

### `GameAnalysisQueueModel`

Replaces the role of the current `game_analyses` table for queue purposes. The current `game_analyses` table (JSON blob) continues to exist during migration — see Phase 5 for the cutover.

```sql
CREATE TABLE IF NOT EXISTS game_analysis_queue (
  game_id    TEXT NOT NULL PRIMARY KEY REFERENCES chess_games(id),
  priority   INTEGER NOT NULL DEFAULT 3,
  status     TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | complete | failed
  queued_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,

  -- Aggregate results (computed on completion, null while pending/in_progress)
  accuracy_white      REAL,
  accuracy_black      REAL,
  white_stats_json    TEXT,   -- serialized PlayerStats
  black_stats_json    TEXT,   -- serialized PlayerStats
  eval_curve_json     TEXT    -- serialized number[]
);

CREATE INDEX IF NOT EXISTS idx_gaq_status_priority
  ON game_analysis_queue(status, priority DESC, queued_at ASC);
```

**Static methods:**
- `enqueue(db, gameId, priority)` — INSERT OR IGNORE
- `fetchHead(db)` — head of pending queue by priority
- `markInProgress(db, gameId)`
- `markComplete(db, gameId, aggregates)`
- `markFailed(db, gameId, error)`
- `updatePriority(db, gameId, priority)`
- `findByGameId(db, gameId)`
- `exists(db, gameId)` — used by scheduler to skip already-queued games

### `PositionAnalysisModel`

Stores per-position engine results, shared across all games that contain this position.

```sql
CREATE TABLE IF NOT EXISTS position_analysis (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  fen          TEXT NOT NULL,
  config_hash  TEXT NOT NULL,
  priority     INTEGER NOT NULL DEFAULT 3,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | complete | failed
  queued_at    INTEGER NOT NULL DEFAULT (unixepoch()),

  -- Result columns (null while pending)
  result_json  TEXT,          -- serialized PositionOutput (engine lines, nag, etc.)
  depth        INTEGER,
  analyzed_at  INTEGER,

  UNIQUE (fen, config_hash)
);

CREATE INDEX IF NOT EXISTS idx_pa_status_priority
  ON position_analysis(status, priority DESC, queued_at ASC);
CREATE INDEX IF NOT EXISTS idx_pa_fen
  ON position_analysis(fen);
```

**Static methods:**
- `upsertPending(db, fen, configHash, priority)` — INSERT OR IGNORE, then UPDATE priority if higher
- `fetchHeadForGame(db, gameId, configHash)` — head of pending queue filtered to positions in a specific game (JOIN through `game_positions` on FEN)
- `markInProgress(db, id)`
- `markComplete(db, id, resultJson, depth)`
- `markFailed(db, id)`
- `updatePriority(db, fen, configHash, priority)`
- `findByFen(db, fen, configHash)` — cache check
- `findByFenAnyConfig(db, fen)` — for priority updates regardless of config
- `bulkUpsert(db, rows)` — transaction-wrapped batch insert

### `GamePositionsModel`

Records every position reached in every synced game. Populated during sync (not during analysis), so it's a complete history of every FEN the player has ever reached. Keyed on `(game_id, fen)` — no dependency on `position_analysis`, so positions are recorded before analysis is ever queued. Joined to `position_analysis` via FEN at query time.

```sql
CREATE TABLE IF NOT EXISTS game_positions (
  game_id  TEXT NOT NULL REFERENCES chess_games(id) ON DELETE CASCADE,
  fen      TEXT NOT NULL,
  ply      INTEGER NOT NULL,
  PRIMARY KEY (game_id, fen)
);

CREATE INDEX IF NOT EXISTS idx_gp_game_id ON game_positions(game_id);
CREATE INDEX IF NOT EXISTS idx_gp_fen ON game_positions(fen);
```

**Static methods:**
- `bulkInsert(db, rows)` — transaction-wrapped batch insert (INSERT OR IGNORE)
- `findByGameId(db, gameId)` — returns all positions for a game, ordered by ply
- `findGamesByFen(db, fen)` — returns game IDs containing a position
- `findFensByGameId(db, gameId)` — returns just the FEN strings for a game (used by position queue population)

### Registration

Add to `src/database/index.ts`:

```typescript
import { GameAnalysisQueueModel } from './analysis-queue/GameAnalysisQueueModel'
import { PositionAnalysisModel } from './analysis-queue/PositionAnalysisModel'
import { GamePositionsModel } from './analysis-queue/GamePositionsModel'

export const database = new DatabaseService([
  // ... existing models ...
  new GameAnalysisQueueModel(),
  new PositionAnalysisModel(),
  new GamePositionsModel(),
])
```

---

## Phase 3 — Game Analysis Scheduler ✅

**Goal:** Listen for `game:synced` events and automatically enqueue games for analysis.

**Scope:** One new service, minor change to SyncWorker to emit events.

### Design

The scheduler is a pure event handler — no long-running loops. When a game is synced, it decides whether to enqueue it based on:
1. Is there already a `game_analysis_queue` row? → skip
2. Is the game too old (e.g. played > 30 days ago)? → skip (configurable threshold)
3. Otherwise → insert with default priority 3, emit `game:queue:updated`

### Files

```
src/services/analysis/
  GameAnalysisScheduler.ts
```

### SyncWorker changes

After Phase 0, the sync worker uses `parseGameTree` instead of a chess.js replay loop. The parsed tree already has FENs on every node (including variations), so `collectAllFens` extracts them in one DFS pass. Move count comes from `getMoveList(root).length`:

```typescript
const enrichedGames = newGames.map(game => {
  let moveCount: number | undefined
  let eco: string | undefined
  let name: string | undefined
  const positions: { fen: string; ply: number }[] = []
  try {
    const { root, headers } = parseGameTree(game.pgn)

    // Mainline FENs only (starting position through final move)
    positions.push(...collectMainlineFens(root))

    moveCount = getMoveList(root).length
    eco = headers.eco
    // Opening name lookup (see Phase 0 for lookupByMoves migration)
    name = headers.event // fallback — replaced by proper lookup in Phase 0
  } catch {
    // Leave moveCount, opening, and positions empty if parsing fails
  }

  return {
    ...game,
    moveCount,
    opening: eco ? { eco, name } : undefined,
    positions,
  }
})

result.gamesAdded = ChessGameModel.createBatch(this.db, enrichedGames)

// Bulk insert game_positions for all new games (mainline + variations)
for (const game of enrichedGames) {
  if (game.positions.length > 0) {
    GamePositionsModel.bulkInsert(this.db, game.positions.map(p => ({
      game_id: game.id,
      fen: p.fen,
      ply: p.ply,
    })))
  }
}

// Emit events for downstream services
for (const game of enrichedGames) {
  eventBus.emit('game:synced', {
    gameId: game.id,
    playedAt: game.startTime ?? new Date().toISOString(),
    platform: this.platform,
  })
}
```

### GameAnalysisScheduler

```typescript
export class GameAnalysisScheduler {
  constructor(
    private db: Database.Database,
    private bus: EventBus,
    private options: { autoAnalyzeThresholdDays: number } = { autoAnalyzeThresholdDays: 30 },
  ) {
    this.bus.on('game:synced', (payload) => this.onGameSynced(payload))
  }

  private onGameSynced(payload: EventPayload<'game:synced'>): void {
    if (GameAnalysisQueueModel.exists(this.db, payload.gameId)) return

    const cutoff = Date.now() - this.options.autoAnalyzeThresholdDays * 86_400_000
    if (new Date(payload.playedAt).getTime() < cutoff) return

    GameAnalysisQueueModel.enqueue(this.db, payload.gameId, 3)
    this.bus.emit('game:queue:updated', { reason: 'new_items' })
  }
}
```

### Bootstrap

In `src/main.ts`, after `registerApi()`:

```typescript
import { eventBus } from './events'
import { GameAnalysisScheduler } from './services/analysis/GameAnalysisScheduler'

const scheduler = new GameAnalysisScheduler(database.getDatabase(), eventBus)
```

---

## Phase 3b — SyncCoordinator Bootstrap (Early Validation) ✅

**Goal:** Wire `SyncCoordinator` to `app:started` so that syncing fires automatically on launch. This phase is intentionally minimal — it proves the event bus is working and that real syncs flow through it, without depending on any of the analysis orchestration phases (4–7).

**Scope:** One new service, typed push-channel infrastructure for `IpcChannels`, and small additions to `src/main.ts`.

### Design

`SyncCoordinator` is a thin wrapper around the existing `syncWorkerManager`. On `app:started` it queries all known platform accounts and triggers a sync for each, reusing the same `buildQueue` + `start` path that `SyncStartHandler` uses today. Progress is forwarded to the main window via a **typed push helper** so the UI stays responsive.

**Guard against duplicate syncs:** The existing `syncWorkerManager.isRunning(username, platform)` check inside `SyncStartHandler` is mirrored here — if a worker is already running (e.g. user manually triggered sync before `app:started` fired), the coordinator skips it.

**`app:started` timing:** The event is emitted after `createWindow()` in `main.ts` so that the renderer window is alive and can receive progress IPC events.

### Typed push channels

`sync:progress` is currently a raw, untyped push from main → renderer (`event.sender.send('sync:progress', progress)`). This phase introduces a small typed wrapper so that push channels get the same module-augmentation type safety as request/response channels.

#### `src/ipc/types.ts` additions

```typescript
// Add alongside existing ChannelName / ChannelRequest / ChannelResponse helpers

/**
 * Channels that declare a `push` shape can be used with pushToRenderer / ipcService.onPush.
 * A push channel has no request/response — it is main-initiated, renderer-received only.
 */
export type PushChannelName = {
  [K in keyof IpcChannels]: IpcChannels[K] extends { push: any } ? K : never
}[keyof IpcChannels]

export type PushPayload<K extends PushChannelName> = IpcChannels[K]['push']
```

#### `src/ipc/push.ts` (new file)

```typescript
import type { WebContents } from 'electron'
import type { PushChannelName, PushPayload } from './types'

/**
 * Type-safe main-process push to a renderer WebContents.
 * Channel must be declared with a `push` shape in IpcChannels.
 */
export function pushToRenderer<K extends PushChannelName>(
  webContents: WebContents,
  channel: K,
  payload: PushPayload<K>,
): void {
  webContents.send(channel as string, payload)
}
```

#### `IpcService` additions (renderer-side)

Add `onPush` / `offPush` methods to `IpcService` that accept only declared push channels and infer the payload type:

```typescript
onPush<K extends PushChannelName>(channel: K, callback: IpcEventCallback<PushPayload<K>>): void {
  // same body as existing `on` — wraps and stores the callback
}

offPush<K extends PushChannelName>(channel: K, callback: IpcEventCallback<PushPayload<K>>): void {
  // same body as existing `off`
}
```

The existing untyped `on` / `off` methods are kept for backward compatibility during migration.

#### `sync:progress` push declaration

Add a `push` key to the `sync:progress` channel in `src/api/sync/handlers.ts`. Note that `sync:progress` is not currently declared in `IpcChannels` at all — this phase adds it:

```typescript
// src/api/sync/handlers.ts — augmentation block
declare module '../../ipc/handlers' {
  export interface IpcChannels {
    'sync:start': { request: SyncRequest; response: SyncStatusResponse }
    // ... existing channels ...
    'sync:progress': {
      push: SyncProgress   // push-only — no request/response
    }
  }
}
```

### Files

```
src/ipc/
  push.ts                    — new pushToRenderer helper
  types.ts                   — PushChannelName + PushPayload additions
  IPCService.ts              — onPush / offPush additions
src/api/sync/handlers.ts     — add sync:progress to IpcChannels augmentation
src/services/sync/
  SyncCoordinator.ts         — new service
```

### `SyncCoordinator.ts`

```typescript
import type Database from 'better-sqlite3'
import type { WebContents } from 'electron'
import type { EventBus } from '../../events'
import { syncWorkerManager } from './workerManager'
import { PlatformAccountModel } from '../../database/sync/PlatformAccountModel'
import type { SyncPlatform } from './types'
import { pushToRenderer } from '../../ipc/push'

export class SyncCoordinator {
  constructor(
    private db: Database.Database,
    private bus: EventBus,
    private webContents: WebContents,
  ) {
    this.bus.on('app:started', () => void this.runInitialSync())
  }

  private async runInitialSync(): Promise<void> {
    const accounts = PlatformAccountModel.findAll(this.db)
    for (const account of accounts) {
      const { platformUsername: username, platform } = account

      if (syncWorkerManager.isRunning(username, platform as SyncPlatform)) continue

      const worker = syncWorkerManager.getOrCreate(this.db, username, platform as SyncPlatform)
      const isIncremental = account.lastSyncedMonth !== null

      await worker.buildQueue(isIncremental)
      await worker.start((progress) => {
        pushToRenderer(this.webContents, 'sync:progress', progress)
      })
    }
  }
}
```

### Bootstrap

`createWindow()` is updated to return the `BrowserWindow` so its `webContents` can be passed to the coordinator:

```typescript
import { eventBus } from './events'
import { SyncCoordinator } from './services/sync/SyncCoordinator'

app.on('ready', () => {
  initEngineManager()
  const db = database.getDatabase()
  registerApi({ ipcHandlerRegistry, db })

  const mainWindow = createWindow()  // createWindow() now returns BrowserWindow

  new SyncCoordinator(db, eventBus, mainWindow.webContents)

  // Emitted after createWindow so the renderer is alive for progress events
  eventBus.emit('app:started', undefined)
})
```

### Renderer migration

`useSyncGames` switches from `ipcService.on('sync:progress', ...)` to the new typed method:

```typescript
// before
ipcService.on('sync:progress', handleProgress)
ipcService.off('sync:progress', handleProgress)

// after — handleProgress payload is now inferred as SyncProgress
ipcService.onPush('sync:progress', handleProgress)
ipcService.offPush('sync:progress', handleProgress)
```

### What this validates

- `EventBus` is instantiated and routes events correctly (Phase 1 smoke test).
- `app:started` fires and triggers a real sync via existing sync infrastructure.
- Progress events reach the renderer — the home screen sync indicator should show activity on startup.
- IPC-driven sync (`sync:start`) still works in parallel; the coordinator guard prevents double-running the same account.
- Typed push infrastructure is in place for all future main → renderer push channels.

### What this does NOT do

- Does not emit `game:synced` from `SyncWorker` — that's Phase 3 / Phase 7 work. The scheduler (`GameAnalysisScheduler`) is not wired yet.
- Does not start analysis — no orchestrator, no queue processing.
- Phase 7 will absorb this coordinator into the full bootstrap and can remove the standalone `app:started` emit added here.

---

## Phase 4 — Position Queue Manager ✅

**Goal:** `position_analysis` is the single source of truth for everything that needs to be analyzed. The `PositionQueueManager` is responsible for ensuring every FEN in a game's PGN (mainline and variations) has a row in `position_analysis`.

### Design

There is one mechanism: parse the PGN, upsert every FEN into `position_analysis`. This is called in two situations:

1. **When the orchestrator starts a game** — reads the stored PGN from `chess_games`, parses it, and ensures all positions are queued before the game machine starts sweeping.
2. **When `pgn:mutated` fires** — user added a variation or comment. Re-parse the updated PGN and upsert any new FENs (INSERT OR IGNORE means existing rows are untouched except for priority upgrades).

`game_positions` is **not** used to drive analysis. It remains a historical record of positions the player actually reached (mainline, populated at sync time) for future use cases like "have I reached this position before?" — but the analysis pipeline ignores it.

### Files

```
src/services/analysis/
  PositionQueueManager.ts
```

### Config hash

```typescript
function buildConfigHash(config: AnalysisModeConfig): string {
  const key = JSON.stringify({
    depth: config.depth,
    timeMs: config.timeMs,
    multipv: config.multipv,
  })
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)
}
```

### PositionQueueManager

```typescript
export class PositionQueueManager {
  constructor(
    private db: Database.Database,
    private bus: EventBus,
  ) {
    this.bus.on('pgn:mutated', (payload) => this.onPgnMutated(payload))
  }

  /**
   * Parse a PGN and upsert every FEN (mainline + variations) into
   * position_analysis. Called by the orchestrator when starting a game,
   * and by onPgnMutated when the user mutates the tree.
   *
   * INSERT OR IGNORE means existing complete rows are untouched.
   * Priority is boosted if the incoming priority is higher than stored.
   */
  populateFromPgn(pgn: string, configHash: string, currentFen?: string): void {
    const { root } = parseGameTree(pgn)
    const allFens = collectAllFens(root)

    this.db.transaction(() => {
      for (const { fen } of allFens) {
        const priority = fen === currentFen ? 1 : 3
        PositionAnalysisModel.upsertPending(this.db, fen, configHash, priority)
      }
    })()

    this.bus.emit('position:queue:updated', { reason: 'new_items' })
  }

  private onPgnMutated(payload: EventPayload<'pgn:mutated'>): void {
    this.populateFromPgn(payload.pgn, this.getActiveConfigHash(), payload.currentFen)
  }

  private getActiveConfigHash(): string { /* from current preset config */ }
}
```

---

## Phase 5 — Analysis Orchestrator ✅

**Goal:** Replace `GameCoordinatorRegistry` with a persistent, event-driven orchestrator that runs games from the queue, while **keeping the existing `gameMachine` and `positionMachine` pipeline** as the core analysis runtime (with the additions described below).

### What stays

The `gameMachine` still owns the tree and incremental aggregates; the `positionMachine` still runs the same Stockfish / Maia / classification pipeline **after** a cache miss. The game machine already does exactly what we want for the active game:

- Owns the in-memory `AnalysisNode` tree
- Spawns the `positionMachine` for each position (POSITION_ANALYSIS / BACKGROUND_PROCESSING)
- After each position completes, incrementally recomputes:
  - `evalCurve` (via `buildEvalCurveFromMainLine`)
  - `maiaFloorEvalCurve` / `maiaCeilingEvalCurve`
  - `whiteStats` / `blackStats` (via `computePlayerStats`)
  - `positionalRadarData` (via `computePositionalRadarData`)
- Handles `navigate` and `insertNode` events for user interaction
- Manages STOP_AND_WAIT for engine draining on preemption

This incremental computation is essential for the UI — the user sees accuracy, eval curve, and radar updating live as each position finishes. **None of this changes.**

### What changes

The `gameMachine` gets **small orchestration-only changes**, the `positionMachine` gets a **cache-first entry**, `GameCoordinator` owns **all SQLite I/O** for the normalized cache, and the app gains an `AnalysisOrchestrator`:

1. **Dual-write to `position_analysis` (not in `gameMachine` assigns):** When a position finishes, the same `PositionOutput` the tree already receives must also be persisted. Per **§5b-persistence**, that write happens in **`GameCoordinator.actor.subscribe()`** after the position actor reaches its terminal state — **not** inside `gameMachine` `onDone` `assign` blocks. (Those assigns stay focused on `setNodeResult` + incremental stats; the old bullet at ~874 that suggested a DB write in assigns is **obsolete** and contradicted coordinator-owned persistence.)

2. **Cache check inside `positionMachine`:** Add an **initial** state (before `GATHERING`) that **`invoke`s an async cache loader** (promise / `fromPromise` — the machine already uses this pattern elsewhere). The injected function (provided when `GameCoordinator` builds the actor) queries `position_analysis` for `(fen, config_hash)` and returns a deserialized `PositionOutput` or `null`. If the row is **`complete`** and the stored payload is valid for the **current analysis preset / depth** (whatever `config_hash` encodes — e.g. fast vs deep), transition **directly to the same terminal / output-producing state** the normal pipeline would reach after `CLASSIFY`, so the parent `gameMachine` still sees one “position done” completion with a full `PositionOutput`. On miss or insufficient depth, transition into existing **`GATHERING`** and run Stockfish / Maia as today.

3. **Orchestrator replaces `GameCoordinatorRegistry`:** Instead of `GameCoordinatorRegistry.stopAll()` + manual coordinator creation in IPC handlers, the `AnalysisOrchestrator` is a singleton that:
   - Listens to `game:queue:updated` and `position:queue:updated`
   - Creates/stops `GameCoordinator` instances based on queue priority
   - Forwards priority changes to the active game machine

### Subphases

#### 5a — AnalysisOrchestrator skeleton

The orchestrator manages the lifecycle. It does **not** replace `GameCoordinator` — it wraps it:

```typescript
export class AnalysisOrchestrator {
  private activeCoordinator: GameCoordinator | null = null
  private activeGameId: string | null = null
  private activePriority: number = 0

  constructor(
    private db: Database.Database,
    private bus: EventBus,
    private positionQueueManager: PositionQueueManager,
  ) {
    this.bus.on('game:queue:updated', () => this.evaluateQueue())
    this.bus.on('position:queue:updated', (p) => this.forwardPositionUpdate(p))
  }

  private async evaluateQueue(): Promise<void> {
    const head = GameAnalysisQueueModel.fetchHead(this.db)
    if (!head) return

    if (!this.activeCoordinator) {
      await this.startGame(head)
      return
    }

    if (head.game_id === this.activeGameId) return

    // Preemption: new head has higher priority than current game
    if (head.priority > this.activePriority) {
      await this.activeCoordinator.stop()
      GameAnalysisQueueModel.markPending(this.db, this.activeGameId!)
      await this.startGame(head)
    }
  }

  private async startGame(queueItem: GameAnalysisQueueRow): Promise<void> {
    GameAnalysisQueueModel.markInProgress(this.db, queueItem.game_id)

    const game = ChessGameModel.findById(this.db, queueItem.game_id)
    if (!game) return

    // Populate position_analysis for every FEN in this game's PGN
    // (mainline + variations) before the coordinator starts sweeping.
    this.positionQueueManager.populateFromPgn(game.pgn, this.getActiveConfigHash())

    // Create a GameCoordinator — same class as today, with the
    // new cache-check and dual-write behavior added in 5b.
    const coordinator = new GameCoordinator(
      this.db, this.sender, game.id, game.pgn,
      'fast', this.userRating,
    )
    coordinator.initialize()
    await coordinator.start()

    this.activeCoordinator = coordinator
    this.activeGameId = queueItem.game_id
    this.activePriority = queueItem.priority
  }

  private forwardPositionUpdate(payload: EventChannels['position:queue:updated']): void {
    if (!this.activeCoordinator) return
    // Priority change for the current game's positions —
    // send navigate to the game machine to re-evaluate focus
  }
}
```

#### 5b — GameCoordinator + gameMachine modifications

**`GameCoordinator` changes:**

1. Accept a reference to the `PositionAnalysisModel` (or the db) so it can read/write position cache
2. In the `actor.subscribe()` callback, after `pushNewlyCompletedNodes`, also write each completed position's result to `position_analysis`
3. On `COMPLETE`, write game-level aggregates to `game_analysis_queue` and emit `game:analysis:complete`

**`gameMachine` changes (minimal):**

The existing `onDone` assign blocks in POSITION_ANALYSIS and BACKGROUND_PROCESSING stay exactly as they are — **no SQLite in assigns.** One addition:

1. **New event: `priorityChanged`** — sent by the orchestrator when `position:queue:updated` fires. The game machine uses this to re-evaluate whether the current position is still the highest priority, and if not, enters STOP_AND_WAIT to switch.

   **Note — changing position priority:** Any path that changes which position should run next (including `position:prioritize`, `game:prioritize`, and orchestrator-driven `priorityChanged`) must preserve the **same sequencing** the current `gameMachine` + `positionMachine` use today on refocus: **stop** the immediate in-flight Stockfish step for the position being left, **ensure** the shared engine pair is **idle**, then **start** the next position’s analysis (cache probe and, on miss, the full pipeline). Avoid overlapping engine work between the previous and newly prioritized position.

The key point: **the tree, eval curves, player stats, and positional radar continue to be computed incrementally in the game machine's `assign` blocks**, exactly as they do today. The game machine is still the authority on game-level metrics.

**`positionMachine` changes:**

1. **New initial state** (e.g. `CACHE_PROBE` or `checkingCache`) — `invoke` an async **cache loader** passed in via machine `input` / context (implemented by `GameCoordinator`, which has `db`). The loader resolves to a `PositionOutput` or `null`.
2. **Transitions:** `CACHE_HIT` (valid complete row for current `config_hash` / depth) → assign cached fields into context and go to **`done`** (or an equivalent final state that emits the same output shape as the post-`CLASSIFY` path). `CACHE_MISS` → enter existing **`GATHERING`**.
3. **No direct `better-sqlite3` in the machine file** — only the injected promise; keeps the graph testable with a stubbed loader.

```
Current flow (unchanged at the game-machine layer):
  positionMachine reaches terminal state (cache hit fast-path OR full GATHERING → … → CLASSIFY)
    → gameMachine.onDone assign:
      → setNodeResult(tree, nodeId, output)     ← updates tree
      → buildEvalCurveFromMainLine(newTree)      ← incremental
      → computePlayerStats(newTree, 'w')         ← incremental  
      → computePlayerStats(newTree, 'b')         ← incremental
      → computePositionalRadarData(newTree)      ← incremental

positionMachine (new front door):
  initial: invoke loadPositionCache({ fen, configHash })  ← Promise, implemented by coordinator
    → hit + depth/config OK → done (full PositionOutput in context)
    → miss → GATHERING → … (existing pipeline)

New addition (dual-write — coordinator only):
  GameCoordinator.actor.subscribe()
    → pushNewlyCompletedNodes()                  ← existing IPC push
    → writePositionToCache(node, result)         ← NEW: write to position_analysis

On game complete:
  GameCoordinator.actor.subscribe() receives COMPLETE snapshot
    → GameAnalysisQueueModel.markComplete(db, gameId, aggregates)
         ← writes accuracy_white, accuracy_black, white_stats_json,
            black_stats_json, eval_curve_json to game_analysis_queue
    → bus.emit('game:analysis:complete', { gameId })
```

#### 5b-persistence — Persistence ownership (canonical reference)

Two tables receive writes from the analysis pipeline. The responsibilities are:

| Table | Written by | When | What |
|-------|-----------|------|------|
| `position_analysis` | **Read:** injected cache loader invoked from **`positionMachine`**’s initial state (implementation lives in `GameCoordinator`). **Write:** `GameCoordinator` (via `actor.subscribe()`) | **Read** on position start (promise). **Write** each time a `positionMachine` actor completes and its terminal output appears in the snapshot | The `PositionOutput` for that FEN — eval, WDL, Maia moves, classification. The machine **never imports** `better-sqlite3`; it only awaits the injected loader. The coordinator implements the loader and the **dual-write** after completion. |
| `game_analysis_queue` | `GameCoordinator` (on `COMPLETE` game machine snapshot) | Once, when the `gameMachine` reaches the `COMPLETE` state | Game-level aggregates computed incrementally inside the game machine: `accuracy_white`, `accuracy_black`, `white_stats_json`, `black_stats_json`, `eval_curve_json`. The `gameMachine` computes these values in memory; the coordinator flushes them to the DB on completion via `GameAnalysisQueueModel.markComplete`. |

**Why the coordinator, not the machine?**

The `gameMachine` and `positionMachine` are XState actors — they own in-memory state and emit snapshots. They do **not** import or open the database. **Writes** always go through `GameCoordinator.subscribe`. **Reads** for the position cache go through an **injected async function** (promise) passed into `positionMachine` when the coordinator creates the actor, so the statechart expresses “await cache” without coupling the machine module to SQLite. This keeps graphs testable with a stubbed loader.

**The `game_analyses` JSON blob table (existing)** is unrelated to the two tables above. It stores the full in-memory `AnalysisNode` tree as a document (needed for variations, tree shape, and metadata that are not relational). It is **not** removed — the dual-write to `position_analysis` is additive, and the `game_analyses` blob remains the authoritative source for the tree until a future phase explicitly migrates away from it.

#### 5c — Renderer tree reconstruction

The renderer continues to receive the analysis tree from `analysis:getGameAnalysis` in the same shape as today — `GameAnalysisData` with a nested `AnalysisNode` tree. 

For a **fresh game** (no prior analysis), the tree starts with all `UNANALYZED` nodes, exactly as today. As positions complete, the game machine's `onDone` handlers patch the tree, and `analysis:node-update` pushes flow to the renderer via `setQueryData`.

For a **resumed game** (some positions already cached in `position_analysis`), the `GameCoordinator.initialize()` method hydrates the tree from the cache: it reads all completed `position_analysis` rows for the game, matches them to tree nodes by FEN, and applies cached results via `setNodeResult`. This means the tree starts partially populated, and the game machine only needs to analyze the remaining positions.

**No renderer changes needed.** The tree shape, the push channels, and the TanStack Query patching all work identically.

#### 5d — IPC push channels (unchanged pattern)

The existing push pattern continues:
- `analysis:node-update` — pushed when a position completes
- `analysis:game-state-update` — pushed on game-level transitions

The renderer composable `useGameAnalysis` continues to merge these into TanStack Query cache via `setQueryData`.

### Migration strategy

During Phase 5, both storage mechanisms coexist:
- The `gameMachine` continues to own the in-memory tree and save it as a JSON blob via `GameAnalysisModel.save()` (existing behavior, unchanged)
- Position results are **also** written to the normalized `position_analysis` table (dual-write)
- On game load, `GameCoordinator.initialize()` hydrates the tree from `position_analysis` cache before starting the machine — positions with cached results start as `NAG_COMPLETE` instead of `UNANALYZED`
- The old `game_analyses` JSON blob table continues to be the tree persistence mechanism throughout — it is **not** removed (the tree structure with children, variations, and game-level metadata is naturally a document, not relational)

### Files

```
src/services/analysis/
  AnalysisOrchestrator.ts      — NEW: singleton queue manager
  GameCoordinator.ts           — MODIFIED: inject cache loader, dual-write, aggregate write
  machines/gameMachine.ts      — MODIFIED: priority event only
  machines/positionMachine.ts  — MODIFIED: leading CACHE_PROBE invoke + transitions
```

---

## Phase 6 — New IPC APIs

**Goal:** Add the UI-facing APIs for prioritization and PGN mutation.

### `game:prioritize`

Called by the renderer when the user navigates to a game (e.g. `AnalysisPage` mounts).

```typescript
declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'game:prioritize': {
      request: { gameId: string; currentFen: string }
      response: { success: boolean }
    }
  }
}
```

**Handler logic:**
1. `GameAnalysisQueueModel.updatePriority(db, gameId, 1)`
2. Update all positions for this game to priority 2 (if currently lower)
3. Update the `currentFen` position to priority 1
4. `bus.emit('game:queue:updated', { reason: 'priority_changed' })`
5. `bus.emit('position:queue:updated', { reason: 'priority_changed' })`

### `position:prioritize`

Called by the renderer when the user navigates to a different move within a game.

```typescript
declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'position:prioritize': {
      request: { fen: string }
      response: { success: boolean }
    }
  }
}
```

**Handler logic:**
1. `PositionAnalysisModel.updatePriority(db, fen, configHash, 1)`
2. `bus.emit('position:queue:updated', { reason: 'priority_changed' })`

_Runtime:_ When this changes which position should analyze next, the active coordinator / machines must follow the **“Note — changing position priority”** under **5b — GameCoordinator + gameMachine modifications** (stop in-flight Stockfish, engine idle, then start the next position)._

### `pgn:mutate`

Called by the renderer after any tree mutation (variation, comment, NAG annotation).

```typescript
declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'pgn:mutate': {
      request: { gameId: string; pgn: string; currentFen: string }
      response: { success: boolean }
    }
  }
}
```

**Handler logic:**
1. `ChessGameModel.updatePgn(db, gameId, pgn)` — new static method on the existing model
2. `bus.emit('pgn:mutated', { gameId, pgn, currentFen })`

_Note: fire and forget from the renderer's perspective. The UI mutates its in-memory tree immediately and does not wait for confirmation._

### Files

```
src/api/analysis/handlers/
  prioritizeGame.ts
  prioritizePosition.ts
  mutatePgn.ts
```

Add to `src/api/analysis/register.ts`.

### Renderer integration

- `AnalysisPage.vue` `onMounted` → call `game:prioritize` with the current game ID and FEN
- `watch(currentFen)` → call `position:prioritize`
- Tree mutation composable → call `pgn:mutate` instead of the current direct `analysis:addVariation`

---

## Phase 7 — Sync Integration

**Goal:** Wire the sync worker to emit events and trigger the scheduler on `app:started`.

### Changes

1. **SyncWorker** — emit `game:synced` after each new game is inserted (Phase 3 prep, applied here)

2. **Main process bootstrap** — after `registerApi()`, initialize all services:

```typescript
// src/main.ts additions
import { eventBus } from './events'
import { GameAnalysisScheduler } from './services/analysis/GameAnalysisScheduler'
import { PositionQueueManager } from './services/analysis/PositionQueueManager'
import { AnalysisOrchestrator } from './services/analysis/AnalysisOrchestrator'

app.on('ready', async () => {
  initEngineManager()
  const db = database.getDatabase()
  registerApi({ ipcHandlerRegistry, db })

  // Initialize event-driven services
  const scheduler = new GameAnalysisScheduler(db, eventBus)
  const positionManager = new PositionQueueManager(db, eventBus)
  const orchestrator = new AnalysisOrchestrator(db, eventBus, positionManager)

  createWindow()

  // Kick off initial sync (runs after window is ready so UI can show progress)
  eventBus.emit('app:started', undefined)
})
```

3. **SyncCoordinator** — listens to `app:started`, triggers initial sync:

```typescript
export class SyncCoordinator {
  constructor(
    private db: Database.Database,
    private bus: EventBus<AppEvents>,
  ) {
    this.bus.on('app:started', () => this.runInitialSync())
  }

  private async runInitialSync(): Promise<void> {
    // Find all platform accounts and trigger sync for each
    const accounts = PlatformAccountModel.findAll(this.db)
    for (const account of accounts) {
      const worker = syncWorkerManager.getOrCreate(
        this.db, account.platformUsername, account.platform as SyncPlatform
      )
      await worker.buildQueue(true)
      await worker.start(/* progress callback */)
    }
  }
}
```

---

## Phase 8 — Deprecation & Cleanup

**Goal:** Remove `GameCoordinatorRegistry` and migrate IPC handlers to use the orchestrator. The `GameCoordinator`, `gameMachine`, and `positionMachine` all survive — they are the core analysis runtime.

### Changes

1. **Remove `GameCoordinatorRegistry`** — the orchestrator now manages coordinator lifecycle
2. **Migrate analysis IPC handlers** to delegate to the orchestrator + event bus:
   - `analysis:analyzeGame` → internally calls `GameAnalysisQueueModel.enqueue()` + `bus.emit('game:queue:updated')` instead of directly creating a coordinator. If the game is already queued, bumps priority.
   - `analysis:studyPosition` → internally calls `position:prioritize` logic (update priority + emit). The orchestrator forwards to the active game machine's `navigate`.
   - `analysis:addVariation` → internally calls `pgn:mutate` logic (update PGN + emit). The orchestrator forwards to the active game machine's `insertNode`.
3. **Update renderer composables:**
   - `useGameAnalysis` — call `game:prioritize` on mount instead of `analysis:analyzeGame`; analysis starts automatically
   - Navigation `watch(currentFen)` → call `position:prioritize` instead of `analysis:studyPosition`
   - Tree mutation → call `pgn:mutate` instead of `analysis:addVariation`
4. **Keep `game_analyses` table** — the JSON blob tree is still the persistence mechanism for the analysis tree. It is **not** removed.

---

## Phase 9 — Position Indexing (Future)

**Goal:** After game analysis completes, index critical positions for vector similarity search.

This phase is deferred and outlined here for completeness. It builds on the `game:analysis:complete` event.

### Design

A `PositionIndexer` service listens to `game:analysis:complete`:
1. Load all position results for the game
2. Filter to critical/interesting positions (blunders, high criticality)
3. Compute positional and structural vectors via the existing `FeatureRegistry`
4. Write to `sqlite-vec` virtual tables
5. Mark positions as indexed

This uses the existing `PositionalFeaturesService` and `FeatureRegistry` infrastructure from `.ai/features/game-analysis-critical-positions.md`.

---

## Implementation Sequence

| Order | Phase | Description | Dependencies | Estimated Scope |
|-------|-------|-------------|-------------|----------------|
| 1 | Phase 0 | Consolidate PGN parsing, migrate off chess.js | None | Additions to GameTree.ts, migrations across 5 files |
| 2 | Phase 1 | Event Bus (module augmentation) | None | 4 files, ~60 lines |
| 3 | Phase 2 | Database Schema | None | 4 files, ~300 lines |
| 4 | Phase 3 | Game Analysis Scheduler | Phase 0, 1, 2 | 1 file + event decl, ~60 lines |
| 5 | Phase 3b | SyncCoordinator bootstrap + typed push channels | Phase 1 | 5 files, ~100 lines |
| 6 | Phase 4 | Position Queue Manager | Phase 0, 1, 2 | 1 file + event decl, ~120 lines |
| 7 | Phase 5a | Orchestrator skeleton | Phase 1, 2, 3, 4 | 1 file, ~150 lines |
| 8 | Phase 5b | GameCoordinator + gameMachine mods | Phase 5a | Modifications to 2 existing files |
| 9 | Phase 5c | Tree hydration from cache | Phase 5b | Changes in GameCoordinator.initialize() |
| 10 | Phase 6 | New IPC APIs | Phase 1, 2 | 3 handlers, ~150 lines |
| 11 | Phase 7 | Sync + bootstrap wiring (full) | Phase 1–6 | Changes to main.ts + SyncWorker; absorbs Phase 3b |
| 12 | Phase 8 | Registry removal + handler migration | Phase 5–7 stable | Migrate existing code |
| 13 | Phase 9 | Position Indexing | Phase 5, future | Deferred |

### Parallel work opportunities

- Phase 1 (Event Bus) and Phase 2 (Database Schema) can be built in parallel
- Phase 3b (SyncCoordinator bootstrap) only needs Phase 1 — it can run immediately after the bus exists, before Phase 2/3 are started
- Phase 6 (IPC APIs) can be built in parallel with Phase 5 (Orchestrator), since the APIs write to the same DB tables but don't interact at the code level
- Phase 8 (Cleanup) should only happen after Phase 5–7 are tested and stable

---

## Risk Mitigation

### Data migration

No data migration is needed. The new tables are additive. Old `game_analyses` data (JSON blobs) are simply abandoned — analysis is re-runnable. On first launch after the refactor, the queue is empty and games are re-analyzed as they're synced or opened.

### Engine contention

The singleton Stockfish + Maia engines are a bottleneck. The orchestrator ensures only one position is analyzed at a time, same as today. The new architecture doesn't change this constraint — it only changes *which* position gets priority.

### Rollback

The `GameCoordinator` and `gameMachine` are never removed — they are the analysis runtime throughout. The new code (event bus, orchestrator, queue tables) is additive. At any phase boundary, the new services can be disabled and the old `GameCoordinatorRegistry` re-enabled. Phase 8 (removing the registry and migrating IPC handlers) is the point of no return.

### Performance

The priority queue queries (`ORDER BY priority DESC, queued_at ASC LIMIT 1`) hit indexed columns and return in microseconds even with thousands of rows. The `game_positions` join is also indexed. SQLite's WAL mode (already enabled) prevents write contention between the sync worker and the analysis orchestrator.

---

## Open Questions

1. **Auto-analyze threshold** — should the 30-day cutoff be configurable in settings, or is a hardcoded default sufficient for v1?

2. **Priority levels** — the plan uses 1 (user-focused), 2 (game-context), 3 (background). Is a fourth level needed for "manual re-analysis" requests?

3. **Position cache invalidation** — if the user changes analysis preset (fast → deep), should existing position results be re-analyzed at the new depth? The `config_hash` approach handles this by treating each config as a separate cache key, but the UI needs to decide which config to request.

4. **Variation analysis** — the current system analyzes variations (user-added lines). Should the new system auto-populate variation FENs into the position queue, or only mainline? The `pgn:mutated` handler naturally handles this by walking the full tree.

5. **Game-level aggregates in `game_analysis_queue`** — the game machine computes `PlayerStats`, eval curves, and radar incrementally as each position completes (this stays). The `game_analysis_queue` table stores final aggregates for use in the games list (accuracy columns, etc.). Should these aggregates be written only on `COMPLETE`, or also updated periodically during analysis for partially-analyzed games?

---

## Post-implementation follow-ups

Work to schedule **after** the phases above are implemented and stable — not blockers for the refactor itself.

### Sync progress IPC vs. disposed renderer frames

**Observed behavior:** While a sync worker runs in the main process, progress is pushed with `event.sender.send('sync:progress', …)` (e.g. `SyncStartHandler`) and/or `pushToRenderer(mainWindow.webContents, 'sync:progress', …)` (e.g. `SyncCoordinator`). If the user **navigates away**, **reloads**, or **closes** the window that started or owns that `WebContents`, the render frame may be torn down while sync continues. Electron then logs errors such as `Render frame was disposed before WebFrameMain could be accessed`. Progress updates are lost for that UI session; the main process and sync typically keep running.

**Follow-up work:**

- Before any push, guard with `webContents.isDestroyed()` (and consider other Electron lifecycle signals if needed) so disposed targets are skipped instead of throwing/logging every tick.
- Prefer sending progress to the **current** main window `WebContents` (or a small registry of live windows) rather than holding a stale `event.sender` from the IPC that started sync, if product-wise all windows should see sync state.
- Optionally dedupe or rate-limit logs when skips happen so long syncs do not flood the console.

**Note:** A persistent **blank white window** is usually a separate renderer issue (failed load, uncaught JS error, dev server). The disposed-frame error is a consequence of targeting a dead frame, not the root cause of a white screen.

### Games list: full refetch on every `sync:progress`

**Observed behavior:** `useSyncGames` (used from `AppSidebar.vue`) calls `queryClient.invalidateQueries({ queryKey: ['chess-games'] })` on **every** `sync:progress` event. That forces a full `chess:getAll` refetch and remaps the entire games list; `GamesTable` re-renders each time. Progress is emitted at least twice per queued month (month start + month end) plus start/end, so a long backfill triggers many full-list refetches and the UI feels sluggish.

**Follow-up work:**

- **Quick win:** Only invalidate `['chess-games']` when sync leaves `in_progress` (e.g. `completed`, `paused`, or terminal error / `idle` after failure). Keep updating sidebar sync status from every progress tick without touching the query cache.
- **Optional:** Debounce or throttle if mid-sync refresh is still desired (e.g. at most once every N seconds).
- **Incremental (larger):** Push newly inserted games (or IDs) to the renderer and merge into the TanStack Query cache with `setQueryData` (similar to analysis node updates in `useGameAnalysis`), avoiding repeated `chess:getAll` during sync. Would likely extend `game:synced`-style payloads or add IPC and a `chess:getByIds` (or equivalent) so rows can be built without a full table scan on the renderer.

**Relevant files:** `src/renderer/composables/syncGames/useSyncGames.ts`, `src/renderer/composables/chessGames/useChessGames.ts`, `src/services/sync/worker.ts` (`sendProgress` cadence).

### Focus / visibility: auto-sync on return to app

**Goal:** When the user brings Chess Lens back to the foreground (main window gains OS focus, and optionally when the renderer document becomes visible again after being backgrounded), run the same “kick sync for all accounts” path as startup — without hammering the network if they alt-tab constantly.

**Follow-up work:**

- **Event:** Add something like `app:focused` (exact name TBD) on the typed event bus, emitted from the main process when the primary `BrowserWindow` fires `'focus'` (and consider pairing with renderer `document.visibilityState === 'visible'` via a small IPC ping if “tab” behavior in dev or multi-window setups needs finer granularity than OS window focus).
- **Handler:** `SyncCoordinator` (or a sibling) listens for `app:focused` and calls the same internal helper used by `app:started` / initial sync — reusing the existing `syncWorkerManager.isRunning` guard so overlapping triggers do not double-start workers.
- **Rate guard (auto path only):** Before starting focus-triggered sync, check a persisted timestamp (e.g. per platform account’s last completed sync end time, or a single `last_background_sync_at` in app metadata). If a successful auto sync completed within the last **~1 hour**, skip the run. Tune the window (1h) as a constant.
- **Manual sync unchanged:** The user-initiated `sync:start` (or equivalent control on the games / settings page) must **bypass** this throttle — always allowed regardless of the 1-hour guard — and should update the “last sync” timestamp so the next focus event does not immediately re-fire a redundant auto sync if one just finished manually.

**Relevant areas:** `SyncCoordinator`, event bus augmentation (`app` lifecycle events), platform account or sync metadata storage for last-sync time, existing `SyncStartHandler` / `sync:start` entry point.
