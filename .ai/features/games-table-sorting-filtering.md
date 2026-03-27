# Games Table — Sorting & Filtering

## Approach

Everything is **client-side**. `useChessGames()` already fetches all games in one call. TanStack Table v8 ships sorting and filtering row models that are not yet wired up — the work is almost entirely additive.

No changes to the IPC layer, database model, or `useChessGames` composable are required.

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Where filter state lives | `useGamesFilters` composable | Keeps `GamesTable.vue` readable; composable is reusable if the table is ever mounted elsewhere |
| How state reaches `UITable` | Props + `v-model` emits | Controlled component pattern; `UITable` stays generic |
| Derived/virtual filter columns | Hidden columns in the column definition | TanStack Table participates in filtering/sorting regardless of visibility |
| Player + opponent filter | Single `filterFn` on the `players` column | Avoids splitting one logical concept across multiple column IDs |

---

## Files to Change

### `src/renderer/components/Table/UITable.vue`

Add the two new TanStack row models and the state/event plumbing for sorting and column filters.

**Imports to add:**

```typescript
import {
  getSortedRowModel,
  getFilteredRowModel,
} from '@tanstack/vue-table'
import type { ColumnFiltersState, SortingState } from '@tanstack/vue-table'
```

**New props:**

```typescript
const props = defineProps<{
  data: TData[]
  columns: ColumnDef<TData>[]
  initialPageSize?: number
  loading?: boolean
  error?: Error | string | null
  columnFilters?: ColumnFiltersState   // new
  sorting?: SortingState               // new
  columnVisibility?: Record<string, boolean> // new — for hiding virtual filter columns
}>()

const emit = defineEmits<{
  'update:sorting': [value: SortingState]
}>()
```

> `columnFilters` is read-only from `UITable`'s perspective — only the filter panel writes to it. Sorting is toggled by clicking headers, so `UITable` emits the updated value.

**Updated `useVueTable` call:**

```typescript
const sorting = ref<SortingState>(props.sorting ?? [])

const table = useVueTable({
  get data() { return props.data },
  get columns() { return props.columns },
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  getSortedRowModel: getSortedRowModel(),     // new
  getFilteredRowModel: getFilteredRowModel(), // new
  autoResetPageIndex: true,                  // new — reset to page 1 on filter/sort change
  state: {
    get pagination() {
      return { pageIndex: pageIndex.value, pageSize: pageSize.value }
    },
    get columnFilters() { return props.columnFilters ?? [] }, // new
    get sorting() { return sorting.value },                   // new
    get columnVisibility() { return props.columnVisibility ?? {} }, // new
  },
  onPaginationChange: updater => { /* existing */ },
  onSortingChange: updater => {                              // new
    const next = typeof updater === 'function' ? updater(sorting.value) : updater
    sorting.value = next
    emit('update:sorting', next)
  },
})
```

**Sort indicators in the header template:**

Replace the `<FlexRender>` block in `<thead>` with a wrapper that adds a sort icon:

```html
<th
  v-for="header in headerGroup.headers"
  :key="header.id"
  class="px-4 py-3 font-semibold"
  :class="{ 'cursor-pointer select-none': header.column.getCanSort() }"
  @click="header.column.getCanSort() && header.column.toggleSorting()"
>
  <div class="flex items-center gap-1">
    <FlexRender
      v-if="!header.isPlaceholder"
      :render="header.column.columnDef.header"
      :props="header.getContext()"
    />
    <!-- sort icon: use the existing icon system (lucide) -->
    <span v-if="header.column.getIsSorted() === 'asc'">↑</span>
    <span v-else-if="header.column.getIsSorted() === 'desc'">↓</span>
    <span v-else-if="header.column.getCanSort()" class="opacity-30">↕</span>
  </div>
</th>
```

> Replace the arrow spans with the project's `<UIIcon>` component once you know the correct lucide icon names (e.g., `arrow-up`, `arrow-down`, `arrows-up-down`).

---

### `src/renderer/home/components/GamesTable/GamesTable.vue`

**Add imports:**

```typescript
import { useGamesFilters } from 'src/renderer/composables/chessGames/useGamesFilters'
import { playerFilterFn, rangeFilterFn, ecoPrefixFilterFn, dateRangeFilterFn, multiValueFilterFn } from './filterFns'
import GamesTableFilters from './GamesTableFilters.vue'
import type { SortingState } from '@tanstack/vue-table'
```

**Wire up filter state:**

```typescript
const { columnFilters, filterState, resetFilters, activeFilterCount } = useGamesFilters()
const sorting = ref<SortingState>([{ id: 'startTime', desc: true }])
```

