import type { ChildNode, Node, PgnNodeData } from 'chessops/pgn'

/**
 * Parsed PGN headers keyed by tag name (e.g. "White", "BlackElo", "ECO").
 * Values are the raw strings from the PGN header section.
 */
export interface PgnHeaders {
  white?: string
  black?: string
  whiteElo?: string
  blackElo?: string
  event?: string
  site?: string
  date?: string
  round?: string
  result?: string
  eco?: string
  timeControl?: string
  termination?: string
  /** Any extra tags not listed above */
  [key: string]: string | undefined
}

/**
 * Augmented node data that extends chessops' PgnNodeData with full position info.
 * Stored in every node of the parsed game tree.
 */
export interface AugmentedNodeData extends PgnNodeData {
  /** FEN string representing the position AFTER this move */
  fen: string
  /** Square the piece moved from (e.g., 'e2') */
  from: string
  /** Square the piece moved to (e.g., 'e4') */
  to: string
  /** Piece type that moved: 'p', 'n', 'b', 'r', 'q', 'k' */
  piece: string
  /** Color of the player who made this move */
  color: 'w' | 'b'
  /** Piece type that was captured, if any */
  captured?: string
  /** Piece type promoted to, if pawn promotion */
  promotion?: string
  /** Clock time remaining after this move (in seconds) */
  clock?: number
  /** Move number (1, 2, 3, ...) */
  moveNumber: number
  /** Reference to parent node for backward navigation */
  parent: GameNode | null
}

/** Root node of a game tree — has no move data itself; children are the moves */
export type GameNode = Node<AugmentedNodeData>

/** Any non-root node in the game tree, carrying move data in its `data` property */
export type GameChildNode = ChildNode<AugmentedNodeData>

/** Parsed game tree with headers and the root node */
export interface ParsedGameTree {
  root: GameNode
  headers: PgnHeaders
}
