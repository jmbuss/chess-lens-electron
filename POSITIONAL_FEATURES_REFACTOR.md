# Positional Features Refactor

## Goal

Add a new `evalraw` data source to the analysis pipeline, capturing the raw inputs to Stockfish Classic's evaluation function. Use these fine-grained features as the sole vector for position similarity search (dropping the structural bitboard vector table), and store them as individual queryable columns.

The existing `eval` data (aggregated term scores for the radar chart) is kept as-is — `eval` and `evalraw` are complementary views of the same evaluation, not replacements for each other.

## Two Commands, Two Concepts

Stockfish Classic's evaluation function takes raw positional inputs (piece counts, mobility squares, king danger components, etc.), applies piece-square-table weights, blends between middlegame and endgame coefficients based on game phase, then differences between White and Black to produce per-term centipawn scores. The two commands tap into different stages of this pipeline:

- **`eval`** — Runs the full evaluation in trace mode and outputs the **results**: aggregated, weighted, phase-blended centipawn scores per category (Material, Mobility, King Safety, etc.), split by White/Black/Total with mg/eg components. These are the evaluation function's **outputs**.

- **`evalraw`** — Taps into the same evaluation machinery but captures the **inputs**: raw counts, flags, and intermediate values *before* they get multiplied by weights, blended between middlegame and endgame, or differenced between sides. These are the evaluation function's **ingredients**.

They serve different purposes:

| | `eval` (outputs) | `evalraw` (inputs) |
|---|---|---|
| **Shape** | 13 terms × (white mg/eg, black mg/eg, total mg/eg) | 131 flat integer values |
| **Values** | Weighted centipawn scores | Raw counts, flags, indices |
| **Per-side** | White contribution vs Black contribution (differenced) | Independent per-side values (`_w` / `_b` suffixes) |
| **Phase** | Separate mg and eg components | Pre-blending; phase itself is one of the features |
| **Good for** | Radar chart (which axis is this player strong on?) | Similarity search, SQL queries, position fingerprinting |

## Current State

### Data Flow

```
stockfish-classic `eval` command
  → StockfishClassicEvalService.parseEvalOutput()
  → PositionalFeatures (13 EvalTerms + finalEvaluation)
  → stored in position_analysis.result_json (JSON blob)
  → consumed by:
      1. featureAttribution.ts → radar chart (6 axes from eval terms)
      2. VectorBuilder.buildPositionalVector() → 33-dim positional_vectors
      3. VectorBuilder.buildStructuralVector() → 768-dim structural_vectors (from FEN)
      4. ChessPositionalRadar.vue (orphaned per-position radar)
```

### Problems

- The 33-dim positional vector is derived from eval *outputs* (aggregated term scores) — positions with very different character can collapse to similar vectors because the weights/blending obscure the underlying structure.
- The 768-dim structural vector (pure bitboard) captures piece placement but not positional meaning, and hasn't worked well in practice.
- No raw positional data is stored as individual columns, so features can't be filtered or queried with SQL.
- There's no way to answer questions like "find positions where White has 2 passed pawns and a trapped rook" without parsing JSON blobs.

---

## `evalraw` Command Details

The custom stockfish-classic binary outputs `key=value` pairs — one per line, terminated after `final_eval`.

### Feature Categories

**Per-color features** (suffixed `_w` and `_b`, 60 features × 2 sides = 120 values):

| Category | Features |
|----------|----------|
| Material counts | `pawn_count`, `knight_count`, `bishop_count`, `rook_count`, `queen_count` |
| Pawn structure | `passed_pawns`, `isolated_pawns`, `doubled_pawns`, `backward_pawns`, `connected_pawns`, `supported_pawns`, `phalanx_pawns`, `blocked_pawns` |
| Mobility | `knight_mobility`, `bishop_mobility`, `rook_mobility`, `queen_mobility` |
| Piece placement | `knight_outpost`, `bishop_outpost`, `reachable_outpost`, `bad_outpost`, `bishop_long_diagonal`, `bishop_pair`, `bishop_pawns_same_color`, `bishop_xray_pawns`, `minor_behind_pawn`, `rook_on_open_file`, `rook_on_semiopen_file`, `rook_on_queen_file`, `rook_on_king_ring`, `bishop_on_king_ring`, `trapped_rook`, `weak_queen`, `queen_infiltration` |
| King safety | `king_attackers_count`, `king_attackers_weight`, `king_attacks_count`, `king_danger`, `king_flank_attack`, `king_flank_defense`, `unsafe_checks`, `king_ring_weak`, `blockers_for_king`, `king_pawnless_flank` |
| Threats | `weak_pieces`, `hanging_pieces`, `restricted_pieces`, `threat_by_safe_pawn`, `threat_by_pawn_push`, `threat_by_king`, `knight_on_queen`, `slider_on_queen`, `weak_queen_protection` |
| Passed pawns | `passed_pawn_best_rank`, `free_passed_pawns` |
| Space | `space_count` |
| Castling / material | `can_castle_kingside`, `can_castle_queenside`, `non_pawn_material` |

