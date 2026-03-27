/**
 * Chess.com Service
 * Handles fetching and syncing games from the Chess.com Public API
 */
import type Database from 'better-sqlite3'
import type {
  ChessComGamesResponse,
  ChessComArchivesResponse,
  ChessComSyncParams,
  ChessComSyncResult,
} from './types'
import { transformChessComGames } from './transformer'
import { ChessGameModel } from '../../database/chess'

const CHESS_COM_API_BASE = 'https://api.chess.com/pub'
const DEFAULT_DELAY_MS = 500 // 500ms between requests to avoid rate limiting

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Generate archive URLs for the last N months
 */
function getArchiveUrlsForLastNMonths(username: string, monthsBack: number): string[] {
  const urls: string[] = []
  const now = new Date()

  for (let i = 0; i < monthsBack; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    urls.push(`${CHESS_COM_API_BASE}/player/${username}/games/${year}/${month}`)
  }

  return urls
}

/**
 * Fetch games from a single archive URL
 */
async function fetchGamesFromArchive(archiveUrl: string): Promise<ChessComGamesResponse> {
  const response = await fetch(archiveUrl, {
    headers: {
      'User-Agent': 'Chess-Lens-App/1.0',
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    if (response.status === 404) {
      // No games for this month - return empty
      return { games: [] }
    }
    throw new Error(`Chess.com API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<ChessComGamesResponse>
}

/**
 * Fetch the list of all available archives for a user
 */
export async function fetchArchivesList(username: string): Promise<string[]> {
  const url = `${CHESS_COM_API_BASE}/player/${username}/games/archives`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Chess-Lens-App/1.0',
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Chess.com API error: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as ChessComArchivesResponse
  return data.archives
}

/**
 * Sync games from Chess.com for a specific user
 *
 * This function:
 * 1. Generates archive URLs for the last N months
 * 2. Fetches games from each archive with a delay between requests
 * 3. Transforms games to internal format
 * 4. Adds new games to the database (skips duplicates)
 */
export async function syncGames(
  db: Database.Database,
  params: ChessComSyncParams
): Promise<ChessComSyncResult> {
  const { username, monthsBack, delayBetweenRequests = DEFAULT_DELAY_MS } = params

  const result: ChessComSyncResult = {
    gamesFound: 0,
    gamesAdded: 0,
    monthsSynced: 0,
    errors: [],
  }

  // Generate archive URLs for the last N months
  const archiveUrls = getArchiveUrlsForLastNMonths(username.toLowerCase(), monthsBack)

  for (const archiveUrl of archiveUrls) {
    try {
      // Fetch games from this archive
      const archiveData = await fetchGamesFromArchive(archiveUrl)

      if (archiveData.games.length > 0) {
        result.gamesFound += archiveData.games.length

        // Transform games to internal format
        const games = transformChessComGames(archiveData.games)

        // Filter out games that already exist
        const newGames = games.filter(game => !ChessGameModel.exists(db, game.id))

        if (newGames.length > 0) {
          // Add new games in a batch
          const addedCount = ChessGameModel.createBatch(db, newGames)
          result.gamesAdded += addedCount
        }
      }

      result.monthsSynced++

      // Add delay between requests to avoid rate limiting
      if (archiveUrls.indexOf(archiveUrl) < archiveUrls.length - 1) {
        await sleep(delayBetweenRequests)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      result.errors.push(`Failed to fetch ${archiveUrl}: ${errorMessage}`)
    }
  }

  return result
}

/**
 * Sync games from all available archives (full sync)
 * Use with caution - may take a long time for users with many games
 */
export async function syncAllGames(
  db: Database.Database,
  username: string,
  delayBetweenRequests: number = DEFAULT_DELAY_MS
): Promise<ChessComSyncResult> {
  const result: ChessComSyncResult = {
    gamesFound: 0,
    gamesAdded: 0,
    monthsSynced: 0,
    errors: [],
  }

  try {
    // Get list of all archives
    const archives = await fetchArchivesList(username.toLowerCase())
    console.log('archives', archives)

    for (const archiveUrl of archives) {
      try {
        // Fetch games from this archive
        const archiveData = await fetchGamesFromArchive(archiveUrl)
        console.log('archiveData', archiveData)

        if (archiveData.games.length > 0) {
          result.gamesFound += archiveData.games.length

          // Transform games to internal format
          const games = transformChessComGames(archiveData.games)

          // Filter out games that already exist
          const newGames = games.filter(game => !ChessGameModel.exists(db, game.id))

          if (newGames.length > 0) {
            // Add new games in a batch
            const addedCount = ChessGameModel.createBatch(db, newGames)
            result.gamesAdded += addedCount
          }
        }

        result.monthsSynced++

        // Add delay between requests to avoid rate limiting
        if (archives.indexOf(archiveUrl) < archives.length - 1) {
          await sleep(delayBetweenRequests)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        result.errors.push(`Failed to fetch ${archiveUrl}: ${errorMessage}`)
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    result.errors.push(`Failed to fetch archives list: ${errorMessage}`)
  }

  return result
}
