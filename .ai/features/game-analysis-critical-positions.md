# Game Analysis — Critical Positions

## Overview

This feature adds a full game analysis pipeline that:

1. Runs Stockfish over every position in a game and stores the results
2. Extracts a configurable set of position features and builds two vector embeddings per position (positional and structural)
3. Scores each position for "criticality" — how significant that moment was in the game
4. Persists everything in SQLite (including vectors via `sqlite-vec`) so results are reusable
5. Surfaces criticality in the existing Analysis page for tuning, and enables KNN similarity search later

The feature is built in layered phases so each phase is independently usable and testable.

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Vector storage | `sqlite-vec` extension (virtual tables in the existing DB) | Zero extra infrastructure; works with `better-sqlite3` via `loadExtension`; supports float32, L2/cosine KNN |
| Two vectors vs. two DBs | Two virtual tables in the same DB | Allows JOINs across positional + structural data; keeps one DB file |
| Feature extensibility | `FeatureRegistry` with named, togglable, weighted `PositionFeature` objects | Adding/removing a feature is one file + one `registry.register()` call; weights are runtime config |
| Feature debug data | `features_json TEXT` column (JSON blob) | Avoids a schema migration for every feature addition during tuning; promote to columns when stable |
| Criticality algorithm | `CriticalityStrategy` interface with `EvalDeltaStrategy` as the first implementation | Strategy pattern makes it trivial to swap in more sophisticated algorithms later |
| Chess library for extraction | `chess.js` (already used for game tree) | Consistent with existing renderer and service code; sufficient for all planned features |
| Long-running analysis progress | Push channel `analysis:game-progress` (same pattern as `engine:analysis-update`) | Consistent with existing streaming pattern; lets the UI show live progress |
| UI placement | Extend existing Analysis page | Already has board + PGN viewer + eval panel; criticality overlays those naturally for tuning |

---

## Dependency: `sqlite-vec`

Before writing any code, install the extension:

```bash
npm install sqlite-vec
```

`sqlite-vec` ships a pre-built native module that exposes a `load(db)` function. Call it once after opening the database connection:

```typescript
// src/database/db.ts
import * as sqliteVec from 'sqlite-vec'

// Inside DatabaseService constructor, after opening the DB:
sqliteVec.load(this.db)
```

The `load()` call registers the `vec0` virtual table module in the SQLite connection. This must happen before any model tries to create a `vec0` table.

---

## Phase 1 — Feature Extraction Service

**Goal:** A pure TypeScript module (no DB, no IPC) that takes a FEN string, extracts all configured features, and returns weighted normalized vectors. Independently testable.

### File structure

```
src/services/analysis/
├── features/
│   ├── base.ts                  # PositionFeature interface
│   ├── registry.ts              # FeatureRegistry class
│   ├── positional/
│   │   ├── materialBalance.ts
│   │   ├── pieceMobility.ts
│   │   ├── capturesAvailable.ts
│   │   ├── kingSafety.ts
│   │   ├── gamePhase.ts
│   │   ├── pawnStructure.ts
│   │   └── centerControl.ts
│   └── structural/
│       ├── materialCounts.ts
│       └── boardBitstring.ts
├── criticality/
│   ├── base.ts                  # CriticalityStrategy interface
│   ├── scorer.ts                # CriticalityScorer class
│   └── strategies/
│       └── evalDelta.ts         # First implementation
└── index.ts                     # Exports default registry instance
```

---

### `src/services/analysis/features/base.ts`

```typescript
import { Chess } from 'chess.js'

export type FeatureGroup = 'positional' | 'structural'

export interface PositionFeature {
  readonly name: string
  readonly group: FeatureGroup
  /** Default weight when building the vector. 1.0 = normal contribution. */
  readonly defaultWeight: number
  /** Extract the raw (un-normalized) value from the position. */
  extract(chess: Chess): number
  /**
   * Normalize raw value to a consistent range.
   * Positional features: typically [-1, 1] or [0, 1].
   * Structural features: typically [0, 1] or binary {0, 1}.
   */
  normalize(raw: number): number
}
```

---

### `src/services/analysis/features/registry.ts`

