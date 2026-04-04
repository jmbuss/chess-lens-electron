/**
 * SQLite datetime columns are stored as TEXT in ISO8601 (`toISOString()`).
 * Same convention as `chess_games` / `sync_*` — never INTEGER unixepoch.
 */
export function isoNow(): string {
  return new Date().toISOString()
}

/** ISO timestamp for a specific UTC instant (e.g. base + index ms for stable queue ordering). */
export function isoAtMs(ms: number): string {
  return new Date(ms).toISOString()
}

/**
 * ISO instant for ordering `game_analysis_queue` with `ORDER BY queued_at DESC`
 * (newer games first among the same priority). Prefer end time, then start, then import.
 */
export function gamePlayedAtIso(game: {
  endTime?: string | null
  startTime?: string | null
  importedAt?: string | null
}): string {
  const e = game.endTime?.trim()
  const s = game.startTime?.trim()
  const i = game.importedAt?.trim()
  if (e) return e
  if (s) return s
  if (i) return i
  return isoNow()
}
