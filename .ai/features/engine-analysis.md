# Engine Analysis — Pipeline Steps

## Goal

For every position on the main line, determine:

1. **Stockfish eval** — centipawn or mate score, normalized to White's perspective
2. **Top N Stockfish lines** — best moves and their evals (e.g. top 3 via multipv)
3. **Eval swing** — eval before my move vs eval after my move (how much did my move cost or gain?)
4. **Maia human-move predictions** — most probable moves for my rating at the time of the game
5. **Stockfish evals for Maia moves** — cross-reference: how good are the "human" moves according to Stockfish?
6. **Mistake probability** — using Maia move probabilities weighted by Stockfish eval quality, how likely is the player to find a good move vs make a mistake/blunder?
7. **Mistake probability at next rating up** — same calculation using the ceiling Maia model
8. **NAG classification** — annotate the move (brilliant, good, neutral, dubious, mistake, blunder)

---

## Eval Normalization Convention

Evals use the standard convention: **positive = White is winning, negative = Black is winning.** This does not change based on which player the user is.

Stockfish reports scores from the side-to-move's perspective, so the pipeline negates the score when Black is to move (the current code already does this). All stored evals — `evalCp`, `evalMate`, and any Stockfish evals attached to Maia predictions — follow this convention.

**Eval swing** is always computed from the perspective of the side that moved. Each `AnalysisNode` already carries `node.color` (`'w'` or `'b'`), which determines the sign:

- **White plays:** `evalSwing = evalBefore - evalAfter` (positive = White lost eval, bad for White)
- **Black plays:** `evalSwing = evalAfter - evalBefore` (positive = eval went up for White = bad for Black)

This means `evalSwing > 0` always means "the player who moved made things worse for themselves," regardless of color. No need to pass the user's color into the pipeline — `node.color` is sufficient.

The user's color (which side they played) is only needed at the **UI layer** for filtering and display (e.g. "show my mistakes" vs "show opponent's mistakes").

---

## gameMachine States (unchanged)

```
PHASE_CLASSIFICATION → PGN_ANALYSIS → COMPLETE
```

- **PHASE_CLASSIFICATION**: Classifies opening/middlegame/endgame per position. Produces the game-phase tags on the tree.
- **PGN_ANALYSIS**: Iterates through each main-line position, invoking the `positionMachine` for each. Advances `currentIndex` and accumulates `evalCurve`.
- **COMPLETE**: All positions analyzed.

No changes needed to `gameMachine.ts`. The new work is entirely inside the `positionMachine`.

---

## positionMachine States (updated)

```
GATHERING (parallel)                     ← Step 1: collect raw data
├── ENGINE: Stockfish multipv:N
└── MAIA: Maia floor + ceiling
        ↓ (both complete)
EVAL_MAIA_MOVES                          ← Step 2: second Stockfish pass for gap moves
        ↓
CLASSIFY                                 ← Step 3: derive annotations
        ↓
COMPLETE
```

### Unified N

Stockfish `multipv` and Maia `topN` use the **same value** so the number of candidate moves is consistent across engines. This is controlled by `config.multipv` from the analysis preset:

| Preset | N (multipv / topN) | Search limit |
|--------|-------------------|--------------|
| fast   | 3                 | `timeMs: 3000` |
| deep   | 5                 | `depth: 20` |
| study  | 5                 | unbounded |

### Step 1: GATHERING (parallel) — Goals 1, 2, 4

Two parallel branches. Stockfish finds the top N engine lines while Maia predicts the top N most probable human moves. Both run concurrently since they use separate engine processes. N is the same for both.

**ENGINE branch:**
- Invokes `analyzePosition` actor (Stockfish)
- Uses `multipv: N` from the preset config
- Stores result as `engineResult: { evalCp, evalMate, bestMove, depth, lines[] }`
- Scores normalized to White's perspective (negate when Black to move)

**MAIA branch:**
- Invokes `analyzeMaiaPair` actor
- Runs Maia at floor rating (highest Maia ≤ user rating) and ceiling rating (lowest Maia > user rating)
- Each Maia engine uses `topN: config.multipv` to return the same number of predictions as Stockfish lines
- Stores `maiaFloorResult` and `maiaCeilingResult`, each containing N ranked move predictions with Maia policy scores

### Step 2: EVAL_MAIA_MOVES — Goal 5

A **second Stockfish pass** that runs after both ENGINE and MAIA complete. Its job is to fill in Stockfish evals for any Maia-predicted moves that were NOT already covered by the multipv lines from Step 1.