```typescript
import { Chess } from 'chess.js'
import type { PositionFeature, FeatureGroup } from './base'

interface RegisteredFeature {
  feature: PositionFeature
  weight: number
  enabled: boolean
}

export interface FeatureDebugEntry {
  name: string
  group: FeatureGroup
  raw: number
  normalized: number
  weight: number
  weighted: number
  enabled: boolean
}

export class FeatureRegistry {
  private features = new Map<string, RegisteredFeature>()

  register(feature: PositionFeature): this {
    this.features.set(feature.name, {
      feature,
      weight: feature.defaultWeight,
      enabled: true,
    })
    return this
  }

  setWeight(name: string, weight: number): this {
    const entry = this.features.get(name)
    if (entry) entry.weight = weight
    return this
  }

  disable(name: string): this {
    const entry = this.features.get(name)
    if (entry) entry.enabled = false
    return this
  }

  enable(name: string): this {
    const entry = this.features.get(name)
    if (entry) entry.enabled = true
    return this
  }

  private getEnabled(group: FeatureGroup): RegisteredFeature[] {
    return Array.from(this.features.values()).filter(
      (e) => e.enabled && e.feature.group === group
    )
  }

  buildVector(chess: Chess, group: FeatureGroup): Float32Array {
    const enabled = this.getEnabled(group)
    const vec = new Float32Array(enabled.length)
    for (let i = 0; i < enabled.length; i++) {
      const { feature, weight } = enabled[i]
      vec[i] = feature.normalize(feature.extract(chess)) * weight
    }
    return vec
  }

  buildPositionalVector(chess: Chess): Float32Array {
    return this.buildVector(chess, 'positional')
  }

  buildStructuralVector(chess: Chess): Float32Array {
    return this.buildVector(chess, 'structural')
  }

  /**
   * Returns a full debug breakdown of all features for a position.
   * Used by the tuning UI to show exactly what contributed to the vectors.
   */
  extractDebugInfo(chess: Chess): FeatureDebugEntry[] {
    return Array.from(this.features.values()).map(({ feature, weight, enabled }) => {
      const raw = feature.extract(chess)
      const normalized = feature.normalize(raw)
      return {
        name: feature.name,
        group: feature.group,
        raw,
        normalized,
        weight,
        weighted: normalized * weight,
        enabled,
      }
    })
  }

  /** Dimension of the positional vector (number of enabled positional features). */
  positionalDimension(): number {
    return this.getEnabled('positional').length
  }

  /** Dimension of the structural vector. */
  structuralDimension(): number {
    return this.getEnabled('structural').length
  }
}
```

---

### Feature implementations

Each feature is a small, self-contained file. Here are the initial set:

**`src/services/analysis/features/positional/materialBalance.ts`**
```typescript
import type { Chess } from 'chess.js'
import type { PositionFeature } from '../base'

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

function materialSum(chess: Chess, color: 'w' | 'b'): number {
  return chess.board().flat().reduce((sum, sq) => {
    if (!sq || sq.color !== color) return sum
    return sum + (PIECE_VALUES[sq.type] ?? 0)
  }, 0)
}

export const materialBalance: PositionFeature = {
  name: 'materialBalance',
  group: 'positional',
  defaultWeight: 1.0,
  extract(chess) {
    return materialSum(chess, 'w') - materialSum(chess, 'b')
  },
  normalize(raw) {
    // Queen advantage (9 cp) → ±1. Clamp to [-1, 1].
    return Math.max(-1, Math.min(1, raw / 9))
  },
}
```

**`src/services/analysis/features/positional/gamePhase.ts`**
```typescript
import type { Chess } from 'chess.js'
import type { PositionFeature } from '../base'

// Max material at game start (excluding kings and pawns): 2Q+4R+4B+4N = 2×9+4×5+4×3+4×3 = 62
const MAX_PHASE_MATERIAL = 62

export const gamePhase: PositionFeature = {
  name: 'gamePhase',
  group: 'positional',
  defaultWeight: 1.0,
  extract(chess) {
    const board = chess.board().flat()
    let material = 0
    for (const sq of board) {
      if (!sq || sq.type === 'k' || sq.type === 'p') continue
      const val = { q: 9, r: 5, b: 3, n: 3 }[sq.type] ?? 0
      material += val
    }
    return material
  },
  normalize(raw) {
    // 0 = full endgame, 1 = opening
    return Math.min(1, raw / MAX_PHASE_MATERIAL)
  },
}
```

**`src/services/analysis/features/positional/pieceMobility.ts`**
```typescript
import type { Chess } from 'chess.js'
import type { PositionFeature } from '../base'

// Reasonable upper bound on legal moves per side
const MAX_MOVES = 50

export const pieceMobility: PositionFeature = {
  name: 'pieceMobility',
  group: 'positional',
  defaultWeight: 1.0,
  extract(chess) {
    // chess.js only gives moves for the side to move.
    // We return that count; callers can call twice if they need both sides.
    return chess.moves().length
  },
  normalize(raw) {
    return Math.min(1, raw / MAX_MOVES)
  },
}
```

**`src/services/analysis/features/positional/capturesAvailable.ts`**
```typescript
import type { Chess } from 'chess.js'
import type { PositionFeature } from '../base'

const MAX_CAPTURES = 20

export const capturesAvailable: PositionFeature = {
  name: 'capturesAvailable',
  group: 'positional',
  defaultWeight: 1.0,
  extract(chess) {
    return chess.moves({ verbose: true }).filter((m) => m.flags.includes('c') || m.flags.includes('e')).length
  },
  normalize(raw) {
    return Math.min(1, raw / MAX_CAPTURES)
  },
}
```

