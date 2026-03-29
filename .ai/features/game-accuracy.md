# Game Accuracy & Player Stats

## Overview

Game-level player statistics — accuracy, NAG counts, book/best move counts — are computed as runtime-only aggregations inside the game machine. Accuracy is a single percentage (0–100%) summarizing how well a player performed, computed directly from Stockfish's native WDL output as Expected Points — `(W + 0.5 * D) / 1000` — rather than a sigmoid approximation over centipawns. The per-move EP delta is mapped to an Accuracy% via an exponential decay curve. The game-level score uses a blend of an arithmetic mean and a harmonic mean rather than a simple average — the harmonic component penalizes inconsistency.

## Design Principles

- **WDL-native**: All accuracy values derive from Stockfish WDL, never centipawns.
- **No persistence of derived values**: Per-move accuracy, game accuracy, and NAG counts are computed on the fly from raw per-position data already stored on `AnalysisNode`. None are persisted to the database.
- **Incremental**: Stats are recomputed after each position machine completes, so the UI shows progressively updating scores during analysis.
- **Mainline only**: All game-level stats (accuracy, NAG counts, book/best move counts) are computed from the mainline (`children[0]` chain), not variations.
- **Single aggregation point**: The game machine owns all game-level stat computation. Composables and UI components read from the machine context rather than doing independent tree walks.

## Per-Move Accuracy

### Signal

Expected Points Loss (EPL) from the mover's perspective, derived from adjacent nodes' WDL:

```
EP = (wdl.win + wdl.draw / 2) / 1000

White moved: EPL = EP(parent) - EP(child)
Black moved: EPL = EP(child) - EP(parent)
```

EPL is clamped to `≥ 0` (a move that improves the position gets EPL = 0, not negative).

### Curve: EPL → Accuracy%

```typescript
function moveAccuracyFromEPL(epLoss: number): number {
  const pctLoss = epLoss * 100
  const raw = 103.1668 * Math.exp(-0.04354 * pctLoss) - 3.1669
  return Math.min(100, Math.max(0, raw))
}
```

| EPL   | Accuracy% |
|-------|-----------|
| 0.00  | 100.0     |
| 0.02  | 91.7      |
| 0.05  | 79.8      |
| 0.10  | 61.6      |
| 0.20  | 36.4      |
| 0.50  | 5.9       |

### Where it's computed

`MoveClassificationService.classify()` already computes EPL. It will also compute `moveAccuracy` and return it in `ClassifyOutput`. The value flows through `PositionOutput` → game machine's `onDone` handler, where it's used transiently for the game accuracy aggregation.

Per-move accuracy is **not** stored on `AnalysisNode` (it's derived from adjacent nodes' WDL, which violates the cross-node persistence rule).

## Game-Level Accuracy

### Why not a simple average?

A plain arithmetic mean treats every move equally. In practice:

- **Consistency matters** — a player who scores 95% on 39 moves and 10% on one critical move should be penalized more than a simple average suggests. This is not yet addressed in the current implementation (see Future section below).

### Algorithm

Simple arithmetic mean of per-move accuracy scores:

```
gameAccuracy = Σ(accuracy_i) / n
```

Only non-book moves with WDL data on both the current and parent node contribute.

#### Future: Harmonic Mean Blend + Volatility Weighting

Two enhancements to revisit together once a proper criticality/volatility score is designed:

1. **Harmonic mean blend** — blending the arithmetic mean with a harmonic mean would penalize inconsistency (one bad move drags the score down harder). The harmonic mean alone is too brutal (a single blunder can halve the score), so it should be blended at a low weight (e.g. 15–25%). Worth revisiting once volatility weighting is in place so the two effects can be tuned together.

2. **Volatility-weighted mean** — replace the unweighted arithmetic mean with a weighted mean where moves in critical positions count more. The existing `criticalityScore` (sigmoid over evalCp swing) is too simplistic — it conflates "the player blundered" with "the position was sharp." A better signal would measure pre-move tension (e.g., spread of EP across top engine lines) rather than post-move eval swing.

### Where it lives

- `GameContext.whiteStats: PlayerStats` and `GameContext.blackStats: PlayerStats` — **runtime-only**, not on `GameAnalysisData`.
- Recomputed by a `computePlayerStats(tree, color)` helper that walks the mainline and returns the full `PlayerStats` struct (accuracy, NAG counts, book/best move counts, total moves).
- Called in the `assign` blocks of `POSITION_ANALYSIS.onDone` and `BACKGROUND_PROCESSING.onDone`, after the tree is updated.
- Accuracy returns `null` until at least one non-book move with WDL data is analyzed for that color.

### Where it's consumed

- `usePlayerStats` becomes a thin reader of the game machine's snapshot context (or is removed entirely if the UI can read from the machine directly).
- `ChessPlayerStatsPanel` displays the values (no change to template needed — it already renders `stats.accuracy`, `stats.nagCounts`, etc.).

## Player Stats Structure

All game-level per-player stats are grouped into a single `PlayerStats` interface, computed together in one mainline walk:

```typescript
interface PlayerStats {
  accuracy: number | null
  nagCounts: Partial<Record<NAG, number>>
  bookMoveCount: number
  totalMoves: number
  bestMoveCount: number
}
```

This is the same shape already used by `usePlayerStats.ts`. The difference is that computation moves from the composable into the game machine, and the tree walk follows `children[0]` only (mainline) instead of doing a full DFS across variations.

## Implementation Steps

| # | File | Change |
|---|------|--------|
| 1 | `MoveClassificationService.ts` | Add `moveAccuracy: number` to `ClassifyOutput`. Compute it from EPL inside `classify()`. Extract the `moveAccuracyFromEPL` formula (currently in `usePlayerStats`). |
| 2 | `positionMachine.ts` | Add `moveAccuracy` to `ClassifyPositionResult`, `PositionContext`, and `PositionOutput`. Wire it through CLASSIFY → output. |
| 3 | `gameMachine.ts` | Add `whiteStats: PlayerStats` and `blackStats: PlayerStats` to `GameContext` (runtime-only section). Implement `computePlayerStats(tree, color)` — a single mainline walk that returns the full `PlayerStats` struct. Call it in both `onDone` assign blocks after the tree is updated. |
| 4 | `usePlayerStats.ts` | Replace the tree-walking computation with a thin reader of the game machine's snapshot context. The `PlayerStats` interface stays here (or moves to a shared types location) but the computation logic is removed. |

## Open Questions

- **Harmonic mean + volatility weighting**: Both deferred — see "Future" section in the algorithm. Revisit together so the blend ratio and weighting can be tuned as a unit.
