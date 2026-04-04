# Queue-Driven GameCoordinator Refactor

## Problem Statement

The current GameCoordinator maintains an in-memory `AnalysisNode` tree that mirrors
the game tree in the renderer. IPC handlers (`analysis:studyPosition`,
`analysis:addVariation`) call methods like `navigateByFen` and `addVariationByFen`
on the coordinator to keep this mirror in sync with the renderer. This creates two
competing mental models:

1. **Queue-driven background work** — the `game_analysis_queue` and
   `position_analysis` tables decide what to analyze next.
2. **RPC-style coordinator** — the renderer tells the coordinator about navigation
   and tree mutations, requiring a concrete coordinator instance that mirrors
   renderer state.

The second model is a sync problem: keeping an in-memory tree consistent with the
renderer's tree across process boundaries is fragile and a breeding ground for
subtle bugs.

## Design Principles

1. **Queues drive all work.** The coordinator processes whatever the queue says is
   highest priority. No methods like `navigate` or `insertNode`.
2. **Four renderer interactions only.** `game:prioritize`,
   `game:position:prioritize`, `position:prioritize`, and `pgn:mutate`. Everything
   else flows through queue priorities and events.
3. **The game tree is a read-only data structure.** Built from PGN + hydrated from
   `position_analysis` whenever needed. No mutation methods (insertNode,
   addVariation, etc.). It exists to compute aggregates and per-node
   classifications that require neighbor context.
4. **All computation on the backend.** Player stats, accuracy, feature attribution,
   radar chart data, and per-node NAG classification are computed in the main
   process after each position completes. The renderer receives pre-computed
   results and only displays them.

### `game_positions` (out of scope for analysis logic)

The `game_positions` table is **not** used anywhere in this refactor for
prioritization, queue selection, or “which FENs belong to this game.” **All of
that comes from the PGN** stored on `chess_games` (`parseGameTree` +
`collectAllFens`).

`game_positions` is populated when a game is **synced** from the platform. It
will be used **later** for querying (e.g. search, indexing, features that do not
need the full PGN tree). It is **not** updated by `pgn:mutate` and must not be
treated as authoritative for the live game tree (variations, comments, etc.).

Implementation note: existing code paths that demote or join on `game_positions`
for analysis should be migrated to PGN-derived FEN sets so behavior matches this
document.

---

## Renderer → Backend API Surface

### `game:prioritize`

Called when: The user opens a game for analysis.

Payload: `{ gameId, currentFen }`

Handler behavior:
1. Demote all other games to background priority (`priority = 3`).
2. Load this game’s PGN, parse FENs — demote every pending `position_analysis` row
   whose FEN is **not** in that set to `priority = 3` (same rule as
   `game:position:prioritize`; do **not** use `game_positions` for this).
3. Enqueue game if not present, else bump to `priority = 1`.
4. Upsert `position_analysis` for every FEN from the PGN (`currentFen → 1`, all
   others in the PGN → `2`).
5. Emit `game:queue:updated { reason: 'priority_changed', gameId }`.

The orchestrator receives the event and, if a different game is active, preempts it
and starts the prioritized game. If the same game is already active, position
priority changes propagate naturally.

_(This handler exists; step 2 should be aligned with PGN-derived FENs, not
`game_positions`.)_

### `position:prioritize`

Called when: A standalone position needs a priority bump (no game context).

Payload: `{ fen }`

Handler behavior:
1. `UPDATE position_analysis SET priority = 1 WHERE fen = ? AND status = 'pending'`
2. Emit `position:queue:updated { reason: 'priority_changed' }`.

Simple single-row update. Does **not** touch other positions.

_(This handler already exists and needs minimal changes.)_

### `game:position:prioritize`

Called when: The user navigates to a different position **within a game** (clicking
a move in the PGN viewer, arrow-keying through the mainline, etc.). Also called
automatically by the `pgn:mutated` event handler when a variation is added.

Payload: `{ gameId, fen }`

Handler behavior (**PGN from `chess_games` is the source of truth** — see
`game_positions` note above):
1. Load the game's PGN, `parseGameTree` + `collectAllFens` → the set of all FENs
   in this game (**mainline + variations**).
2. Demote all pending `position_analysis` rows whose FEN is **not** in that set to
   `priority = 3` (other games, orphan rows).
