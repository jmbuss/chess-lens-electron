/**
 * Chess.com Public API Types
 * Based on: https://www.chess.com/news/view/published-data-api
 */

/**
 * Player info in a Chess.com game
 */
export interface ChessComPlayer {
  rating: number
  result: string
  '@id': string
  username: string
  uuid: string
}

/**
 * A single game from the Chess.com API
 */
export interface ChessComGame {
  url: string
  pgn: string
  time_control: string
  end_time: number // Unix timestamp in seconds
  rated: boolean
  tcn?: string
  uuid: string
  initial_setup?: string
  fen: string
  time_class: 'daily' | 'rapid' | 'blitz' | 'bullet'
  rules: 'chess' | 'chess960' | 'bughouse' | 'crazyhouse' | 'threecheck' | 'kingofthehill'
  white: ChessComPlayer
  black: ChessComPlayer
  accuracies?: {
    white: number
    black: number
  }
  tournament?: string
  match?: string
}

/**
 * Response from Chess.com games archive endpoint
 * e.g., https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}
 */
export interface ChessComGamesResponse {
  games: ChessComGame[]
}

/**
 * Response from Chess.com games archive list endpoint
 * e.g., https://api.chess.com/pub/player/{username}/games/archives
 */
export interface ChessComArchivesResponse {
  archives: string[]
}

/**
 * Parameters for syncing games
 */
export interface ChessComSyncParams {
  username: string
  monthsBack: number
  delayBetweenRequests?: number // ms, default 500ms to avoid rate limiting
}

/**
 * Result of a sync operation
 */
export interface ChessComSyncResult {
  gamesFound: number
  gamesAdded: number
  monthsSynced: number
  errors: string[]
}