**Process:**
1. Collect all unique Maia-predicted moves from both floor and ceiling results.
2. For each move, check if it already appears as `pv[0]` in one of the Stockfish multipv `lines[]` (match by UCI move string). If so, use that line's score directly — free, no engine call.
3. For remaining gap moves, run Stockfish with `searchmoves` to evaluate only those specific moves. This is a single `go depth <quick> searchmoves <m1> <m2> ...` call that constrains Stockfish to only consider the gap moves. Much faster than a full search, and batches all gap moves into one engine call.
4. Normalize all scores to White's perspective (same convention as Step 1).

**Why `searchmoves`:** It's standard UCI, lets us batch all gap moves into one engine call, and Stockfish only searches the lines starting with those moves — no wasted compute. The depth can be lower than the main analysis (e.g. depth 12 for a fast preset) since we just need a reasonable eval, not the deepest possible.

**Output:** Each Maia prediction (floor and ceiling) gets an additional `stockfishEval: number | null` field attached.

**New actor:** `evalMaiaMoves` — takes `{ fen, engineResult, maiaFloorResult, maiaCeilingResult, config }`, returns augmented Maia results with Stockfish evals attached.

### State 3: CLASSIFY (sequential) — Goals 3, 6, 7, 8

After EVAL_MAIA_MOVES completes, derive all annotations.

**Inputs available:**
- `prevEngineResult` — engine result from the previous position (passed via `positionInput`)
- `engineResult` — engine result for this position (from GATHERING.ENGINE)
- `augmentedMaiaFloor` / `augmentedMaiaCeiling` — Maia predictions with Stockfish evals (from EVAL_MAIA_MOVES)
- `uciMove` — the move actually played to reach this position
- `color` — which side made this move (`'w'` or `'b'`), determines eval swing sign
- `evalCurve` — running eval curve from previous positions

**Calculations:**

#### Eval Swing (Goal 3)
Computed from the perspective of the side that moved (`node.color`):
```
If White moved:  evalSwing = prevEvalCp - currentEvalCp
If Black moved:  evalSwing = currentEvalCp - prevEvalCp
```
In both cases: **positive = the player who moved made things worse for themselves.**
Null for the root node (no previous eval) or when either eval is mate.

#### Mistake Probability (Goals 6, 7)
For each Maia model (floor and ceiling):
```
For each predicted move with probability p_i and stockfish eval e_i:
  - Classify the move quality: is e_i close to the best eval, or is it a significant loss?
  - Weight by Maia probability: mistakeProb += p_i * (1 if e_i indicates mistake/blunder, 0 otherwise)
```

More precisely, using eval loss thresholds:
```
moveEvalLoss_i = bestEval - stockfishEval_i

goodMoveProb    = Σ p_i  where moveEvalLoss_i < 30cp
inaccuracyProb  = Σ p_i  where 30cp ≤ moveEvalLoss_i < 80cp
mistakeProb     = Σ p_i  where 80cp ≤ moveEvalLoss_i < 200cp
blunderProb     = Σ p_i  where moveEvalLoss_i ≥ 200cp
```

Output for both floor and ceiling models:
```typescript
interface MistakeProbability {
  goodMoveProb: number
  inaccuracyProb: number
  mistakeProb: number
  blunderProb: number
}
```

#### NAG Classification (Goal 8)
Use eval swing + the actual move's relationship to Stockfish best move:
```
If played move === Stockfish best move → isBestMove = true
evalSwing determines NAG: brilliant (!!), good (!), neutral, dubious (?!), mistake (?), blunder (??)
```

The thresholds for NAG classification can incorporate:
- Eval swing magnitude
- Whether the position was critical (via criticality score if available)
- Whether it was a forced move (all alternatives are equally bad)

**New actor:** `classifyPosition` — takes all the above inputs, returns `{ nag, evalSwing, winRateBefore, winRateAfter, winRateLoss, isBestMove, floorMistakeProb, ceilingMistakeProb }`

---

## Updated positionMachine Context

```typescript
interface PositionInput {
  fen: string
  ply: number
  uciMove: string | null
  color: 'w' | 'b' | null       // which side made this move (null for root)
  config: AnalysisModeConfig
  evalCurve: number[]
  prevEngineResult: EngineResult | null
}

interface PositionContext extends PositionInput {
  // From GATHERING.ENGINE (Step 1)
  engineResult: EngineResult | null

  // From GATHERING.MAIA (Step 1)
  maiaFloorResult: MaiaAnalysisResult | null
  maiaCeilingResult: MaiaAnalysisResult | null

  // From EVAL_MAIA_MOVES (Step 2)
  augmentedMaiaFloor: AugmentedMaiaResult | null
  augmentedMaiaCeiling: AugmentedMaiaResult | null

  // From CLASSIFY (Step 3)
  evalSwing: number | null
  nag: NAG | null
  winRateBefore: number | null
  winRateAfter: number | null
  winRateLoss: number | null
  isBestMove: boolean | null
  criticalityScore: number | null
  floorMistakeProb: MistakeProbability | null
  ceilingMistakeProb: MistakeProbability | null
}
```