3. Set every pending row whose FEN **is** in that set but is **not** the focused
   `fen` to `priority = 2`.
4. Set the **focused FEN** to `priority = 1`.
5. Emit `position:queue:updated { reason: 'priority_changed' }`.

This enforces a strict priority hierarchy:

| Priority | Meaning |
|---|---|
| 1 | The single FEN the user is looking at right now (mainline or variation) |
| 2 | Every other position that appears in this game's PGN (mainline + variations) |
| 3 | Every position not in this game's PGN |

New FENs from `pgn:mutate` are inserted at priority 3; the chained
`game:position:prioritize` call on `pgn:mutated` immediately lifts all in-PGN FENs
to 2 (except `currentFen` → 1).

Because there is only ever **one** pending row at priority 1, the arrow-key
scenario is solved cleanly: when the user moves from FEN A to FEN B, A becomes 2
and B becomes 1. The queue head changes unambiguously — no tie-break logic needed.

The orchestrator forwards the event to the active coordinator. Preemption compares
the pending queue head to the in-flight FEN — see "Coordinator position preemption"
below.

_(New handler — split out from `position:prioritize` for clarity.)_

### `pgn:mutate`

Called when: The user adds a variation, edits a comment, applies a NAG, or makes
any PGN modification.

Payload: `{ gameId, pgn, currentFen }`

Handler behavior:
1. `ChessGameModel.updatePgn(db, gameId, pgn)` — persist the new PGN.
2. Parse the full PGN (mainline + all variations) via `parseGameTree` +
   `collectAllFens`.
3. Upsert every FEN into `position_analysis` as pending at **priority 3**
   (`INSERT OR IGNORE` — existing rows are untouched, only genuinely new FENs
   from added variations get rows created).
4. Emit `pgn:mutated { gameId, pgn, currentFen }`.

Downstream: A handler on `pgn:mutated` calls the **same logic as
`game:position:prioritize`** with `{ gameId, fen: currentFen }`. This
automatically sets `currentFen` to priority 1, every other FEN from the parsed PGN
to 2, and everything outside the PGN to 3 — so the coordinator immediately picks up
the new position.

_(This handler already exists but needs the PGN-parse + upsert step added.
The `analysis:addVariation` handler gets removed — variation insertion is just a
PGN mutation now.)_

### `analysis:getGameAnalysis`

Called when: The renderer mounts the analysis page (initial load) or when the query
is invalidated by a `game:analysis:updated` event.

Payload: `{ gameId }`

Response: **`GameAnalysisResponse`** — a **top-level envelope** (game id, FSM-ish
status, game-level aggregates) plus a **`tree` property**: a nested **hydrated
analysis graph** (`AnalysisNode`), same idea as before this refactor.

**Why return the graph from main (not only a FEN map):**

1. **Single snapshot** — After each invalidation, tree shape, move data, and
   per-node analysis all came from the same PGN parse and DB read on main. The
   renderer does not have to hope its local PGN parse matches what the coordinator
   used (ordering, variations, new nodes).
2. **Matches the old model** — One object: aggregates at the top, `tree` for the
   graph. Familiar and easy to pass through TanStack Query.
3. **`AnalysisNode` is UI-shaped** — It mirrors `AugmentedNodeData` / `GameTree`
   node fields (SAN, from/to, FEN, children) plus analysis fields (`engineResult`,
   `nag`, `fsmState`, …). Components that today expect `GameNode` + `analysisByFen`
   can migrate to walking `AnalysisNode` directly, or build a `Map<fen,
   PositionAnalysis>` once via DFS for legacy helpers.

**Optional convenience:** The handler may also include `positions:
Record<fen, PositionAnalysis>` as a flat projection of the same data (one DFS) so
call sites that only need FEN lookup can migrate gradually. It is redundant with
`tree` if you prefer a smaller payload — pick one or ship both during transition.

**Optimistic edits:** While the user mutates the PGN before the next refetch, the
renderer can still keep a local `GameNode` from `parseGameTree` for instant UI; once
`getGameAnalysis` returns, replace or merge from `response.tree` so displayed
analysis matches main.

Handler behavior:
1. Read `game_analysis_queue` row for the game (aggregates, status).
2. Load the game’s PGN from `chess_games`; parse to a **skeleton** tree (same
   conversion as today’s `gameTreeToAnalysis` / PGN → `AnalysisNode` with stable
   ids and `children`).
