# AnalysisNode Field Reference

When debugging, each node in the analysis tree represents a **position after a move was played**. Its fields answer two different temporal questions — some describe the move that just happened (backward-looking), others describe the position you're now in (forward-looking). Keeping this distinction in mind is the key to reading the debug panel correctly.

---

## The Two Temporal Axes

```
ply N-1 ─────[uciMove]──────► ply N (this node)
               ↑                     ↓
    backward: how good was       forward: what does
    the move that led here?      Maia predict from here?
```

**Backward-looking fields** (describe the move that was just played):
`evalSwing`, `nag`, `isBestMove`, `criticalityScore`, `winRateBefore`, `winRateAfter`, `winRateLoss`

**Forward-looking fields** (describe what's available from this position):
`engineResult`, `maiaFloorResult`, `maiaCeilingResult`, `augmentedMaiaFloor`, `augmentedMaiaCeiling`, `floorMistakeProb`, `ceilingMistakeProb`

---

## Input Fields (set before analysis runs)

| Field | Type | Meaning |
|---|---|---|
| `fen` | `string` | The board position after `uciMove` was played. This is the FEN that Stockfish and Maia analyze. |
| `ply` | `number` | Half-move count from the start. Ply 1 = White's first move. Even = Black just moved. |
| `uciMove` | `string \| null` | The move played to reach this position in UCI format (e.g. `"e2e4"`). Null for the root node. |
| `color` | `'w' \| 'b' \| null` | The color that made `uciMove`. Null for the root node. |

---

## Backward-Looking Fields (about the move that was played)

These fields require `prevEngineResult` and are computed in the `CLASSIFY` step.

### `evalSwing: number | null`

**The centipawn cost of the move that was just played, from the mover's perspective.**

Formula:
- White: `prevNode.engineResult.evalCp - thisNode.engineResult.evalCp`
- Black: `thisNode.engineResult.evalCp - prevNode.engineResult.evalCp`

Positive = the mover made things worse for themselves. Negative = the mover improved their position (relative to what was expected — e.g. a zwischenzug or effective sacrifice).

Examples:
- `0` — best move played, eval unchanged
- `80` — mistake, lost about a pawn
- `-150` — brilliant move, significantly improved the position
- `null` — root node or one of the engine results is missing

> **Gotcha:** `evalSwing` is based on the eval of the *resulting* position, not the eval of each individual candidate. A `+80` evalSwing means you played a move that lands you in a position Stockfish evaluates 80cp worse than the best alternative — not necessarily that you blundered a piece.

---

### `nag: NAG`

**The annotation glyph for the move that was just played.**

| NAG | Symbol | Condition |
|---|---|---|
| `Brilliant` (3) | !! | evalSwing ≤ −150 AND it was the best move |
| `Good` (1) | ! | evalSwing ≤ −50 AND best move, OR any best move with alternatives |
| `Neutral` (0) | — | Normal move, no annotation |
| `Dubious` (6) | ?! | evalSwing ≥ 30 |
| `Mistake` (2) | ? | evalSwing ≥ 80 |
| `Blunder` (4) | ?? | evalSwing ≥ 200 |

> **Gotcha:** A move can be `Neutral` even if evalSwing is nonzero. The dubious threshold starts at 30cp — small inaccuracies below that don't annotate.

---

### `isBestMove: boolean`

True when `uciMove === engineResult.bestMove`. The best move is Stockfish's top choice from the *previous* position, so "best" here means "what Stockfish would have played."

---

### `winRateBefore: number`

Win probability for White (0–1) at the *previous* position, derived from `prevEngineResult.evalCp` via the logistic model `1 / (1 + 10^(-cp/400))`. Value of `0.5` means equal. Defaults to `0.5` if the previous eval is missing.

---

### `winRateAfter: number`

Win probability for White (0–1) at *this* position, derived from `engineResult.evalCp`. This is the win probability *after* the move was played.

---

### `winRateLoss: number`

How much win probability the mover gave away. Always ≥ 0.

- White: `winRateBefore - winRateAfter`
- Black: `winRateAfter - winRateBefore` (eval going up hurts Black)

A loss of `0.1` means the move cost roughly a 10% swing in win probability.

---

### `criticalityScore: number`

**A [0,1] measure of how costly the move just played was.**

Currently: `sigmoid(|evalSwing|)` centered at 100cp. Not yet Maia-aware.

| Score | Meaning |
|---|---|
| < 0.25 | Normal move, low stakes |
| 0.25–0.50 | Mild inaccuracy territory |
| 0.50–0.75 | Significant eval swing |
| > 0.75 | Large swing, high criticality |

> **Design note:** This is backward-looking — it tells you "the move that got you here was critical." It does NOT tell you "you are about to face a critical decision." For the forward-looking version you'd use `floorMistakeProb` combined with the eval delta between best and expected moves from this position.

> **Known limitation:** If you happened to play the best move, criticalityScore ≈ 0 even if the position had a very punishing alternative available. The formula needs `1 - p_good` from Maia to fix this.

---

## Forward-Looking Fields (about the current position)

These fields describe what Stockfish and Maia found FROM this position. They inform what you should do next.

### `engineResult: EngineResult | null`

**Stockfish's analysis of this position (the FEN you're looking at now).**

