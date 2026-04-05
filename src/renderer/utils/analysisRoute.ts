import type { RouteLocationRaw } from 'vue-router'

/** Open analysis for a game, optionally at a position from a FEN (matches routed `?fen=` query). */
export function analysisRoute(gameId: string, fen?: string | null): RouteLocationRaw {
  const f = fen?.trim()
  if (f) {
    return { path: `/analysis/${gameId}`, query: { fen: f } }
  }
  return `/analysis/${gameId}`
}