**Updated column definitions** — add `filterFn` and `enableSorting` to relevant columns, plus add new hidden columns:

```typescript
const columns: ColumnDef<ChessGame>[] = [
  {
    id: 'players',
    header: 'Players',
    filterFn: playerFilterFn,   // new
    cell: /* existing */,
  },
  {
    id: 'result',
    header: 'Result',
    filterFn: multiValueFilterFn, // new — value: { white?: GameResult[], black?: GameResult[] }
    cell: /* existing */,
  },
  {
    id: 'termination',
    header: 'Termination',
    accessorKey: 'termination',
    filterFn: multiValueFilterFn, // new — value: GameTermination[]
    cell: /* existing */,
  },
  {
    id: 'opening',
    header: 'Opening (ECO)',
    accessorKey: 'opening',
    filterFn: ecoPrefixFilterFn, // new — value: { eco?: string; name?: string }
    cell: /* existing */,
  },
  {
    id: 'moves',
    header: 'Moves',
    accessorKey: 'moveCount',
    filterFn: rangeFilterFn,    // new — value: { min?: number; max?: number }
    enableSorting: true,        // new
    cell: /* existing */,
  },
  {
    id: 'timeControl',
    header: 'Time Control',
    accessorKey: 'timeControl',
    filterFn: multiValueFilterFn, // new — value: TimeClass[] (filters on timeClass)
    cell: /* existing */,
  },
  {
    id: 'startTime',
    header: 'Date',
    accessorKey: 'startTime',
    filterFn: dateRangeFilterFn, // new — value: { from?: Date; to?: Date }
    enableSorting: true,         // new
    cell: /* existing */,
  },
  {
    id: 'platform',
    header: 'Platform',
    accessorKey: 'platform',
    filterFn: multiValueFilterFn, // new — value: ChessPlatform[]
    cell: /* existing */,
  },

  // ── Hidden columns (filtering/sorting only, not displayed) ──────────────

  {
    id: 'whiteRating',
    accessorFn: (row) => row.white.rating,
    filterFn: rangeFilterFn,  // value: { min?: number; max?: number }
    enableSorting: true,
    header: 'White Rating',
    cell: () => null,
  },
  {
    id: 'blackRating',
    accessorFn: (row) => row.black.rating,
    filterFn: rangeFilterFn,
    enableSorting: true,
    header: 'Black Rating',
    cell: () => null,
  },
  {
    id: 'ratingDiff',
    accessorFn: (row) => Math.abs((row.white.rating ?? 0) - (row.black.rating ?? 0)),
    filterFn: rangeFilterFn,  // only max is meaningful here
    header: 'Rating Diff',
    cell: () => null,
  },
  {
    id: 'openingFamily',
    accessorFn: (row) => row.opening?.eco?.[0],
    filterFn: 'equals', // built-in — value: 'A' | 'B' | 'C' | 'D' | 'E'
    header: 'ECO Family',
    cell: () => null,
  },
  {
    id: 'variant',
    accessorKey: 'variant',
    filterFn: 'equals',
    header: 'Variant',
    cell: () => null,
  },
  {
    id: 'rated',
    accessorKey: 'rated',
    filterFn: 'equals',
    header: 'Rated',
    cell: () => null,
  },
  {
    id: 'endTime',
    accessorKey: 'endTime',
    enableSorting: true,
    header: 'End Time',
    cell: () => null,
  },
  {
    id: 'importedAt',
    accessorKey: 'importedAt',
    enableSorting: true,
    header: 'Imported At',
    cell: () => null,
  },

  // ── Analysis column (keep last) ──────────────────────────────────────────
  {
    id: 'analysis',
    header: 'Analysis',
    cell: /* existing */,
  },
]
```

**Computed column visibility** — all hidden columns set to `false`:

```typescript
const hiddenColumns: Record<string, boolean> = {
  whiteRating: false,
  blackRating: false,
  ratingDiff: false,
  openingFamily: false,
  variant: false,
  rated: false,
  endTime: false,
  importedAt: false,
}
```

**Updated template:**

```html
<template>
  <div class="h-full flex flex-col gap-2">
    <GamesTableFilters
      v-model:filters="filterState"
      :active-filter-count="activeFilterCount"
      @reset="resetFilters"
    />
    <UITable
      :columns="columns"
      :data="data"
      :initial-page-size="20"
      :loading="isChessGamesLoading"
      :error="chessGamesError"
      :column-filters="columnFilters"
      :column-visibility="hiddenColumns"
      v-model:sorting="sorting"
    />
  </div>
</template>
```

---

## New Files

### `src/renderer/composables/chessGames/useGamesFilters.ts`