**`src/services/analysis/features/positional/kingSafety.ts`**
```typescript
import type { Chess } from 'chess.js'
import type { PositionFeature } from '../base'

/**
 * Simple king safety heuristic: count pawns within 1 square of the king.
 * Normalized to [0, 1] where 1 = 3 pawn shield (maximum).
 */
export const kingSafety: PositionFeature = {
  name: 'kingSafety',
  group: 'positional',
  defaultWeight: 1.0,
  extract(chess) {
    const board = chess.board()
    const color = chess.turn()
    let kingFile = -1, kingRank = -1
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = board[r][f]
        if (sq?.type === 'k' && sq.color === color) { kingFile = f; kingRank = r }
      }
    }
    if (kingFile === -1) return 0
    let shieldPawns = 0
    for (let dr = -1; dr <= 1; dr++) {
      for (let df = -1; df <= 1; df++) {
        const r = kingRank + dr, f = kingFile + df
        if (r < 0 || r > 7 || f < 0 || f > 7) continue
        const sq = board[r][f]
        if (sq?.type === 'p' && sq.color === color) shieldPawns++
      }
    }
    return shieldPawns
  },
  normalize(raw) {
    return Math.min(1, raw / 3)
  },
}
```

**`src/services/analysis/features/positional/pawnStructure.ts`**
```typescript
import type { Chess } from 'chess.js'
import type { PositionFeature } from '../base'

function getPawnFiles(chess: Chess, color: 'w' | 'b'): number[] {
  return chess.board().flat()
    .filter((sq) => sq?.type === 'p' && sq.color === color)
    .map((sq) => sq!.square.charCodeAt(0) - 'a'.charCodeAt(0))
}

export const isolatedPawns: PositionFeature = {
  name: 'isolatedPawns',
  group: 'positional',
  defaultWeight: 0.8,
  extract(chess) {
    const files = getPawnFiles(chess, chess.turn())
    return files.filter((f) => !files.includes(f - 1) && !files.includes(f + 1)).length
  },
  normalize(raw) {
    return Math.min(1, raw / 4)
  },
}

export const doubledPawns: PositionFeature = {
  name: 'doubledPawns',
  group: 'positional',
  defaultWeight: 0.8,
  extract(chess) {
    const files = getPawnFiles(chess, chess.turn())
    const counts = new Map<number, number>()
    for (const f of files) counts.set(f, (counts.get(f) ?? 0) + 1)
    return Array.from(counts.values()).filter((c) => c > 1).length
  },
  normalize(raw) {
    return Math.min(1, raw / 4)
  },
}
```

**`src/services/analysis/features/positional/centerControl.ts`**
```typescript
import type { Chess } from 'chess.js'
import type { PositionFeature } from '../base'

const CENTER_SQUARES = ['e4', 'd4', 'e5', 'd5'] as const

export const centerControl: PositionFeature = {
  name: 'centerControl',
  group: 'positional',
  defaultWeight: 0.9,
  extract(chess) {
    const color = chess.turn()
    let score = 0
    for (const sq of CENTER_SQUARES) {
      const attackers = chess.attackers(sq, color).length
      const defenders = chess.attackers(sq, color === 'w' ? 'b' : 'w').length
      score += attackers - defenders
    }
    return score
  },
  normalize(raw) {
    // Max theoretical control advantage ≈ ±8
    return Math.max(-1, Math.min(1, raw / 8))
  },
}
```

**`src/services/analysis/features/structural/materialCounts.ts`**

> Note: `materialCounts` produces **multiple** values (one per piece type per color). The simplest approach is one feature per piece type. Register 10 separate instances (P/N/B/R/Q × 2 colors) using a factory:

```typescript
import type { Chess } from 'chess.js'
import type { PositionFeature } from '../base'

type PieceType = 'p' | 'n' | 'b' | 'r' | 'q'
const MAX_COUNTS: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 }

export function makeMaterialCountFeature(
  pieceType: PieceType,
  color: 'w' | 'b'
): PositionFeature {
  return {
    name: `materialCount_${color}_${pieceType}`,
    group: 'structural',
    defaultWeight: 1.0,
    extract(chess: Chess) {
      return chess.board().flat().filter((sq) => sq?.type === pieceType && sq.color === color).length
    },
    normalize(raw) {
      return raw / (MAX_COUNTS[pieceType] ?? 1)
    },
  }
}
```

**`src/services/analysis/features/structural/boardBitstring.ts`**

> The board bitstring is a 64-element binary vector. Each position in the vector corresponds to a board square (a1=0 to h8=63), and the value is 1 if any piece occupies that square, 0 if empty. For structural similarity ("same piece configuration"), this is the most expressive structural feature. Register it as 64 separate binary features, or as a single feature that returns a pre-encoded float:

```typescript
import type { Chess } from 'chess.js'
import type { PositionFeature } from '../base'

/** One feature per square: 1.0 if occupied, 0.0 if empty. */
export function makeBoardSquareFeature(squareIndex: number): PositionFeature {
  const file = String.fromCharCode('a'.charCodeAt(0) + (squareIndex % 8))
  const rank = Math.floor(squareIndex / 8) + 1
  const square = `${file}${rank}`
  return {
    name: `board_${square}`,
    group: 'structural',
    defaultWeight: 1.0,
    extract(chess: Chess) {
      return chess.get(square as any) ? 1 : 0
    },
    normalize(raw) {
      return raw
    },
  }
}
```

---

### `src/services/analysis/index.ts` — Default Registry

```typescript
import { FeatureRegistry } from './features/registry'
import { materialBalance } from './features/positional/materialBalance'
import { pieceMobility } from './features/positional/pieceMobility'
import { capturesAvailable } from './features/positional/capturesAvailable'
import { kingSafety } from './features/positional/kingSafety'
import { gamePhase } from './features/positional/gamePhase'
import { isolatedPawns, doubledPawns } from './features/positional/pawnStructure'
import { centerControl } from './features/positional/centerControl'
import { makeMaterialCountFeature } from './features/structural/materialCounts'
import { makeBoardSquareFeature } from './features/structural/boardBitstring'

export const featureRegistry = new FeatureRegistry()

// Positional features
featureRegistry
  .register(materialBalance)
  .register(pieceMobility)
  .register(capturesAvailable)
  .register(kingSafety)
  .register(gamePhase)
  .register(isolatedPawns)
  .register(doubledPawns)
  .register(centerControl)

// Structural: material counts (10 features: 5 piece types × 2 colors)
for (const color of ['w', 'b'] as const) {
  for (const piece of ['p', 'n', 'b', 'r', 'q'] as const) {
    featureRegistry.register(makeMaterialCountFeature(piece, color))
  }
}

// Structural: board bitstring (64 features)
for (let i = 0; i < 64; i++) {
  featureRegistry.register(makeBoardSquareFeature(i))
}

export { FeatureRegistry } from './features/registry'
export type { PositionFeature, FeatureGroup } from './features/base'
```

---

## Phase 2 — Criticality Scoring

### `src/services/analysis/criticality/base.ts`

```typescript
export interface PositionSnapshot {
  evalCp: number | null    // centipawns (null if mate)
  evalMate: number | null  // moves to mate (null if cp)
  depth: number
}

export interface CriticalityStrategy {
  readonly name: string
  /**
   * Returns a criticality score in [0, 1].
   * 0 = completely normal position transition.
   * 1 = maximally critical (e.g. game-ending blunder).
   */
  score(before: PositionSnapshot, after: PositionSnapshot): number
}
```

### `src/services/analysis/criticality/strategies/evalDelta.ts`

```typescript
import type { CriticalityStrategy, PositionSnapshot } from '../base'

const MATE_CP_EQUIVALENT = 3000 // treat mate as this many centipawns

function toCp(snap: PositionSnapshot): number {
  if (snap.evalMate !== null) {
    return snap.evalMate > 0 ? MATE_CP_EQUIVALENT : -MATE_CP_EQUIVALENT
  }
  return snap.evalCp ?? 0
}

function sigmoid(x: number, scale: number): number {
  return 1 / (1 + Math.exp(-x / scale))
}

export interface EvalDeltaOptions {
  /** Centipawn delta that maps to a score of ~0.5. Default: 150 */
  midpointCp?: number
}

export class EvalDeltaStrategy implements CriticalityStrategy {
  readonly name = 'eval-delta'
  private midpointCp: number

  constructor(options: EvalDeltaOptions = {}) {
    this.midpointCp = options.midpointCp ?? 150
  }

  score(before: PositionSnapshot, after: PositionSnapshot): number {
    const delta = Math.abs(toCp(after) - toCp(before))
    // Sigmoid maps delta to [0, 1]: midpointCp → ~0.5, 0 → ~0, large → ~1
    return sigmoid(delta - this.midpointCp, this.midpointCp / 2)
  }
}
```

### `src/services/analysis/criticality/scorer.ts`

```typescript
import type { CriticalityStrategy, PositionSnapshot } from './base'
import { EvalDeltaStrategy } from './strategies/evalDelta'

export class CriticalityScorer {
  private strategy: CriticalityStrategy

  constructor(strategy?: CriticalityStrategy) {
    this.strategy = strategy ?? new EvalDeltaStrategy()
  }

  setStrategy(strategy: CriticalityStrategy): void {
    this.strategy = strategy
  }

  getStrategyName(): string {
    return this.strategy.name
  }

  score(before: PositionSnapshot, after: PositionSnapshot): number {
    return this.strategy.score(before, after)
  }
}
```

---

## Phase 3 — Database Models

Four new models following the existing `BaseModel` pattern. Register them in `src/database/index.ts`.

### New files

```
src/database/
├── analysis/
│   ├── types.ts
│   ├── GameAnalysisModel.ts
│   ├── PositionAnalysisModel.ts
│   └── index.ts
└── vectors/
    ├── VectorModel.ts          # Manages sqlite-vec virtual tables
    └── index.ts
```

### `src/database/analysis/types.ts`