3. For each node FEN, merge in `position_analysis` row data + game-context fields
   from `node_results_json` (NAG, `isBestMove`, etc.) so every node is fully
   hydrated.
4. Attach deserialized aggregates (accuracy, stats, eval curves, radar) on the
   response envelope.
5. Return `{ …envelope, tree }` (and optionally `positions`).

_(This handler exists today as FEN-map-only; extend it to build and return
`tree`.)_

---

## IPC Handlers to Remove

| Handler | Channel | Reason |
|---|---|---|
| `StudyPositionHandler` | `analysis:studyPosition` | Replaced by `game:position:prioritize` — queue-driven, no coordinator navigation |
| `AddVariationHandler` | `analysis:addVariation` | Merged into `pgn:mutate` — variations are PGN mutations |
| `AnalyzeGameHandler` | `analysis:analyzeGame` | Merged into `game:prioritize` — enqueueing is part of prioritization |
| `StopAnalysisHandler` | `analysis:stopAnalysis` | Orchestrator manages lifecycle; renderer unmount doesn't need to kill analysis |

## Push Channels to Remove

| Channel | Reason |
|---|---|
| `analysis:position-update` | Replaced by `game:analysis:updated` + query invalidation |
| `analysis:game-state-update` | Replaced by `game:analysis:updated` + query invalidation |

## New Push Channel

### `game:analysis:updated`

Emitted by: The coordinator, after each position completes and aggregates are
recomputed.

Payload: `{ gameId }`

Renderer behavior: Invalidate the `['game-analysis', gameId]` TanStack Query.
The query refetches from the DB, which now includes the latest position data and
updated aggregates.

This replaces both `analysis:position-update` and `analysis:game-state-update`
with a single, simpler mechanism. The renderer doesn't patch individual positions
into the cache — it refetches the full state. (SQLite reads of ~80 rows with
indexed queries are < 1ms; IPC transfer of the response is negligible.)

---

## Coordinator Redesign

### What gets removed from GameCoordinator

- `navigate(nodeId)` / `navigateByFen(fen)` — no coordinator navigation
- `insertNode(...)` / `addVariationByFen(...)` — no tree mutation
- `fenToNodeId` map — not needed without navigation
- In-memory `AnalysisNode` tree as a persistent, mutable data structure
- `pushPositionUpdate` / `pushGameState` — replaced by `game:analysis:updated`
- `sender` (webContents reference) — the coordinator no longer pushes to the
  renderer directly
- `gameInput` / `actor` — XState game machine is replaced

### What the coordinator becomes

A **worker** that processes positions from the queue for a specific game. Its
lifecycle is:

```
initialize() → start() → [position loop] → complete / preempted
```

#### Position loop (replaces XState game machine)

The coordinator knows its `gameId`. Whenever it needs the set of positions for the
game, it reads the PGN from the `games` table, parses it via `parseGameTree` +
`collectAllFens`, and uses those FENs directly. **No cached FEN set** — the PGN in
the DB is always the source of truth. This naturally picks up variation FENs added
by `pgn:mutate` without the coordinator needing to listen for `pgn:mutated` events
or maintain any state.

```
while not stopped:
  pgn = ChessGameModel.getPgn(db, gameId)
  fens = collectAllFens(parseGameTree(pgn))
  next = fetchHeadForFens(db, fens, configHash)
  if next is null:
    mark game complete
    computeAndPersistAggregates(final=true)
    emit game:analysis:updated
    emit game:analysis:complete
    break

  PositionAnalysisModel.markInProgress(next.id)
  result = await analyzePosition(next.fen)  // position pipeline
  PositionAnalysisModel.markComplete(next.id, result)
  computeAndPersistAggregates(final=false)
  emit game:analysis:updated
```

`fetchHeadForFens` is a new query: `SELECT ... FROM position_analysis WHERE fen IN
(?) AND config_hash = ? AND status = 'pending' ORDER BY priority ASC, queued_at ASC
LIMIT 1`. This replaces the legacy head query that scoped rows via a non-PGN join
and missed variation FENs.

Parsing the PGN each iteration is cheap (< 1ms for a typical game with a few
variations) and eliminates an entire class of stale-cache bugs.

#### Position pipeline and preemption — keep the position machine

**The position machine is retained.** The game machine goes away; the position
machine stays. Here is why this is the right split:

The game machine's value in preemption was specifically `STOP_AND_WAIT`:

1. An in-progress event (`navigate`, `priorityChanged`, `insertNode`) fires.
2. XState auto-cancels the child position machine actor on exit — the in-flight
   `fromPromise` for Stockfish is abandoned immediately **at the JS level**.
3. `STOP_AND_WAIT` invokes `stopEngines` which calls `stockfish.stopAndWait()`,
   `maiaFloor.stopAndWait()`, etc. in parallel.
4. Each `stopAndWait()` sends the UCI `stop` command and awaits the `bestmove`
   response — Stockfish returns early with its best result so far. This is fast
   (tens of ms) and deterministic.
5. Once all engines have drained, `STOP_AND_WAIT` transitions to `IDLE` and the
   next position starts fresh.

The key insight: **the Stockfish Promise does not need to settle before the next
position can start.** `stopAndWait()` *causes* Stockfish to produce a `bestmove`
immediately, which resolves the engine-level Promise. The position machine actor
is already cancelled before that happens so the result is discarded. The important
thing is the engine is in a clean `ready` state before the next analysis call, not
that the original Promise resolved with a meaningful value.

The engine drain moves **inside** the position machine. Add a `STOP_AND_WAIT` state
and a `STOP` event, with `stopEngines` as an injectable actor (same pattern already
used in the game machine today):

```
// New states added to positionMachine:

on: {
  STOP: { target: 'STOP_AND_WAIT' }
}

STOP_AND_WAIT: {
  invoke: {
    src: 'stopEngines',          // calls stopAndWait() on all engines in parallel
    onDone:  'STOPPED',
    onError: 'STOPPED',
  }
}

STOPPED: { type: 'final' }      // coordinator awaits this
```

From any active state — `CACHE_PROBE`, `GATHERING`, `EVAL_MAIA_MOVES` — a `STOP`
event transitions to `STOP_AND_WAIT`. XState auto-cancels the in-flight
`fromPromise` actors (Stockfish search Promise abandoned at the JS level), then
`stopEngines` calls `stockfish.stopAndWait()` + `maiaFloor.stopAndWait()` in
parallel (< 50ms). On done the machine enters the `STOPPED` final state.

The coordinator sends `STOP` and awaits the machine reaching its final state via
`toPromise(positionActor)`:

```ts
// On preemption:
positionActor.send({ type: 'STOP' })
await toPromise(positionActor)           // resolves when STOPPED final state is entered
// engines are fully drained, safe to start next search
PositionAnalysisModel.markPending(db, inFlightId)
// loop dequeues head, creates new positionActor
```

This is the same `STOP_AND_WAIT` pattern from the game machine, moved one level
down into the position machine where it belongs. The coordinator has zero knowledge
of which engines exist or how to drain them — that stays encapsulated in the machine.

#### Coordinator position preemption

When the orchestrator forwards a `position:queue:updated { reason: 'priority_changed' }`
event, the coordinator:

1. Reads the PGN from the DB, parses it, collects all FENs.
2. Queries `head = fetchHeadForFens(db, fens, configHash)` — the highest-priority
   **pending** row for this game's positions. (The currently in-progress row is not
   pending, so it is excluded from this result.)
3. If `head` is null or `head.fen === inFlightFen`: nothing to do.
4. If `head.fen !== inFlightFen`:
   a. `positionActor.send({ type: 'STOP' })`
   b. `await toPromise(positionActor)` — machine drains engines internally, enters
      `STOPPED` final state (< 50ms).
   c. `PositionAnalysisModel.markPending(db, inFlightId)`
   d. Loop continues — dequeues `head`, starts new position machine.

This works cleanly with `game:position:prioritize`: when the user arrow-keys from
A to B, the handler sets B to priority 1 and A to priority 2 (or 3 if variation).
The in-flight row (A) is `in_progress`, so `fetchHeadForFens` returns B. Since
`B !== A`, preemption fires, position machine drains to `STOPPED`, and the next
iteration starts on B.

When a variation is added via `pgn:mutate`, no special notification is needed — the
coordinator reads the updated PGN at the top of the next loop iteration (or on the
next preemption check) and naturally picks up new FENs.

This replaces the game machine's `STOP_AND_WAIT → IDLE → re-evaluate` cycle.

---

## Aggregate Computation

### When it runs

After **every position completion** (incremental) and once on **game completion**
(final pass).