Owns all filter state and translates it to TanStack's `ColumnFiltersState` format.

```typescript
import { reactive, computed } from 'vue'
import type { ColumnFiltersState } from '@tanstack/vue-table'
import type { ChessPlatform, GameResult, GameTermination, GameVariant, TimeClass } from 'src/database/chess/types'

export interface GamesFilterState {
  // Player
  playerUsername: string
  playerColor: 'any' | 'white' | 'black'
  opponentUsername: string
  // Ratings
  whiteRatingMin: number | null
  whiteRatingMax: number | null
  blackRatingMin: number | null
  blackRatingMax: number | null
  ratingDiffMax: number | null
  // Opening
  openingEco: string         // prefix: 'B' or 'B12'
  openingName: string
  // Time control
  timeClass: TimeClass[]
  // Dates
  startTimeFrom: Date | null
  startTimeTo: Date | null
  // Game attributes
  platform: ChessPlatform[]
  variant: GameVariant | ''
  rated: boolean | null
  whiteResult: GameResult[]
  blackResult: GameResult[]
  termination: GameTermination[]
  moveCountMin: number | null
  moveCountMax: number | null
}

const DEFAULT_FILTERS: GamesFilterState = {
  playerUsername: '',
  playerColor: 'any',
  opponentUsername: '',
  whiteRatingMin: null,
  whiteRatingMax: null,
  blackRatingMin: null,
  blackRatingMax: null,
  ratingDiffMax: null,
  openingEco: '',
  openingName: '',
  timeClass: [],
  startTimeFrom: null,
  startTimeTo: null,
  platform: [],
  variant: '',
  rated: null,
  whiteResult: [],
  blackResult: [],
  termination: [],
  moveCountMin: null,
  moveCountMax: null,
}

export function useGamesFilters() {
  const filterState = reactive<GamesFilterState>({ ...DEFAULT_FILTERS })

  const columnFilters = computed<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = []

    // players column — handles playerUsername + playerColor + opponentUsername together
    if (filterState.playerUsername || filterState.opponentUsername) {
      filters.push({
        id: 'players',
        value: {
          playerUsername: filterState.playerUsername,
          playerColor: filterState.playerColor,
          opponentUsername: filterState.opponentUsername,
        },
      })
    }

    // result column
    if (filterState.whiteResult.length || filterState.blackResult.length) {
      filters.push({
        id: 'result',
        value: { white: filterState.whiteResult, black: filterState.blackResult },
      })
    }

    // termination
    if (filterState.termination.length) {
      filters.push({ id: 'termination', value: filterState.termination })
    }

    // opening (ECO prefix + name search in one filter)
    if (filterState.openingEco || filterState.openingName) {
      filters.push({
        id: 'opening',
        value: { eco: filterState.openingEco, name: filterState.openingName },
      })
    }

    // ECO family (single letter)
    const ecoFamily = filterState.openingEco.length === 1 ? filterState.openingEco : ''
    if (ecoFamily) {
      filters.push({ id: 'openingFamily', value: ecoFamily })
    }

    // move count range
    if (filterState.moveCountMin !== null || filterState.moveCountMax !== null) {
      filters.push({
        id: 'moves',
        value: { min: filterState.moveCountMin, max: filterState.moveCountMax },
      })
    }

    // time class
    if (filterState.timeClass.length) {
      filters.push({ id: 'timeControl', value: filterState.timeClass })
    }

    // date range
    if (filterState.startTimeFrom || filterState.startTimeTo) {
      filters.push({
        id: 'startTime',
        value: { from: filterState.startTimeFrom, to: filterState.startTimeTo },
      })
    }

    // platform
    if (filterState.platform.length) {
      filters.push({ id: 'platform', value: filterState.platform })
    }

    // variant
    if (filterState.variant) {
      filters.push({ id: 'variant', value: filterState.variant })
    }

    // rated
    if (filterState.rated !== null) {
      filters.push({ id: 'rated', value: filterState.rated })
    }

    // rating ranges
    if (filterState.whiteRatingMin !== null || filterState.whiteRatingMax !== null) {
      filters.push({
        id: 'whiteRating',
        value: { min: filterState.whiteRatingMin, max: filterState.whiteRatingMax },
      })
    }
    if (filterState.blackRatingMin !== null || filterState.blackRatingMax !== null) {
      filters.push({
        id: 'blackRating',
        value: { min: filterState.blackRatingMin, max: filterState.blackRatingMax },
      })
    }
    if (filterState.ratingDiffMax !== null) {
      filters.push({ id: 'ratingDiff', value: { max: filterState.ratingDiffMax } })
    }

    return filters
  })

  const activeFilterCount = computed(() => columnFilters.value.length)

  function resetFilters() {
    Object.assign(filterState, DEFAULT_FILTERS)
  }

  return { filterState, columnFilters, activeFilterCount, resetFilters }
}
```

