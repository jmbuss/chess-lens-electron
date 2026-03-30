import { reactive, computed } from 'vue'
import type { ColumnFiltersState } from '@tanstack/vue-table'
import type { ChessPlatform, GameResult, GameTermination, TimeClass } from 'src/database/chess/types'

export interface GamesFilterState {
  playerUsername: string
  playerColor: 'any' | 'white' | 'black'
  opponentUsername: string
  whiteResult: GameResult[]
  blackResult: GameResult[]
  termination: GameTermination[]
  openingEco: string
  openingName: string
  moveCountMin: number | null
  moveCountMax: number | null
  timeClass: TimeClass[]
  startTimeFrom: Date | null
  startTimeTo: Date | null
  platform: ChessPlatform[]
  analysisStatus: 'all' | 'analyzed' | 'not-analyzed'
  favoritesOnly: boolean
}

const DEFAULT_FILTERS: GamesFilterState = {
  playerUsername: '',
  playerColor: 'any',
  opponentUsername: '',
  whiteResult: [],
  blackResult: [],
  termination: [],
  openingEco: '',
  openingName: '',
  moveCountMin: null,
  moveCountMax: null,
  timeClass: [],
  startTimeFrom: null,
  startTimeTo: null,
  platform: [],
  analysisStatus: 'all',
  favoritesOnly: false,
}

export function useGamesFilters() {
  const filterState = reactive<GamesFilterState>({ ...DEFAULT_FILTERS })

  const columnFilters = computed<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = []

    if (filterState.favoritesOnly) {
      filters.push({ id: 'favorite', value: true })
    }

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

    if (filterState.whiteResult.length || filterState.blackResult.length) {
      filters.push({
        id: 'result',
        value: { white: filterState.whiteResult, black: filterState.blackResult },
      })
    }

    if (filterState.termination.length) {
      filters.push({ id: 'termination', value: filterState.termination })
    }

    if (filterState.openingEco || filterState.openingName) {
      filters.push({
        id: 'opening',
        value: { eco: filterState.openingEco, name: filterState.openingName },
      })
    }

    if (filterState.moveCountMin !== null || filterState.moveCountMax !== null) {
      filters.push({
        id: 'moves',
        value: { min: filterState.moveCountMin, max: filterState.moveCountMax },
      })
    }

    if (filterState.timeClass.length) {
      filters.push({ id: 'timeControl', value: filterState.timeClass })
    }

    if (filterState.startTimeFrom || filterState.startTimeTo) {
      filters.push({
        id: 'startTime',
        value: { from: filterState.startTimeFrom, to: filterState.startTimeTo },
      })
    }

    if (filterState.platform.length) {
      filters.push({ id: 'platform', value: filterState.platform })
    }

    if (filterState.analysisStatus !== 'all') {
      filters.push({ id: 'analysisStatus', value: filterState.analysisStatus })
    }

    return filters
  })

  const activeFilterCount = computed(() => columnFilters.value.length)

  function resetFilters() {
    Object.assign(filterState, { ...DEFAULT_FILTERS })
  }

  return { filterState, columnFilters, activeFilterCount, resetFilters }
}
