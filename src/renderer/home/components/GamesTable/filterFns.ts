import type { FilterFn } from '@tanstack/vue-table'
import type { GameResult, TimeClass } from 'src/database/chess/types'
import { GameResult as GameResultEnum } from 'src/database/chess/types'

/**
 * Player name filter for white/black username columns.
 * filterValue: { search: string; meSelected: boolean; platformUsernames: string[] }
 */
export const playerNameFilterFn: FilterFn<any> = (row, columnId, filterValue) => {
  const { search, meSelected, platformUsernames } = filterValue as {
    search: string
    meSelected: boolean
    platformUsernames: string[]
  }
  const username: string = (row.getValue(columnId) as string).toLowerCase()

  if (search) {
    if (!username.includes(search.toLowerCase())) return false
  }

  if (meSelected && platformUsernames.length > 0) {
    if (!platformUsernames.some(p => p.toLowerCase() === username)) return false
  }

  return true
}

/**
 * Numeric range filter. Rows with null/undefined values pass through.
 * filterValue: { min?: number | null; max?: number | null }
 */
export const rangeFilterFn: FilterFn<any> = (row, columnId, filterValue) => {
  const { min, max } = filterValue as { min?: number | null; max?: number | null }
  const value = row.getValue<number | undefined>(columnId)
  if (value === undefined || value === null) return true
  if (min !== null && min !== undefined && value < min) return false
  if (max !== null && max !== undefined && value > max) return false
  return true
}

/**
 * Date range filter.
 * filterValue: { from?: Date | null; to?: Date | null }
 */
export const dateRangeFilterFn: FilterFn<any> = (row, columnId, filterValue) => {
  const { from, to } = filterValue as { from?: Date | null; to?: Date | null }
  const value = row.getValue<Date | undefined>(columnId)
  if (!value) return true
  const t = value.getTime()
  if (from && t < from.getTime()) return false
  if (to && t > to.getTime()) return false
  return true
}

/**
 * Multi-value filter (array of allowed values).
 * filterValue: string[]
 */
export const multiValueFilterFn: FilterFn<any> = (row, columnId, filterValue) => {
  if (columnId === 'timeControl') {
    const allowed = filterValue as TimeClass[]
    return allowed.includes(row.original.timeControl.timeClass)
  }

  const allowed = filterValue as string[]
  const value = row.getValue<string>(columnId)
  return allowed.includes(value)
}

const LOSS_RESULTS = new Set<GameResult>([
  GameResultEnum.LOSS,
  GameResultEnum.CHECKMATE,
  GameResultEnum.RESIGNED,
  GameResultEnum.TIMEOUT,
  GameResultEnum.ABANDONED,
  GameResultEnum.ABORTED,
])

const DRAW_RESULTS = new Set<GameResult>([
  GameResultEnum.DRAW,
  GameResultEnum.AGREED,
  GameResultEnum.STALEMATE,
  GameResultEnum.REPETITION,
  GameResultEnum.INSUFFICIENT,
  GameResultEnum.FIFTY_MOVE,
])

/** Numeric sort key: win=0, draw=1, loss=2, unknown=3 */
export function resultSortOrder(result?: GameResult): number {
  if (result === GameResultEnum.WIN) return 0
  if (result && DRAW_RESULTS.has(result)) return 1
  if (result && LOSS_RESULTS.has(result)) return 2
  return 3
}