---

### `src/renderer/home/components/GamesTable/filterFns.ts`

All custom TanStack Table filter functions. Each function signature is `(row, columnId, filterValue) => boolean`.

```typescript
import type { FilterFn } from '@tanstack/vue-table'
import type { ChessGame, GameResult, GameTermination, TimeClass } from 'src/database/chess/types'

// ── Player filter ────────────────────────────────────────────────────────────
// filterValue: { playerUsername: string; playerColor: 'any'|'white'|'black'; opponentUsername: string }

export const playerFilterFn: FilterFn<ChessGame> = (row, _columnId, filterValue) => {
  const { playerUsername, playerColor, opponentUsername } = filterValue as {
    playerUsername: string
    playerColor: 'any' | 'white' | 'black'
    opponentUsername: string
  }

  const white = row.original.white.username.toLowerCase()
  const black = row.original.black.username.toLowerCase()
  const player = playerUsername.toLowerCase()
  const opponent = opponentUsername.toLowerCase()

  if (player) {
    if (playerColor === 'white' && !white.includes(player)) return false
    if (playerColor === 'black' && !black.includes(player)) return false
    if (playerColor === 'any' && !white.includes(player) && !black.includes(player)) return false
  }

  if (opponent) {
    if (playerColor === 'white' && !black.includes(opponent)) return false
    if (playerColor === 'black' && !white.includes(opponent)) return false
    if (playerColor === 'any') {
      // opponent must match the side that the player is NOT on
      const playerIsWhite = white.includes(player)
      const opponentSide = playerIsWhite ? black : white
      if (!opponentSide.includes(opponent)) return false
    }
  }

  return true
}

// ── Range filter (numeric) ───────────────────────────────────────────────────
// filterValue: { min?: number | null; max?: number | null }
// Works for: whiteRating, blackRating, ratingDiff, moveCount

export const rangeFilterFn: FilterFn<ChessGame> = (row, columnId, filterValue) => {
  const { min, max } = filterValue as { min?: number | null; max?: number | null }
  const value = row.getValue<number | undefined>(columnId)
  if (value === undefined || value === null) return true // no data — pass through
  if (min !== null && min !== undefined && value < min) return false
  if (max !== null && max !== undefined && value > max) return false
  return true
}

// ── ECO prefix + opening name filter ─────────────────────────────────────────
// filterValue: { eco?: string; name?: string }

export const ecoPrefixFilterFn: FilterFn<ChessGame> = (row, _columnId, filterValue) => {
  const { eco, name } = filterValue as { eco?: string; name?: string }
  const opening = row.original.opening

  if (eco) {
    const rowEco = opening?.eco ?? ''
    if (!rowEco.toLowerCase().startsWith(eco.toLowerCase())) return false
  }

  if (name) {
    const rowName = opening?.name ?? ''
    if (!rowName.toLowerCase().includes(name.toLowerCase())) return false
  }

  return true
}

// ── Date range filter ────────────────────────────────────────────────────────
// filterValue: { from?: Date | null; to?: Date | null }

export const dateRangeFilterFn: FilterFn<ChessGame> = (row, columnId, filterValue) => {
  const { from, to } = filterValue as { from?: Date | null; to?: Date | null }
  const value = row.getValue<Date | undefined>(columnId)
  if (!value) return true
  const t = value.getTime()
  if (from && t < from.getTime()) return false
  if (to && t > to.getTime()) return false
  return true
}

// ── Multi-value filter (array of allowed values) ──────────────────────────────
// Works for: termination, platform, timeClass (checks timeControl.timeClass), result
// filterValue: string[] | { white?: GameResult[]; black?: GameResult[] }

export const multiValueFilterFn: FilterFn<ChessGame> = (row, columnId, filterValue) => {
  // Result column has a special nested shape
  if (columnId === 'result') {
    const { white, black } = filterValue as { white?: GameResult[]; black?: GameResult[] }
    if (white?.length && !white.includes(row.original.white.result!)) return false
    if (black?.length && !black.includes(row.original.black.result!)) return false
    return true
  }

  // timeControl column — filter on timeClass inside the object
  if (columnId === 'timeControl') {
    const allowed = filterValue as TimeClass[]
    return allowed.includes(row.original.timeControl.timeClass)
  }

  // All other columns — simple array include
  const allowed = filterValue as string[]
  const value = row.getValue<string>(columnId)
  return allowed.includes(value)
}
```