**Global features** (11 values):

| Feature | Range | Description |
|---------|-------|-------------|
| `phase` | 0–128 | 0 = endgame, 128 = full material |
| `complexity` | ~-200 to ~300 | Position complexity score |
| `scale_factor` | 0–128 | Draw scaling (64 = normal) |
| `outflanking` | -7 to +7 | King file/rank distance advantage |
| `pawns_on_both_flanks` | 0–1 | Binary |
| `almost_unwinnable` | 0–1 | Binary |
| `infiltration` | 0–1 | Binary: king past rank 4/5 |
| `opposite_bishops` | 0–1 | Binary |
| `side_to_move` | 0–1 | 0 = White, 1 = Black |
| `rule50_count` | 0–100 | Half-move clock |
| `final_eval` | ~-3000 to +3000 | Final eval in centipawns |

**Total**: 120 per-color + 11 global = **131 raw features**.

### Example Output

```
position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
evalraw
pawn_count_w=8
knight_count_w=2
...
non_pawn_material_b=8302
phase=128
complexity=40
...
final_eval=13
```

---

## Normalization Strategy

All raw integer values are normalized to `[0, 1]` for vector storage. Features with negative ranges use a `shift` before dividing by `max`.

```
normalized = (raw + shift) / max
```

Where `shift` defaults to `0` for features that are already non-negative.

See the normalization maps below for per-color and global features. These are derived from Stockfish source limits and practical maxima.

<details>
<summary>Per-color normalization map</summary>

```typescript
const PER_COLOR_NORMALIZATION: Record<string, { max: number; shift?: number }> = {
  pawn_count:              { max: 8 },
  knight_count:            { max: 2 },
  bishop_count:            { max: 2 },
  rook_count:              { max: 2 },
  queen_count:             { max: 1 },
  passed_pawns:            { max: 8 },
  isolated_pawns:          { max: 8 },
  doubled_pawns:           { max: 7 },
  backward_pawns:          { max: 8 },
  connected_pawns:         { max: 8 },
  supported_pawns:         { max: 8 },
  phalanx_pawns:           { max: 8 },
  blocked_pawns:           { max: 8 },
  knight_mobility:         { max: 16 },
  bishop_mobility:         { max: 26 },
  rook_mobility:           { max: 28 },
  queen_mobility:          { max: 27 },
  knight_outpost:          { max: 2 },
  bishop_outpost:          { max: 2 },
  reachable_outpost:       { max: 2 },
  bad_outpost:             { max: 2 },
  bishop_long_diagonal:    { max: 2 },
  bishop_pair:             { max: 1 },
  bishop_pawns_same_color: { max: 16 },
  bishop_xray_pawns:       { max: 12 },
  minor_behind_pawn:       { max: 4 },
  rook_on_open_file:       { max: 2 },
  rook_on_semiopen_file:   { max: 2 },
  rook_on_queen_file:      { max: 2 },
  rook_on_king_ring:       { max: 2 },
  bishop_on_king_ring:     { max: 2 },
  trapped_rook:            { max: 2 },
  weak_queen:              { max: 1 },
  queen_infiltration:      { max: 1 },
  king_attackers_count:    { max: 7 },
  king_attackers_weight:   { max: 350 },
  king_attacks_count:      { max: 20 },
  king_danger:             { max: 3000, shift: 1000 },
  king_flank_attack:       { max: 30 },
  king_flank_defense:      { max: 30 },
  unsafe_checks:           { max: 8 },
  king_ring_weak:          { max: 8 },
  blockers_for_king:       { max: 6 },
  king_pawnless_flank:     { max: 1 },
  weak_pieces:             { max: 10 },
  hanging_pieces:          { max: 6 },
  restricted_pieces:       { max: 12 },
  threat_by_safe_pawn:     { max: 8 },
  threat_by_pawn_push:     { max: 8 },
  threat_by_king:          { max: 1 },
  knight_on_queen:         { max: 4 },
  slider_on_queen:         { max: 4 },
  weak_queen_protection:   { max: 6 },
  passed_pawn_best_rank:   { max: 7 },
  free_passed_pawns:       { max: 8 },
  space_count:             { max: 24 },
  can_castle_kingside:     { max: 1 },
  can_castle_queenside:    { max: 1 },
  non_pawn_material:       { max: 8302 },
}
```