| Sub-field | Meaning |
|---|---|
| `evalCp` | Centipawn eval of this position from White's perspective. `+200` = White is up roughly 2 pawns. |
| `evalMate` | If non-null, Stockfish found forced mate. Positive = White mates in N, negative = Black mates in N. When set, `evalCp` is typically null. |
| `bestMove` | The top UCI move Stockfish would play from here. |
| `depth` | Search depth achieved. Higher = more reliable. |
| `lines` | Array of `AnalysisLine` — up to `multipv` candidate lines, each with their own `score` and `pv`. |

> **Key distinction:** `engineResult.evalCp` is the eval of *this* position. `evalSwing` compared `prevEngineResult.evalCp` against this value to score the move that was just played. These two values are from different positions.

---

### `maiaFloorResult: MaiaAnalysisResult | null`

**Maia's top predicted moves FROM this position, at the floor rating.**

The floor is the highest Maia model rating ≤ `userRating`. If the user is rated 1450, and the two Maia models are 1300 and 1500, the floor is 1300.

Contains: `{ rating: number, predictions: HumanMovePrediction[] }` where each prediction has a `move`, `score` (policy logit), and `rank`.

These are raw Maia outputs — no Stockfish evals attached yet.

---

### `maiaCeilingResult: MaiaAnalysisResult | null`

Same as `maiaFloorResult` but for the ceiling rating — the lowest Maia model rating > `userRating`. Together, floor and ceiling bracket the user's actual rating for interpolation.

---

### `augmentedMaiaFloor: AugmentedMaiaResult | null`

**The floor Maia predictions, enriched with Stockfish evaluations per move.**

Each prediction now has:
- `stockfishEval: number | null` — cp eval of that specific move (from White's perspective)
- `stockfishScore: UCIScore | null` — raw score including mate scores

Moves already in Stockfish's multiPV lines use those evals directly. Gap moves (Maia predicted but not in Stockfish's top N) got a second targeted Stockfish pass at depth 12 to fill in their evals.

---

### `augmentedMaiaCeiling: AugmentedMaiaResult | null`

Same as `augmentedMaiaFloor` but for the ceiling rating.

---

### `floorMistakeProb: MistakeProbability | null`

**Probability distribution of move quality for a player at the floor rating, FROM this position.**

This is **forward-looking** — it answers: "If someone at floor ELO is sitting in front of this board, what's the probability they play a good move, an inaccuracy, a mistake, or a blunder on their next move?"

Computed by: softmax-normalizing Maia's policy scores → distributing probability mass across quality buckets based on each move's eval loss vs. `engineResult.evalCp` (the best available):

| Field | Threshold | Meaning |
|---|---|---|
| `goodMoveProb` | eval loss < 30cp | Probability of playing a move that barely costs anything |
| `inaccuracyProb` | 30–80cp | Probability of an inaccuracy |
| `mistakeProb` | 80–200cp | Probability of a mistake |
| `blunderProb` | ≥ 200cp | Probability of a blunder |

These four should sum to ~1.0.

> **This is NOT about the move that was just played.** It's about what a player at this ELO is likely to do next. If you want to know how the player already did, use `nag` or `evalSwing`.

---

### `ceilingMistakeProb: MistakeProbability | null`

Same shape as `floorMistakeProb` but computed from ceiling Maia predictions. Compare floor vs. ceiling to see how much skill level matters in this specific position.

---

## Maia Floor vs. Ceiling: How to Interpolate

The user's actual rating sits between floor and ceiling. For a display value, interpolate linearly:

```typescript
const t = (userRating - floorRating) / (ceilingRating - floorRating) // 0..1
const goodMoveProb = floor.goodMoveProb + t * (ceiling.goodMoveProb - floor.goodMoveProb)
```

If `userRating` exactly equals a Maia model rating, floor === ceiling and no interpolation is needed.

---

## Common Debugging Scenarios

**"Why is criticalityScore high but nag is Neutral?"**
evalSwing can be negative (improvement) — criticalityScore uses `|evalSwing|`, so it fires on brilliant moves too. A large negative swing with `isBestMove: true` gives a Brilliant NAG, but criticalityScore will also be high.

**"Why is floorMistakeProb showing high blunderProb on what looks like a safe position?"**
Maia may have predicted moves into the eval loss > 200cp bucket. This means the candidate moves a player at that ELO would consider from this position are objectively bad — the position may look calm but have a hidden trap.

**"Why is evalSwing null on the first move?"**
The root node has no `prevEngineResult`, so evalSwing cannot be computed. All backward-looking fields default to null or 0 on ply 1.

**"engineResult.evalCp is +300 but winRateBefore is 0.5 — how?"**
`winRateBefore` comes from `prevEngineResult`, not `engineResult`. If the previous position had no engine result, it defaults to 0.5 (equal). This means the evalSwing for this node may also be null.

**"floorMistakeProb and ceilingMistakeProb are both null"**
Either Maia analysis failed (check `maiaFloorResult`), or the augmented step failed (check `augmentedMaiaFloor`). The classify step only calls `computeMistakeProbability` when the augmented result is non-null.