```typescript
export type GameAnalysisStatus = 'pending' | 'running' | 'complete' | 'failed'

export interface GameAnalysisData {
  id?: number
  gameId: number
  status: GameAnalysisStatus
  depth: number
  criticalityStrategy: string
  positionCount: number
  analyzedAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface PositionAnalysisData {
  id?: number
  gameAnalysisId: number
  gameId: number
  fen: string
  ply: number
  moveNumber: number
  isWhiteMove: boolean
  evalCp: number | null
  evalMate: number | null
  bestMove: string | null
  depth: number
  criticalityScore: number
  /** JSON blob: Record<featureName, { raw, normalized, weight, weighted }> */
  featuresJson: string | null
  createdAt?: string
}
```

### `src/database/analysis/GameAnalysisModel.ts`

```typescript
import type Database from 'better-sqlite3'
import type { BaseModel } from '../models/BaseModel'
import type { GameAnalysisData, GameAnalysisStatus } from './types'

export class GameAnalysisModel implements BaseModel {
  initializeTables(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS game_analyses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gameId INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        depth INTEGER NOT NULL DEFAULT 20,
        criticalityStrategy TEXT NOT NULL DEFAULT 'eval-delta',
        positionCount INTEGER NOT NULL DEFAULT 0,
        analyzedAt TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (gameId) REFERENCES chess_games(id) ON DELETE CASCADE
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS idx_game_analyses_gameId ON game_analyses(gameId)`)
  }

  static create(
    db: Database.Database,
    data: Omit<GameAnalysisData, 'id' | 'createdAt' | 'updatedAt'>
  ): GameAnalysisData {
    const stmt = db.prepare(`
      INSERT INTO game_analyses (gameId, status, depth, criticalityStrategy, positionCount)
      VALUES (?, ?, ?, ?, ?)
    `)
    const result = stmt.run(data.gameId, data.status, data.depth, data.criticalityStrategy, data.positionCount)
    return this.findById(db, result.lastInsertRowid as number)!
  }

  static findById(db: Database.Database, id: number): GameAnalysisData | null {
    return db.prepare('SELECT * FROM game_analyses WHERE id = ?').get(id) as GameAnalysisData | null
  }

  static findByGameId(db: Database.Database, gameId: number): GameAnalysisData | null {
    return db.prepare(
      'SELECT * FROM game_analyses WHERE gameId = ? ORDER BY createdAt DESC LIMIT 1'
    ).get(gameId) as GameAnalysisData | null
  }

  static updateStatus(
    db: Database.Database,
    id: number,
    status: GameAnalysisStatus,
    positionCount?: number
  ): void {
    db.prepare(`
      UPDATE game_analyses
      SET status = ?,
          positionCount = COALESCE(?, positionCount),
          analyzedAt = CASE WHEN ? = 'complete' THEN datetime('now') ELSE analyzedAt END,
          updatedAt = datetime('now')
      WHERE id = ?
    `).run(status, positionCount ?? null, status, id)
  }

  static delete(db: Database.Database, id: number): boolean {
    return (db.prepare('DELETE FROM game_analyses WHERE id = ?').run(id)).changes > 0
  }
}
```

### `src/database/analysis/PositionAnalysisModel.ts`

```typescript
import type Database from 'better-sqlite3'
import type { BaseModel } from '../models/BaseModel'
import type { PositionAnalysisData } from './types'

export class PositionAnalysisModel implements BaseModel {
  initializeTables(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS position_analyses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gameAnalysisId INTEGER NOT NULL,
        gameId INTEGER NOT NULL,
        fen TEXT NOT NULL,
        ply INTEGER NOT NULL,
        moveNumber INTEGER NOT NULL,
        isWhiteMove INTEGER NOT NULL,
        evalCp INTEGER,
        evalMate INTEGER,
        bestMove TEXT,
        depth INTEGER NOT NULL DEFAULT 0,
        criticalityScore REAL NOT NULL DEFAULT 0,
        featuresJson TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (gameAnalysisId) REFERENCES game_analyses(id) ON DELETE CASCADE,
        FOREIGN KEY (gameId) REFERENCES chess_games(id) ON DELETE CASCADE
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_position_analyses_gameAnalysisId ON position_analyses(gameAnalysisId);
      CREATE INDEX IF NOT EXISTS idx_position_analyses_criticalityScore ON position_analyses(criticalityScore DESC);
      CREATE INDEX IF NOT EXISTS idx_position_analyses_fen ON position_analyses(fen);
    `)
  }

  static bulkInsert(db: Database.Database, rows: Omit<PositionAnalysisData, 'id' | 'createdAt'>[]): void {
    const stmt = db.prepare(`
      INSERT INTO position_analyses
        (gameAnalysisId, gameId, fen, ply, moveNumber, isWhiteMove,
         evalCp, evalMate, bestMove, depth, criticalityScore, featuresJson)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertMany = db.transaction((items: typeof rows) => {
      for (const row of items) {
        stmt.run(
          row.gameAnalysisId, row.gameId, row.fen, row.ply, row.moveNumber,
          row.isWhiteMove ? 1 : 0, row.evalCp, row.evalMate, row.bestMove,
          row.depth, row.criticalityScore, row.featuresJson
        )
      }
    })
    insertMany(rows)
  }