### What it computes

1. **Build hydrated game tree**: Parse PGN → game tree. For each node, look up the
   corresponding `position_analysis` row. If complete, hydrate the node with raw
   position data (engine result, maia predictions, phase, features).

2. **Per-node classifications** (require neighbor context):
   - **NAG**: based on EPL (Expected Points Loss) between parent and child WDL.
     Some NAGs also depend on positional features, best move comparison, and maia
     predictions.
   - **isBestMove**: compare the played UCI move to the engine's `bestMove` from
     the parent position's result.
   - **floorMistakeProb / ceilingMistakeProb**: from maia predictions + whether the
     played move matches predicted human moves.
   - These are game-context-dependent (same FEN might classify differently in
     different games), so they are NOT stored in `position_analysis`. They are
     stored as part of the game's aggregate data.

3. **Game-level aggregates**:
   - **Accuracy** (white/black): average of per-move accuracy values from EPL.
   - **Player stats** (white/black): NAG counts, best move count, book move count,
     total moves.
   - **Eval curve**: mainline evalCp values for the chart.
   - **Maia eval curves**: floor/ceiling Maia best-move evals along the mainline.
   - **Positional radar data**: weighted feature attribution across mainline
     positions (eval-delta gated, WDL-volatility weighted).

4. **Persist**: Write aggregates to `game_analysis_queue`. Node-level
   classifications are stored in a JSON column (`node_results_json`).

### Position-only vs game-context data

| Data | Stored in | Shared across games? |
|---|---|---|
| Engine result (evalCp, WDL, bestMove, lines) | `position_analysis.result_json` | Yes |
| Maia predictions (floor/ceiling) | `position_analysis.result_json` | Yes |
| Augmented maia (with Stockfish evals) | `position_analysis.result_json` | Yes |
| Phase classification | `position_analysis.result_json` | Yes |
| Positional features | `position_analysis.result_json` | Yes |
| NAG classification | `game_analysis_queue.node_results_json` | No |
| isBestMove | `game_analysis_queue.node_results_json` | No |
| Accuracy per move | computed on the fly from aggregates | No |
| Mistake probability | `game_analysis_queue.node_results_json` | No |

### Position machine output (what gets cached)

The position machine's CLASSIFY step currently computes NAG and isBestMove. In the
new design, the position machine only produces **position-only** data:

- Engine analysis result
- Maia floor + ceiling predictions
- Augmented maia evaluations (Stockfish eval per maia-predicted move)
- Phase classification
- Positional features

NAG, isBestMove, and other context-dependent values move to the aggregate
computation step.

This means the position machine pipeline becomes:
`CACHE_PROBE → GATHERING (engine + maia + features) → EVAL_MAIA_MOVES → COMPLETE`

The CLASSIFY step is removed from the position machine entirely.

---

## Renderer Changes

### Remove renderer-side computation

These composables currently compute data in the renderer that should be computed
backend-side:

- **`usePlayerStats`**: walks the mainline and computes accuracy/NAG counts from
  the FEN map. → Delete. Read pre-computed stats from `GameAnalysisResponse`.
- **`useGameSummaryRadar`**: calls `computePositionalRadarFromFenMap`. → Delete.
  Read pre-computed radar data from `GameAnalysisResponse`.
- **`computePositionalRadarFromFenMap`** in `featureAttribution.ts`: the renderer
  variant of radar computation. → Delete (keep `computePositionalRadarData` for
  backend use, refactored to accept the hydrated tree).

### Simplify `useGameAnalysis`

Current:
- Subscribes to `analysis:position-update` and `analysis:game-state-update`
- Patches individual positions into the TanStack Query cache
- Calls `analysis:studyPosition` on navigation
- Calls `analysis:stopAnalysis` on unmount

New:
- Subscribes to `game:analysis:updated` only
- On event: `queryClient.invalidateQueries(['game-analysis', gameId])`
- Uses `GameAnalysisResponse.tree` (hydrated `AnalysisNode`) as the analysis-backed
  graph after fetch; derive `analysisByFen` from a tree DFS if needed for existing
  components, or refactor consumers to read from `tree` directly
- Calls `game:position:prioritize` on navigation (replaces `studyPosition` +
  `position:prioritize`)
- Calls `game:prioritize` once on mount (already does this)
- No `stopAnalysis` on unmount

