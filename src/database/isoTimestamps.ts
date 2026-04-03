/**
 * SQLite datetime columns are stored as TEXT in ISO8601 (`toISOString()`).
 * Same convention as `chess_games` / `sync_*` — never INTEGER unixepoch.
 */
export function isoNow(): string {
  return new Date().toISOString()
}