  static findByGameAnalysisId(db: Database.Database, gameAnalysisId: number): PositionAnalysisData[] {
    return db.prepare(
      'SELECT * FROM position_analyses WHERE gameAnalysisId = ? ORDER BY ply ASC'
    ).all(gameAnalysisId) as PositionAnalysisData[]
  }

  static findCritical(
    db: Database.Database,
    gameAnalysisId: number,
    threshold: number
  ): PositionAnalysisData[] {
    return db.prepare(`
      SELECT * FROM position_analyses
      WHERE gameAnalysisId = ? AND criticalityScore >= ?
      ORDER BY ply ASC
    `).all(gameAnalysisId, threshold) as PositionAnalysisData[]
  }
}
```

### `src/database/vectors/VectorModel.ts`

```typescript
import type Database from 'better-sqlite3'
import type { BaseModel } from '../models/BaseModel'

export class VectorModel implements BaseModel {
  constructor(
    private positionalDim: number,
    private structuralDim: number
  ) {}

  initializeTables(db: Database.Database): void {
    // sqlite-vec virtual tables. Dimensions must be fixed at creation time.
    // If dimensions change (feature added/removed), drop and recreate.
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS positional_vectors USING vec0(
        position_analysis_id INTEGER PRIMARY KEY,
        embedding float[${this.positionalDim}]
      )
    `)

    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS structural_vectors USING vec0(
        position_analysis_id INTEGER PRIMARY KEY,
        embedding float[${this.structuralDim}]
      )
    `)
  }

  static insertPositional(
    db: Database.Database,
    positionAnalysisId: number,
    vector: Float32Array
  ): void {
    db.prepare(
      'INSERT OR REPLACE INTO positional_vectors (position_analysis_id, embedding) VALUES (?, ?)'
    ).run(positionAnalysisId, Buffer.from(vector.buffer))
  }

  static insertStructural(
    db: Database.Database,
    positionAnalysisId: number,
    vector: Float32Array
  ): void {
    db.prepare(
      'INSERT OR REPLACE INTO structural_vectors (position_analysis_id, embedding) VALUES (?, ?)'
    ).run(positionAnalysisId, Buffer.from(vector.buffer))
  }

  /**
   * Find K nearest positional neighbors to a query vector.
   * Returns position_analysis_ids with their distances.
   */
  static knnPositional(
    db: Database.Database,
    queryVector: Float32Array,
    k: number
  ): Array<{ position_analysis_id: number; distance: number }> {
    return db.prepare(`
      SELECT position_analysis_id, distance
      FROM positional_vectors
      WHERE embedding MATCH ?
        AND k = ?
      ORDER BY distance
    `).all(Buffer.from(queryVector.buffer), k) as any[]
  }

  static knnStructural(
    db: Database.Database,
    queryVector: Float32Array,
    k: number
  ): Array<{ position_analysis_id: number; distance: number }> {
    return db.prepare(`
      SELECT position_analysis_id, distance
      FROM structural_vectors
      WHERE embedding MATCH ?
        AND k = ?
      ORDER BY distance
    `).all(Buffer.from(queryVector.buffer), k) as any[]
  }
}
```

### Register models in `src/database/index.ts`

```typescript
import { featureRegistry } from 'src/services/analysis'
import { GameAnalysisModel } from './analysis/GameAnalysisModel'
import { PositionAnalysisModel } from './analysis/PositionAnalysisModel'
import { VectorModel } from './vectors/VectorModel'

export const database = new DatabaseService([
  new UserModel(),
  new PlatformAccountModel(),
  new ChessGameModel(),
  new SyncModel(),
  // New:
  new GameAnalysisModel(),
  new PositionAnalysisModel(),
  new VectorModel(
    featureRegistry.positionalDimension(),
    featureRegistry.structuralDimension()
  ),
])
```

> **Important:** If you add or remove features from the registry, the vector table dimensions change. On first run after a dimension change, you must drop and recreate the `positional_vectors` / `structural_vectors` tables. Add a version check to `VectorModel.initializeTables` to handle this automatically.

---

## Phase 4 — `GameAnalysisService`

This orchestrates the full pipeline: Stockfish → features → criticality → persist.

### `src/services/analysis/GameAnalysisService.ts`

```typescript
import { Chess } from 'chess.js'
import Database from 'better-sqlite3'
import { AnalysisService } from 'src/services/engine/analysis/AnalysisService'
import { UCIEngine } from 'src/services/engine/UCIEngine'
import { GameAnalysisModel } from 'src/database/analysis/GameAnalysisModel'
import { PositionAnalysisModel } from 'src/database/analysis/PositionAnalysisModel'
import { VectorModel } from 'src/database/vectors/VectorModel'
import { featureRegistry } from './index'
import { CriticalityScorer } from './criticality/scorer'
import type { PositionAnalysisData } from 'src/database/analysis/types'