---

### `src/renderer/home/components/GamesTable/GamesTableFilters.vue`

A collapsible filter panel rendered above `UITable`. Organise filters into logical sections. Below is a structural skeleton — fill in the input components using whatever UI primitives already exist in the project (text inputs, checkboxes, number inputs, date pickers).

```
GamesTableFilters.vue
  └── Sections (each collapsible):
      ├── Players
      │   ├── Player username (text input)
      │   ├── Player color (radio: any / white / black)
      │   └── Opponent username (text input)
      ├── Ratings
      │   ├── White rating min/max (two number inputs)
      │   ├── Black rating min/max (two number inputs)
      │   └── Max rating differential (number input)
      ├── Opening
      │   ├── ECO code (text input — prefix match)
      │   └── Opening name (text input — substring match)
      ├── Time Control
      │   └── Time class (checkbox group: ultraBullet, bullet, blitz, rapid, classical, daily)
      ├── Dates
      │   ├── Start date from (date input)
      │   └── Start date to (date input)
      └── Game Attributes
          ├── Platform (checkbox group: chess.com, lichess.org)
          ├── Variant (select)
          ├── Rated (toggle: any / rated / unrated)
          ├── White result (multi-select using GameResult enum values)
          ├── Black result (multi-select using GameResult enum values)
          ├── Termination (checkbox group using GameTermination enum values)
          └── Move count min/max (two number inputs)
```

The component receives `filters` via `v-model` and emits `update:filters` on every change. Debounce text inputs (playerUsername, opponentUsername, openingEco, openingName) at ~300ms using `watchDebounced` from `@vueuse/core` before writing to the model.

**Panel toggle** — a button in the toolbar showing "Filters (N)" where N is `activeFilterCount`. Clicking it opens/closes the panel via a `v-if` or `v-show`.

---

## Implementation Phases

Follow this order to ship incrementally — each phase is usable in isolation.

### Phase 1 — Sorting only
1. Add `getSortedRowModel`, sorting state, and the sort-click header UI to `UITable.vue`
2. Add `enableSorting: true` to `startTime`, `moves`, `whiteRating` (hidden), `blackRating` (hidden), `endTime` (hidden), `importedAt` (hidden) columns in `GamesTable.vue`

Outcome: Clicking column headers sorts the table. No filter UI yet.

### Phase 2 — Filter infrastructure (no UI)
1. Create `filterFns.ts`
2. Create `useGamesFilters.ts`
3. Add `getFilteredRowModel` and `columnFilters` prop to `UITable.vue`
4. Add `filterFn` to all column definitions
5. Add hidden virtual columns
6. Wire `useGamesFilters` into `GamesTable.vue`

Outcome: Filters work programmatically; can be verified in Vue DevTools.

### Phase 3 — Filter UI
1. Build `GamesTableFilters.vue` with the panel toggle and all sections
2. Text input debouncing via `watchDebounced`

Outcome: Full sorting and filtering available to users.

---

## Gotchas & Notes

- **`autoResetPageIndex: true`** must be set on the table — without it, applying a filter that reduces results to fewer pages leaves the user on a now-invalid page number.
- **Null ratings** — `rangeFilterFn` treats `undefined`/`null` values as passing the filter (no data → no constraint). This is the friendliest behaviour since not all imported games have ratings.
- **ECO family vs ECO prefix** — when the user types a single letter in the ECO field, it is ambiguous whether they want "prefix of full code" or "family (first letter only)". The `openingFamily` hidden column uses an exact `equals` filter while `ecoPrefixFilterFn` does a `startsWith` on the full code. The composable should only push a filter to `openingFamily` when `openingEco` is exactly one character long, otherwise use `ecoPrefixFilterFn` on the `opening` column.
- **Opponent filter with `playerColor === 'any'`** — the logic in `playerFilterFn` makes a best-effort guess that the player is the white side when both sides match. If the game has two players whose names both contain the search string, the filter may behave unexpectedly. For most use cases (searching your own username) this is fine.
- **Debounce text inputs** — filter functions run synchronously on every keystroke for the full dataset. Use `watchDebounced` (VueUse) with ~300ms on `playerUsername`, `opponentUsername`, `openingEco`, and `openingName` before writing to `filterState`.
- **`multiValueFilterFn` for `timeControl`** — the column accessor returns the full `TimeControl` object, not a primitive. The filter function special-cases `columnId === 'timeControl'` to reach inside the object. An alternative is to add a hidden `timeClass` column with `accessorFn: r => r.timeControl.timeClass` and use a simpler `multiValueFilterFn`.