### `GameAnalysisResponse` shape

```ts
interface GameAnalysisResponse {
  gameId: string
  gameFsmState: GameFSMState
  status: 'pending' | 'in_progress' | 'complete' | 'failed'  // or derive from queue row

  // Game-level aggregates (from `game_analysis_queue`, pre-computed on main)
  accuracy_white: number | null
  accuracy_black: number | null
  whiteStats: PlayerStats | null
  blackStats: PlayerStats | null
  evalCurve: EvalCurvePoint[] | null
  maiaFloorEvalCurve: number[] | null
  maiaCeilingEvalCurve: number[] | null
  radarData: PositionalRadarData | null

  /** Hydrated graph: PGN structure + per-node analysis. Primary payload. */
  tree: AnalysisNode

  /** Optional flat projection for gradual migration; omit if tree-only. */
  positions?: Record<string, PositionAnalysis>
}
```

`tree` is built on main from the authoritative PGN and DB rows so the renderer
gets one consistent graph. See `analysis:getGameAnalysis` above.

---

## Open Questions — Answers

### Q1: What value does the game FSM provide?

**Answer: Minimal in the new architecture — remove it; keep the position machine.**

The game FSM's primary value was managing the interaction between navigation/priority
events and the position pipeline within a single XState actor. With queue-driven
position selection that responsibility moves to the coordinator loop and DB query.

What the game machine handled and what replaces it:

| Game machine responsibility | Replacement |
|---|---|
| Position machine lifecycle (spawn/stop) | Coordinator loop starts/stops position machine actors directly |
| Tracking which positions are analyzed | Queue status in `position_analysis` (`pending` / `in_progress` / `complete`) |
| `STOP_AND_WAIT` — draining engines before next position | Moved into position machine: `STOP` event → `STOP_AND_WAIT` (invokes `stopEngines`) → `STOPPED` final state; coordinator `send({ type: 'STOP' })` then `await toPromise(actor)` |
| Priority re-evaluation after navigation | Coordinator's `onPriorityChanged()` queries queue head and preempts |
| Background vs. focused position selection | Queue priority levels (1 / 2 / 3) drive which FEN is dequeued next |

**Position machine is retained.** It is not simplified to `Promise.all` because:
1. `GATHERING` runs ENGINE + MAIA + FEATURES in parallel — XState parallel state
   is the right primitive for this; rewriting it is churn with no benefit.
2. The machine already handles `onError` gracefully per branch without try/catch
   sprawl in the coordinator.
3. Stopping a position machine actor is one line (`actor.stop()`); the coordinator
   then calls `stopAndWait()` on each engine explicitly (same as `STOP_AND_WAIT`
   but imperative — see "Coordinator position preemption" above).

### Q2: Best mechanism for updating the renderer?

**Answer: `game:analysis:updated { gameId }` → query invalidation.** This is the
simplest correct approach.

Implementation:
1. Coordinator emits via `webContents.send('game:analysis:updated', { gameId })`
   after each position completes and aggregates are recomputed.
2. Renderer subscribes: `ipcService.on('game:analysis:updated', handler)`.
3. Handler: `queryClient.invalidateQueries({ queryKey: ['game-analysis', gameId] })`.
4. TanStack Query refetches the full `GameAnalysisResponse` from the DB.

Trade-offs:
- **Pro**: No cache patching logic, no partial updates, no sync bugs. The renderer
  always gets a consistent snapshot from the DB.
- **Pro**: Dead simple to reason about.
- **Con**: Full refetch on every position completion (~80 fetches for a typical
  game). But SQLite indexed reads + IPC transfer is < 5ms per fetch. Total overhead
  for a full game: ~400ms spread across minutes of analysis. Negligible.
- **Future optimization**: If needed, batch events with a debounce (e.g., 200ms)
  so rapid completions produce fewer refetches. Not needed initially.

---

## Schema Changes

### `game_analysis_queue` — new columns

```sql
ALTER TABLE game_analysis_queue ADD COLUMN node_results_json TEXT;
ALTER TABLE game_analysis_queue ADD COLUMN radar_data_json TEXT;
ALTER TABLE game_analysis_queue ADD COLUMN maia_floor_curve_json TEXT;
ALTER TABLE game_analysis_queue ADD COLUMN maia_ceiling_curve_json TEXT;
```