export interface GameAnalysisOptions {
  depth?: number
  criticalityThreshold?: number
}

export interface GameAnalysisProgress {
  ply: number
  totalPlies: number
  currentFen: string
}

export class GameAnalysisService {
  private criticalityScorer = new CriticalityScorer()

  constructor(
    private db: Database.Database,
    private engine: UCIEngine
  ) {}

  async analyzeGame(
    gameId: number,
    moves: string[],
    options: GameAnalysisOptions = {},
    onProgress?: (progress: GameAnalysisProgress) => void
  ): Promise<number> {
    const { depth = 20 } = options
    const analysisService = new AnalysisService(this.engine)

    // Create the analysis record
    const gameAnalysis = GameAnalysisModel.create(this.db, {
      gameId,
      status: 'running',
      depth,
      criticalityStrategy: this.criticalityScorer.getStrategyName(),
      positionCount: 0,
    })

    try {
      const positions = await analysisService.analyzeGame(moves, { depth })

      const rows: Omit<PositionAnalysisData, 'id' | 'createdAt'>[] = []

      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i]
        const chess = new Chess(pos.fen)
        const before = positions[i - 1]

        const criticalityScore = before
          ? this.criticalityScorer.score(
              { evalCp: before.eval, evalMate: before.mate ?? null, depth: before.depth },
              { evalCp: pos.eval, evalMate: pos.mate ?? null, depth: pos.depth }
            )
          : 0

        const debugInfo = featureRegistry.extractDebugInfo(chess)

        rows.push({
          gameAnalysisId: gameAnalysis.id!,
          gameId,
          fen: pos.fen,
          ply: i,
          moveNumber: Math.floor(i / 2) + 1,
          isWhiteMove: i % 2 === 0,
          evalCp: pos.eval ?? null,
          evalMate: pos.mate ?? null,
          bestMove: pos.bestMove ?? null,
          depth: pos.depth,
          criticalityScore,
          featuresJson: JSON.stringify(
            Object.fromEntries(debugInfo.map((f) => [f.name, { raw: f.raw, normalized: f.normalized, weight: f.weight }]))
          ),
        })

        onProgress?.({ ply: i + 1, totalPlies: positions.length, currentFen: pos.fen })
      }

      // Bulk insert position analyses
      PositionAnalysisModel.bulkInsert(this.db, rows)

      // Fetch inserted rows to get their IDs, then insert vectors
      const inserted = PositionAnalysisModel.findByGameAnalysisId(this.db, gameAnalysis.id!)
      for (const row of inserted) {
        const chess = new Chess(row.fen)
        VectorModel.insertPositional(this.db, row.id!, featureRegistry.buildPositionalVector(chess))
        VectorModel.insertStructural(this.db, row.id!, featureRegistry.buildStructuralVector(chess))
      }

      GameAnalysisModel.updateStatus(this.db, gameAnalysis.id!, 'complete', rows.length)
      return gameAnalysis.id!
    } catch (err) {
      GameAnalysisModel.updateStatus(this.db, gameAnalysis.id!, 'failed')
      throw err
    }
  }
}
```

---

## Phase 5 — IPC API Handlers

```
src/api/analysis/
├── register.ts
└── handlers/
    ├── scorePosition.ts          # 'analysis:scorePosition'
    ├── analyzeGame.ts            # 'analysis:analyzeGame'
    ├── getGameAnalysis.ts        # 'analysis:getGameAnalysis'
    ├── getCriticalPositions.ts   # 'analysis:getCriticalPositions'
    └── findSimilarPositions.ts   # 'analysis:findSimilarPositions'
```

### `analysis:scorePosition`

The primary **tuning endpoint**. Given a FEN, returns the Stockfish eval (or uses a cached one), the criticality score vs. the previous FEN, and the full feature debug info.

```typescript
declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:scorePosition': {
      request: {
        fen: string
        previousFen?: string
        depth?: number
      }
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

### `analysis:analyzeGame`

Long-running; streams progress via push channel `analysis:game-progress`. Returns the `gameAnalysisId` when complete.

```typescript
declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:analyzeGame': {
      request: { gameId: number; moves: string[]; depth?: number }
      response: { gameAnalysisId: number }
    }
    'analysis:game-progress': {
      request: never
      response: { gameId: number; ply: number; totalPlies: number }
    }
  }
}
```

### `analysis:getGameAnalysis`

Returns the full stored analysis for a game, including all positions sorted by ply.

```typescript
declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:getGameAnalysis': {
      request: { gameId: number }
      response: {
        analysis: GameAnalysisData | null
        positions: PositionAnalysisData[]
      }
    }
  }
}
```

### `analysis:getCriticalPositions`

Returns only positions above a criticality threshold, sorted by ply.

