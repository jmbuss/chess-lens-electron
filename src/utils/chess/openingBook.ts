import {
  openingBook,
  getPositionBook,
  type OpeningCollection,
  type PositionBook,
} from '@chess-openings/eco.json'

interface OpeningBookSingleton {
  book: OpeningCollection
  positionBook: PositionBook
}

let cached: OpeningBookSingleton | null = null
let pending: Promise<OpeningBookSingleton> | null = null

/**
 * Returns the opening book and pre-built position book, loading them once
 * and caching the result for all subsequent callers.
 *
 * The position book enables faster fallback matching when the exact FEN
 * isn't found in the opening collection.
 */
export async function getOpeningBookSingleton(): Promise<OpeningBookSingleton> {
  if (cached) return cached

  // Deduplicate concurrent calls — all waiters share the same promise
  if (!pending) {
    pending = openingBook().then(book => {
      const result: OpeningBookSingleton = { book, positionBook: getPositionBook(book) }
      cached = result
      pending = null
      return result
    })
  }

  return pending
}