- `node_results_json`: `Record<fen, { nag, isBestMove, criticalityScore, floorMistakeProb, ceilingMistakeProb }>`. Game-context-dependent per-node classifications.
- `radar_data_json`: serialized `PositionalRadarData`.
- `maia_floor_curve_json` / `maia_ceiling_curve_json`: maia eval curves.

---

## Event Flow Summary

### Position completes (happy path)

```
Coordinator: position pipeline finishes
  → PositionAnalysisModel.markComplete(id, resultJson)
  → computeAndPersistAggregates()
    → parse PGN into tree
    → hydrate tree from position_analysis cache
    → compute per-node classifications (NAG, isBestMove, etc.)
    → compute game aggregates (accuracy, stats, eval curve, radar)
    → GameAnalysisQueueModel.updateAggregates(gameId, aggregates)
  → webContents.send('game:analysis:updated', { gameId })
Renderer: onGameAnalysisUpdated(gameId)
  → queryClient.invalidateQueries(['game-analysis', gameId])
  → TanStack Query refetches → getGameAnalysis handler reads from DB
  → UI re-renders with new data
```

### User navigates to a position (within a game)

```
Renderer: user clicks a move or arrow-keys
  → ipcService.send('game:position:prioritize', { gameId, fen })
Handler:
  → load PGN, collectAllFens → game FEN set
  → demote pending rows not in game FEN set to priority 3
  → set all pending rows in game FEN set (except focused) to priority 2
  → set focused FEN to priority 1
  → bus.emit('position:queue:updated', { reason: 'priority_changed' })
Orchestrator:
  → coordinator.onPriorityChanged()
Coordinator:
  → read PGN, parse FENs, fetchHeadForFens → head is the focused FEN (priority 1, pending)
  → if head.fen !== inFlightFen: abort current, loop picks up head
  → position completes → aggregates → game:analysis:updated
```

### User adds a variation

```
Renderer: user makes a move creating a variation
  → mutate in-memory tree (optimistic UI)
  → serialize to PGN
  → ipcService.send('pgn:mutate', { gameId, pgn, currentFen })
Handler (pgn:mutate):
  → ChessGameModel.updatePgn(db, gameId, pgn)
  → parse PGN, collectAllFens (mainline + variations)
  → upsert all FENs into position_analysis (INSERT OR IGNORE, priority 3)
  → bus.emit('pgn:mutated', { gameId, pgn, currentFen })
Handler (pgn:mutated):
  → calls game:position:prioritize logic with { gameId, currentFen }
  → in-PGN FENs → 2 (except currentFen → 1); not in PGN → 3
  → bus.emit('position:queue:updated', { reason: 'priority_changed' })
Coordinator:
  → receives priority_changed → reads PGN from DB, parses, gets FENs
  → fetchHeadForFens → new variation FEN at priority 1 → preempt if needed
  → position completes → aggregates → game:analysis:updated
```

### User opens a game

```
Renderer: analysis page mounts
  → ipcService.send('game:prioritize', { gameId, currentFen: STARTING_FEN })
  → subscribe to 'game:analysis:updated'
Handler:
  → demote other games/positions
  → enqueue/bump game to priority 1
  → populateFromPgn (currentFen at priority 1, others at 2)
  → bus.emit('game:queue:updated', { reason: 'priority_changed', gameId })
Orchestrator:
  → preempt if different game active
  → startGame: create coordinator, start position loop
Coordinator:
  → loop processes positions by priority
  → after each: aggregates → game:analysis:updated
Renderer:
  → query invalidated → refetch → render
```

---

## Implementation Phases

### Phase 1: Backend — Aggregate computation service

Create a `GameAggregateService` (or inline in the coordinator) that:
1. Parses PGN → tree using `parseGameTree`
2. Hydrates the tree from `position_analysis` rows
3. Computes per-node classifications (NAG, isBestMove, mistake probabilities)
4. Computes game-level aggregates (accuracy, stats, eval curve, maia curves, radar)
5. Persists to `game_analysis_queue`

This is the core new logic. Most of the computation code already exists — it just
needs to be reorganized:
- `computePlayerStats` from `gameMachine.ts` → moves here (adapted for hydrated tree)
- `computePositionalRadarData` from `featureAttribution.ts` → moves here
- `buildEvalCurveFromMainLine` from `gameMachine.ts` → moves here
- NAG classification from `MoveClassificationService` → applied per-node here