</details>

<details>
<summary>Global normalization map</summary>

```typescript
const GLOBAL_NORMALIZATION: Record<string, { max: number; shift?: number }> = {
  phase:                { max: 128 },
  complexity:           { max: 500, shift: 200 },
  scale_factor:         { max: 128 },
  outflanking:          { max: 14, shift: 7 },
  pawns_on_both_flanks: { max: 1 },
  almost_unwinnable:    { max: 1 },
  infiltration:         { max: 1 },
  opposite_bishops:     { max: 1 },
  side_to_move:         { max: 1 },
  rule50_count:         { max: 100 },
  final_eval:           { max: 6000, shift: 3000 },
}
```

</details>

---

## Refactor Plan

### Phase 1: Parse `evalraw` output

**Files to change:**

- `src/services/analysis/StockfishClassicEvalService.ts`

**What:**

Add a new method `evalRawPosition(fen)` alongside the existing `evalPosition(fen)`. The new method sends `evalraw` instead of `eval` and parses the `key=value` line format. Terminate capture on `final_eval=...` (the last line of evalraw output).

Return a new `EvalRawFeatures` type — a flat `Record<string, number>` of all 131 features keyed by their exact output names (`pawn_count_w`, `king_danger_b`, `phase`, etc.).

**Notes:**
- Reuse the existing serialization queue (`evalQueue` pattern) to prevent interleaving.
- `evalPosition` (the `eval` command) stays unchanged — it captures evaluation outputs for the radar chart. `evalRawPosition` captures evaluation inputs for indexing and queries. Both go through the same stockfish-classic process.

---

### Phase 2: New types and database storage

**Files to change:**

- `src/database/analysis/types.ts` — add `EvalRawFeatures` type
- `src/database/analysis-queue/PositionAnalysisModel.ts` — add individual columns for both eval and evalraw

**What:**

Add `EvalRawFeatures` as a flat interface with all 131 fields typed as `number`. This is additive alongside the existing `PositionalFeatures`.

Flatten **both** data sources into individual queryable columns on `position_analysis`:

**evalraw columns (131):** Column names match the evalraw output keys exactly (e.g. `pawn_count_w INTEGER`, `king_danger_b INTEGER`, `phase INTEGER`).

**eval columns (79):** One column per eval term × side × component, following a consistent naming pattern:

| Pattern | Example | Count |
|---|---|---|
| `eval_{term}_{side}_{phase}` | `eval_mobility_white_mg`, `eval_kingsafety_black_eg` | 13 terms × 2 sides × 2 phases = 52 |
| `eval_{term}_total_{phase}` | `eval_material_total_mg`, `eval_passed_total_eg` | 13 terms × 2 phases = 26 |
| `eval_final` | `eval_final` | 1 |

**Total: 210 new columns** (131 evalraw + 79 eval). Since this is pre-production, the database can simply be dropped and recreated — no migration needed.

The `PositionalFeatures` type stays as the in-memory representation used by `featureAttribution.ts` for the radar chart. The flattened eval columns are the persistence format for SQL queryability. Hydrating `PositionalFeatures` from individual columns (instead of `result_json`) is a straightforward mapping.

---

### Phase 3: Wire into the analysis pipeline

**Files to change:**

- `src/services/analysis/PositionalFeaturesService.ts` — add `computeBoth(fen)` method (serial eval → evalraw)
- `src/services/analysis/machines/positionMachine.ts` — add `evalRawFeatures` to context/output
- `src/services/analysis/GameCoordinator.ts` — call `computeBoth` in the `computePositionalData` actor

**What:**

The `computePositionalData` actor currently runs phase classification and `eval` features in parallel. `eval` and `evalraw` are both commands on the same stockfish-classic child process — they **cannot** run in parallel. They must be called in serial:

```typescript
const [phase, { features, rawFeatures }] = await Promise.all([
  phaseService.classifyPosition(fen, ply),
  featuresService.computeBoth(fen),      // eval then evalraw, serial on one process
])
return { phase, features, rawFeatures }
```