---

## New Types

```typescript
interface AugmentedHumanMovePrediction extends HumanMovePrediction {
  /** Stockfish eval (cp, White-perspective) for this specific move. Null if eval failed. */
  stockfishEval: number | null
}

interface AugmentedMaiaResult {
  rating: number
  predictions: AugmentedHumanMovePrediction[]
}

interface MistakeProbability {
  /** Probability the player finds a move losing < 30cp */
  goodMoveProb: number
  /** Probability of losing 30-80cp */
  inaccuracyProb: number
  /** Probability of losing 80-200cp */
  mistakeProb: number
  /** Probability of losing ≥ 200cp */
  blunderProb: number
}
```

---

## AnalysisNode Changes

The persisted `AnalysisNode` needs new optional fields:

```typescript
interface AnalysisNode {
  // ... existing fields ...

  /** Eval swing from the previous position (cp). Positive = player lost eval. */
  evalSwing?: number

  /** Augmented Maia floor predictions with Stockfish evals per move. */
  augmentedMaiaFloor?: AugmentedMaiaResult

  /** Augmented Maia ceiling predictions with Stockfish evals per move. */
  augmentedMaiaCeiling?: AugmentedMaiaResult

  /** Probability distribution of move quality at floor rating. */
  floorMistakeProb?: MistakeProbability

  /** Probability distribution of move quality at ceiling rating. */
  ceilingMistakeProb?: MistakeProbability
}
```

---

## PipelineCoordinator Changes

Minimal changes needed in `PipelineCoordinator.run()`:

1. **New actor to provide:** `evalMaiaMoves` — needs access to `analysisService` (Stockfish) for quick evals of non-overlapping Maia moves.
2. **New actor to provide:** `classifyPosition` — pure computation, no engine access needed.
3. **Updated `concretePositionMachine`:** Wire the two new actors via `.provide()` alongside the existing `analyzePosition` and `analyzeMaiaPair`.
4. **Updated `setNodeResult`:** Persist the new fields (`evalSwing`, `augmentedMaiaFloor`, `augmentedMaiaCeiling`, `floorMistakeProb`, `ceilingMistakeProb`).
5. **Preset update:** Update `ANALYSIS_PRESETS` — fast gets `multipv: 3`, deep and study get `multipv: 5`.

---

## Implementation Plan

### Phase 1: Types & Presets

Update the foundational types and configuration before touching any machine or service code.

**File: `src/services/engine/types.ts`**
- Add `searchmoves?: string[]` to `AnalysisOptions`

**File: `src/database/analysis/types.ts`**
- Add new types: `AugmentedHumanMovePrediction`, `AugmentedMaiaResult`, `MistakeProbability`
- Add new optional fields to `AnalysisNode`: `evalSwing`, `augmentedMaiaFloor`, `augmentedMaiaCeiling`, `floorMistakeProb`, `ceilingMistakeProb`
- Update `ANALYSIS_PRESETS`:
  ```
  fast:  { multipv: 3, timeMs: 3000 }
  deep:  { multipv: 5, depth: 20 }
  study: { multipv: 5 }
  ```

### Phase 2: `searchmoves` Support in UCIEngine

**File: `src/services/engine/UCIEngine.ts`**
- Update `buildGoCommand()` to append `searchmoves <m1> <m2> ...` when `options.searchmoves` is provided
- This is a one-line change in the command builder — `searchmoves` goes at the end of the `go` command per UCI spec

### Phase 3: EvalMaiaMovesService

New service that cross-references Maia predictions with Stockfish lines and fills gaps.

**New file: `src/services/analysis/EvalMaiaMovesService.ts`**

Input: `{ fen, engineResult, maiaFloorResult, maiaCeilingResult, config }`
Output: `{ augmentedFloor: AugmentedMaiaResult, augmentedCeiling: AugmentedMaiaResult }`

Logic:
1. Build a map from Stockfish lines: `pv[0]` → score (from `engineResult.lines[]`)
2. Collect all unique UCI moves from floor + ceiling Maia predictions
3. Partition into `covered` (in Stockfish map) and `gap` (not in map)
4. For covered moves: attach the Stockfish line's eval directly
5. For gap moves: run a single `analysisService.analyzePosition(fen, { searchmoves: gapMoves, multipv: gapMoves.length, depth: quickDepth })` call
6. Map the returned lines back to gap moves via `pv[0]`
7. Normalize all scores to White's perspective
8. Return augmented floor and ceiling results