### Phase 2: Backend — Rewrite coordinator as async loop

1. Remove XState game machine dependency.
2. Replace with async loop: fetch head → analyze → persist → aggregate → notify.
3. Keep position machine. Add `STOP` event + `STOP_AND_WAIT` state + `STOPPED`
   final state + injectable `stopEngines` actor (same pattern as game machine today).
   Remove the `CLASSIFY` state (NAG/isBestMove moves to aggregate computation).
4. Remove `navigate`, `navigateByFen`, `insertNode`, `addVariationByFen`,
   `fenToNodeId`, `pushPositionUpdate`, `pushGameState`, `sender`.
5. Add `onPriorityChanged()` that reads PGN from DB, parses FENs, queries
   `fetchHeadForFens`, sends `STOP` to active position actor, `await toPromise(actor)`
   (engines drain inside machine), marks in-progress row pending, dequeues head.
7. Replace legacy `fetchHeadForGame` with `fetchHeadForFens` (read PGN → parse FENs
   → query `position_analysis` by that set). No cached state — PGN is the source
   of truth. Remove any analysis-time dependency on `game_positions`.

### Phase 3: Backend — Simplify IPC layer

1. Remove `StudyPositionHandler`, `AddVariationHandler`, `AnalyzeGameHandler`,
   `StopAnalysisHandler`.
2. Update `register.ts` to remove their registrations.
3. Add `GamePositionPrioritizeHandler` for `game:position:prioritize`.
4. Add `game:analysis:updated` push channel.
5. Update `GetGameAnalysisHandler` to include new aggregate fields and merge
   `node_results_json` into per-position data.
6. Schema migration: add new columns to `game_analysis_queue`.
7. Update `pgn:mutate` handler to parse PGN and upsert all FENs (mainline +
   variations) into `position_analysis` at priority 3 before emitting
   `pgn:mutated`.
8. Wire `pgn:mutated` event handler that calls the `game:position:prioritize`
   logic with `{ gameId, currentFen }` to auto-prioritize the new position.
9. Migrate `game:prioritize` and any `PositionAnalysisModel` demote/join helpers that
   still use `game_positions` so they use PGN-derived FEN sets instead.

### Phase 4: Renderer — Simplify composables

1. Update `useGameAnalysis`:
   - Replace `analysis:position-update` / `analysis:game-state-update` listeners
     with `game:analysis:updated` listener.
   - Remove cache-patching logic; just invalidate on event.
   - Replace `navigateToPosition` with `game:position:prioritize` call.
   - Remove `analysis:stopAnalysis` on unmount.
2. Delete `usePlayerStats` — read from `GameAnalysisResponse.whiteStats` /
   `blackStats`.
3. Delete `useGameSummaryRadar` — read from `GameAnalysisResponse.radarData`.
4. Delete `computePositionalRadarFromFenMap` from `featureAttribution.ts`.
5. Update components that consumed these composables to use the new response shape.

### Phase 5: Cleanup

1. Remove `gameMachine.ts` (or gut it down to just the helper functions that are
   now used by the aggregate service).
2. Remove `AnalysisNode` tree mutation helpers (`insertChildNode`, etc.) from
   `gameMachine.ts`.
3. Remove `GameAnalysisData` type (marked `@deprecated`).
4. Remove `analysis:position-update` and `analysis:game-state-update` channel
   declarations.
5. Update `.ai/` documentation to reflect the new architecture.
6. Update FAQ docs if NAG classification or accuracy computation behavior changed.

---

## Risk Assessment

- **Incremental aggregates on every position**: ~5ms overhead per position for a
  full tree walk + aggregate computation. 80 positions × 5ms = 400ms total across
  minutes of analysis. Acceptable.
- **Full refetch on invalidation**: ~160KB per fetch (80 positions × ~2KB each) over
  IPC (in-process). < 5ms. With ~80 fetches per game analysis: ~400ms total.
  Acceptable. Can debounce if needed.
- **NAG instability during analysis**: A node's NAG might change as its neighbors
  get analyzed. This is correct behavior — the aggregate recomputation handles it.
  The renderer sees the latest classification on each refetch.
- **Position machine simplification**: Removing the CLASSIFY step from the position
  machine means it only produces raw data. This is a clean separation but requires
  testing that all downstream consumers handle the absence of `nag`/`isBestMove`
  on position_analysis results.