`computeBoth(fen)` sends `eval` first, parses the result, then sends `evalraw` and parses that — two sequential commands on the single stockfish-classic process. Phase classification runs on a different service (`PhaseClassificationService`) and can genuinely overlap.

This is fine performance-wise — each command completes in <10ms, so the serial pair adds ~20ms total, which runs concurrently with phase classification and the main Stockfish/Maia analysis in the other parallel states of the position machine.

Add `evalRawFeatures: EvalRawFeatures | null` to:
- `PositionContext` (machine context)
- `PositionOutput` (machine output)
- `PositionAnalysis` type

Update `GameCoordinator.writePositionToCache()` to persist both sets of individual columns (eval + evalraw) instead of (or alongside) the `result_json` blob.

---

### Phase 4: Replace positional vector with evalraw vector

**Files to change:**

- `src/services/analysis/vectors/VectorBuilder.ts` — rewrite `buildPositionalVector`
- `src/database/vectors/VectorModel.ts` — update `POSITIONAL_VECTOR_DIM`, drop `structural_vectors`
- `src/database/vectors/types.ts` — remove structural vector types
- `src/services/analysis/vectors/PositionIndexer.ts` — remove structural vector insertion
- `src/api/positions/handlers/findSimilar.ts` — remove `structural` and `combined` modes

**What:**

Rewrite `buildPositionalVector` to produce a **79-dim** normalized vector from a curated subset of evalraw features. Not all 131 stored features are useful for similarity — highly derived values (e.g. `king_danger`, `non_pawn_material`) and noisy/binary flags (e.g. `rule50_count`, `almost_unwinnable`) are excluded from the vector while remaining queryable as columns.

**Vector feature set (79 dimensions):**

| Category | Features (per color) | Dims |
|---|---|---|
| Pawn Structure | `passed_pawns`, `isolated_pawns`, `doubled_pawns`, `backward_pawns`, `connected_pawns`, `supported_pawns`, `phalanx_pawns`, `blocked_pawns`, `passed_pawn_best_rank`, `free_passed_pawns` | 10 × 2 = 20 |
| Mobility | `knight_mobility`, `bishop_mobility`, `rook_mobility`, `queen_mobility` | 4 × 2 = 8 |
| Piece Placement | `knight_outpost`, `bishop_pair`, `bishop_pawns_same_color`, `bishop_long_diagonal`, `rook_on_open_file`, `rook_on_semiopen_file`, `rook_on_king_ring` | 7 × 2 = 14 |
| King Safety | `king_attackers_count`, `king_attacks_count`, `king_flank_attack`, `king_flank_defense`, `king_pawnless_flank` | 5 × 2 = 10 |
| Threats | `weak_pieces`, `hanging_pieces`, `restricted_pieces` | 3 × 2 = 6 |
| Space | `space_count` | 1 × 2 = 2 |
| Material | `pawn_count`, `knight_count`, `bishop_count`, `rook_count`, `queen_count` | 5 × 2 = 10 |
| Global | `phase`, `opposite_bishops`, `pawns_on_both_flanks`, `scale_factor`, `side_to_move` | 5 |
| | | **Total: 79** |

**Excluded from vector** (still stored as columns, queryable via SQL):
- Piece placement details: `bishop_outpost`, `reachable_outpost`, `bad_outpost`, `bishop_xray_pawns`, `minor_behind_pawn`, `rook_on_queen_file`, `bishop_on_king_ring`, `trapped_rook`, `weak_queen`, `queen_infiltration`
- King safety composites: `king_attackers_weight`, `king_danger`, `unsafe_checks`, `king_ring_weak`, `blockers_for_king`
- Threat details: `threat_by_safe_pawn`, `threat_by_pawn_push`, `threat_by_king`, `knight_on_queen`, `slider_on_queen`, `weak_queen_protection`
- Castling / material metadata: `can_castle_kingside`, `can_castle_queenside`, `non_pawn_material`
- Global noise: `complexity`, `outflanking`, `almost_unwinnable`, `infiltration`, `rule50_count`, `final_eval`

Before indexing, apply the **Normalization Strategy** maps (per-color / global, including `shift` where defined) to each included raw feature, then pack the resulting floats into a **`Float32Array`** for `vec_f32` insertion. Do not insert unnormalized integer evalraw values into the vector — distance in sqlite-vec assumes comparable scales across dimensions.

Update `POSITIONAL_VECTOR_DIM` from `33` to `79`. This triggers `VectorModel.ensureVecTable` to rebuild the vec0 virtual table (bump `VEC_SCHEMA_VERSION` to `3`).