```typescript
declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:getCriticalPositions': {
      request: { gameAnalysisId: number; threshold: number }
      response: { positions: PositionAnalysisData[] }
    }
  }
}
```

### `analysis:findSimilarPositions`

KNN search: given a FEN, find the N most structurally or positionally similar stored positions.

```typescript
declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:findSimilarPositions': {
      request: {
        fen: string
        k: number
        vectorType: 'positional' | 'structural'
      }
      response: {
        matches: Array<{ positionAnalysisId: number; distance: number; fen: string; gameId: number }>
      }
    }
  }
}
```

---

## Phase 6 — UI Integration

### Extend the existing Analysis page

The current `/analysis/:gameId` layout has four sections (game info, PGN viewer, board, engine analysis). No new routes are needed for tuning — extend what's there.

**Changes to `ChessPGNViewer.vue`:**
- Accept a `criticalPositions: Map<number, number>` prop (ply → criticality score)
- Add a colored criticality indicator next to each move: red (≥0.7), orange (≥0.4), none below
- Add a "jump to next critical position" button

**New composable: `src/renderer/analysis/composables/useGameAnalysis.ts`**

Follows the same TanStack Query pattern as `useEngineAnalysis`:

```typescript
export const useGameAnalysis = (gameId: MaybeRef<number>) => {
  // Query for stored analysis
  const { data: storedAnalysis, isLoading: isLoadingStored } = useQuery({
    queryKey: computed(() => ['game-analysis', toValue(gameId)]),
    queryFn: () => ipcService.send('analysis:getGameAnalysis', { gameId: toValue(gameId) }),
  })

  // Mutation to trigger a full analysis run
  const { mutate: runAnalysis, isPending: isAnalyzing } = useMutation({
    mutationFn: (moves: string[]) =>
      ipcService.send('analysis:analyzeGame', { gameId: toValue(gameId), moves }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['game-analysis', toValue(gameId)] }),
  })

  // Listen to progress push channel
  const progress = ref<{ ply: number; totalPlies: number } | null>(null)
  ipcService.on('analysis:game-progress', (res) => {
    if (res.data?.gameId === toValue(gameId)) progress.value = res.data
  })

  const criticalPositions = computed(() =>
    new Map(
      storedAnalysis.value?.positions.map((p) => [p.ply, p.criticalityScore]) ?? []
    )
  )

  return { storedAnalysis, criticalPositions, isLoadingStored, runAnalysis, isAnalyzing, progress }
}
```

**New component: `ChessFeatureDebugPanel.vue`**

Displays the `FeatureDebugEntry[]` from `analysis:scorePosition` for the current position. Shows a table with feature name, raw value, normalized value, weight, and weighted contribution. Collapsible. Only shown in dev/tuning mode.

**`AnalysisPage.vue` additions:**
- An "Analyze Game" button that calls `runAnalysis(moves)` with a progress bar
- Pass `criticalPositions` down to `ChessPGNViewer`
- Add `ChessFeatureDebugPanel` next to the existing `ChessAnalysisViewer`, triggered by a toggle

---

## Implementation Order

| Phase | What | Why first |
|---|---|---|
| 1a | `PositionFeature` interface + `FeatureRegistry` | Everything depends on this; pure logic, zero dependencies |
| 1b | Individual feature extractors | Build up the registry; testable in isolation |
| 2 | `CriticalityScorer` + `EvalDeltaStrategy` | Depends only on plain numbers; can validate the scoring curve independently |
| 3 | Database models | Depends on knowing feature vector dimensions (from Phase 1) |
| 3a | Load `sqlite-vec` in `DatabaseService` | Must happen before vector table creation |
| 4 | `GameAnalysisService` | Ties phases 1-3 together; can be tested with a hardcoded game |
| 5a | `analysis:analyzeGame` handler + `analysis:getGameAnalysis` | Core pipeline exposed to UI |
| 5b | `analysis:scorePosition` handler | Single-position tuning endpoint |
| 6a | `useGameAnalysis` composable | Data layer for the UI |
| 6b | Criticality badges in `ChessPGNViewer` | Most visible immediate value |
| 6c | `ChessFeatureDebugPanel` | Tuning UI; connect `analysis:scorePosition` to current position |
| 5c / 6d | `analysis:findSimilarPositions` + similarity UI | Last; requires a populated vector DB to be useful |

---

## Notes on Vector Table Dimensions

`sqlite-vec` requires the vector dimension to be declared at table creation time and cannot be changed without dropping and recreating the table. During active development when you're adding/removing features, handle this by:

1. Store the expected dimension in a `app_metadata` table (or a pragma)
2. On startup in `VectorModel.initializeTables`, compare expected vs. actual dimension
3. If they differ, drop both vector tables and recreate with the new dimensions
4. Mark all existing `game_analyses` records as needing re-analysis (`status = 'pending'`)

This makes adding a new feature a zero-friction operation: add the file, register it, restart the app, and re-run analysis.