Needs: access to `AnalysisService` (Stockfish engine), passed in via constructor or method param.

### Phase 4: MoveClassificationService

New service that computes eval swing, NAG, and mistake probabilities. Replaces the stubs in `CriticalityService` and `NAGClassificationService`.

**New file: `src/services/analysis/MoveClassificationService.ts`**

Input:
```typescript
{
  prevEngineResult: EngineResult | null
  engineResult: EngineResult
  augmentedMaiaFloor: AugmentedMaiaResult
  augmentedMaiaCeiling: AugmentedMaiaResult
  uciMove: string | null
  color: 'w' | 'b' | null
}
```

Output:
```typescript
{
  evalSwing: number | null
  nag: NAG
  winRateBefore: number
  winRateAfter: number
  winRateLoss: number
  isBestMove: boolean
  criticalityScore: number
  floorMistakeProb: MistakeProbability
  ceilingMistakeProb: MistakeProbability
}
```

Logic:
1. **Eval swing**: use `prevEngineResult.evalCp` and `engineResult.evalCp`, flip sign based on `color`
2. **isBestMove**: compare `uciMove` to `engineResult.bestMove`
3. **Win rate**: convert cp to win probability using the standard logistic formula: `winRate = 1 / (1 + 10^(-cp / 400))`
4. **NAG**: classify based on `evalSwing` thresholds (same thresholds as current chess.com / lichess conventions)
5. **Mistake probability**: for each Maia model, iterate predictions, compute `moveEvalLoss = bestEval - prediction.stockfishEval`, bucket by threshold, weight by Maia probability (using `prediction.score` as the probability weight)

### Phase 5: Update positionMachine

**File: `src/services/analysis/machines/positionMachine.ts`**

- Add `color` to `PositionInput`
- Add new context fields: `augmentedMaiaFloor`, `augmentedMaiaCeiling`, `evalSwing`, `floorMistakeProb`, `ceilingMistakeProb`
- Add new output fields to `PositionOutput`
- Rename `ANALYZING` state to `GATHERING`
- Add two new stub actors in `setup()`: `evalMaiaMoves` and `classifyPosition`
- Add `EVAL_MAIA_MOVES` state after `GATHERING` completes:
  - Invokes `evalMaiaMoves` actor with `{ fen, engineResult, maiaFloorResult, maiaCeilingResult, config }`
  - On done: assign `augmentedMaiaFloor` and `augmentedMaiaCeiling` from output, transition to `CLASSIFY`
- Add `CLASSIFY` state after `EVAL_MAIA_MOVES`:
  - Invokes `classifyPosition` actor with all accumulated context
  - On done: assign `evalSwing`, `nag`, `winRateBefore`, `winRateAfter`, `winRateLoss`, `isBestMove`, `criticalityScore`, `floorMistakeProb`, `ceilingMistakeProb`, transition to `COMPLETE`
- Update `GATHERING.onDone` to target `EVAL_MAIA_MOVES` instead of `COMPLETE`

### Phase 6: Update PipelineCoordinator

**File: `src/services/analysis/PipelineCoordinator.ts`**

- Instantiate `EvalMaiaMovesService` in `run()` (needs `analysisService`)
- Instantiate `MoveClassificationService` in `run()`
- Provide the two new actors in `concretePositionMachine.provide()`:
  - `evalMaiaMoves`: calls `evalMaiaMovesService.evaluate(...)`, normalizes scores
  - `classifyPosition`: calls `moveClassificationService.classify(...)`
- Update `analyzeMaiaPair` actor to use `config.multipv` as `topN` instead of hardcoded `5`
- Pass `node.color` into the `PositionInput` alongside `fen`, `ply`, `uciMove`

**File: `src/services/analysis/machines/gameMachine.ts`**

- Update `PROCESSING_POSITION` input builder to include `color: node.color ?? null`
- Update `setNodeResult()` to persist the new fields from `PositionOutput`

### Phase 7: Cleanup

- Delete or deprecate `CriticalityService.ts` (stub) — logic now lives in `MoveClassificationService`
- Delete or deprecate `NAGClassificationService.ts` (stub) — logic now lives in `MoveClassificationService`
- Delete or deprecate `PositionAnalyzer.ts` — was an alternate path, fully superseded by the updated pipeline
- Bump `SCHEMA_VERSION` in `PipelineCoordinator.ts` so existing analysis records re-run with the new pipeline
