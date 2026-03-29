---
name: update-faq-docs
description: >-
  Checks and updates in-app FAQ documentation pages when analysis feature logic
  changes. Use when modifying move classification, accuracy calculation,
  positional feature evaluation, or radar chart aggregation code.
---

# Update FAQ Documentation Pages

When you modify any of the source files listed below, read the corresponding FAQ page and verify that the prose still accurately describes the current behavior. If the behavior changed, update the FAQ page to match.

## Page Structure

Every FAQ page has exactly two sections:

1. **How It Works Today** — describes only what is currently implemented and visible in the app. Must be accurate to the code as it exists after your changes.
2. **What's Coming Next** — describes planned or future enhancements. When you implement a feature that was previously listed here, move its description into "How It Works Today" and remove it from "What's Coming Next."

## Source File → FAQ Page Mapping

### Move Classifications

**FAQ page**: `src/renderer/faq/pages/NagClassificationPage.vue`

**Source files**:
- `src/services/engine/analysis/NAGService.ts` — standalone NAG classification
- `src/services/analysis/MoveClassificationService.ts` — in-pipeline NAG classification and EPL thresholds
- `src/services/engine/types.ts` — NAG enum and symbols
- `src/utils/chess/nag.ts` — NAG display names and colors

**What to check**: NAG enum values, EPL thresholds, classification priority order, best-move logic, book-move handling, any new special classifications (Brilliant, Great, Interesting, Miss).

### Accuracy

**FAQ page**: `src/renderer/faq/pages/AccuracyPage.vue`

**Source files**:
- `src/services/analysis/MoveClassificationService.ts` — `moveAccuracyFromEPL` formula and `expectedPointsFromWDL`
- `src/services/analysis/machines/gameMachine.ts` — `computePlayerStats` (game accuracy aggregation)
- `src/renderer/analysis/components/ChessPlayerStatsPanel.vue` — accuracy color thresholds

**What to check**: Per-move accuracy curve/formula, game accuracy aggregation method (arithmetic mean vs blend), which moves are included/excluded, color thresholds for the accuracy bar.

### Positional Features

**FAQ page**: `src/renderer/faq/pages/PositionalFeaturesPage.vue`

**Source files**:
- `src/services/analysis/StockfishClassicEvalService.ts` — eval parsing and feature extraction
- `src/services/analysis/PositionalFeaturesService.ts` — feature computation orchestration
- `src/services/analysis/featureAttribution.ts` — radar aggregation, eval-delta gating, WDL volatility
- `src/services/analysis/machines/positionMachine.ts` — feature computation in analysis pipeline
- `src/renderer/analysis/composables/useGameSummaryRadar.ts` — radar chart data transformation
- `src/database/analysis/types.ts` — `PositionalFeatures`, `EvalTerm`, `RadarAxisValue`, `PositionalRadarData`

**What to check**: List of eval components, radar axes, aggregation method, noise reduction mechanisms (eval-delta gating, volatility weighting), normalization, any new per-move attribution logic.

## Workflow

1. After making your code changes, read the relevant FAQ page(s) from the mapping above.
2. Compare the prose against the updated code. Pay attention to thresholds, formulas, and behavioral descriptions.
3. If anything is inaccurate, update the FAQ page. Keep the language non-technical — these pages are written for chess players, not developers.
4. If you implemented a feature that was in "What's Coming Next," move it to "How It Works Today."