Drop `structural_vectors` table entirely:
- Remove `ensureVecTable(db, 'structural_vectors', ...)` call
- Remove `insertStructuralBatch`, `deleteByPositionIndexIds` structural branch, `knnStructural`, `knnCombined`
- Remove `buildStructuralVector` from `VectorBuilder.ts`
- Remove `SimilarityMode` options for `structural` and `combined` in the API and renderer

The `PositionIndexer` simplifies: only build and insert positional vectors (from evalraw), no structural vectors.

---

### Phase 5: Radar chart — no changes needed

**Files affected:** None (or minor).

The radar chart continues to use `eval` data (`PositionalFeatures`), which is the correct data source for it. The radar axes represent "how much did each evaluation category contribute to the position assessment?" — that's exactly what eval outputs measure (aggregated, weighted, phase-blended centipawn contributions per term).

The evalraw inputs (raw counts and flags) are the wrong abstraction for the radar — knowing a player has 4 knight mobility squares doesn't tell you how much that *mattered* to the evaluation. The eval output's `mobility.white.mg = 0.42` does.

`featureAttribution.ts` stays as-is: eval-delta gating, WDL volatility weighting, and `blendMgEg` phase interpolation all remain correct for the eval term data they operate on.

**Future opportunity:** The evalraw data could power a *different* visualization — e.g. a detailed per-position breakdown showing raw counts alongside their weighted contributions. But that's additive, not a replacement for the current radar.

---

### Phase 6: Frontend and API updates

**Files to change:**

- `src/renderer/analysis/composables/useSimilarPositions.ts` — remove `structural`/`combined` modes
- `src/renderer/faq/pages/PositionalFeaturesPage.vue` — document the new evalraw features

**What:**

- Remove `structural` and `combined` from `SimilarityMode` in the frontend — the only similarity mode is now `positional` (backed by the 131-dim evalraw vector).
- The game summary radar (`ChessGameSummaryRadar.vue`) doesn't need changes — it still receives `PositionalRadarData` from eval data, same shape.
- Update the FAQ page to explain the two data sources: eval outputs (what the radar shows) and evalraw inputs (what powers similarity search and position queries).

---

### Phase 7: Drop and recreate database

**What:**

This is pre-production — no user data to migrate. Drop the database and let the schema rebuild from scratch on next startup. All `position_analysis` rows, vector tables, and game analysis queue entries are recreated cleanly with the new column layout.

Bump `VEC_SCHEMA_VERSION` to `3` so the vec0 virtual tables also rebuild with the new 131-dim positional vectors (no structural table).

---

## Implementation Order

```
Phase 1  Parse evalraw ──────────────────────────────► unit-testable in isolation
Phase 2  Types + DB columns (eval + evalraw) ────────► 210 queryable columns, drop and recreate DB
Phase 3  Wire into pipeline ─────────────────────────► both data sources flow through positionMachine
Phase 4  Replace positional vector, drop structural ─► similarity search uses 79-dim curated evalraw vectors
Phase 5  Radar chart ───────────────────────────────► no changes (still uses eval data)
Phase 6  Frontend / API / FAQ ───────────────────────► cleanup UI layer
Phase 7  Drop and recreate database ────────────────► clean slate, no migration
```

Phases 1–3 can ship together as the foundation. Phase 4 is the breaking change for similarity search. Phase 6 is UI cleanup. Phase 7 is trivial (just delete the DB file).

---

## Open Questions

1. **Vector tuning.** The 79-dim vector is a curated starting point. After collecting data, retrieval quality can be measured and the feature set adjusted — adding back excluded features that improve recall, or dropping included ones that add noise. PCA is another option if correlated features (e.g. material counts) dominate distance calculations.

2. **Normalization tuning.** The normalization maps are derived from theoretical Stockfish source limits. In practice, many features cluster in a narrow subrange of their theoretical max (e.g. `king_danger` rarely exceeds 500 even though the theoretical max is ~2000). Empirical normalization from a large game corpus could improve vector quality for similarity search.

3. **`result_json` stays.** The individual columns only cover eval and evalraw positional data. `result_json` still carries everything else in `PositionOutput` that doesn't have its own columns: Stockfish analysis lines, Maia floor/ceiling predictions, augmented Maia results, and best-move evals. Those are complex nested structures (arrays of moves with scores, per-move probabilities, etc.) that don't flatten into columns naturally. `result_json` remains the canonical store for that data; the new columns are additive for the positional features specifically.
