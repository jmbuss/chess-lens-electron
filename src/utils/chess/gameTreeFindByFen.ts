import { makeFen } from 'chessops/fen'
import { startingPosition, isChildNode } from 'chessops/pgn'
import type { GameNode, GameChildNode, PgnHeaders } from './types'
import { STARTING_FEN } from './GameTree'

/** Piece placement, side, castling, en passant — ignores halfmove clock and fullmove number. */
function fenPositionKey(fen: string): string {
  const parts = fen.trim().split(/\s+/)
  return parts.slice(0, 4).join(' ')
}

/** Starting FEN for this game (handles non-standard roots via PGN SetUp/FEN headers). */
function rootPositionFen(headers: PgnHeaders): string {
  const map = new Map<string, string>()
  const keys = Object.keys(headers)
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i]
    const v = headers[k]
    if (v !== undefined && v !== '') map.set(k, v)
  }
  const result = startingPosition(map)
  if (result.isErr) return STARTING_FEN
  return makeFen(result.value.toSetup())
}

/**
 * Breadth-first search for the node at `targetFen` (compares position keys only).
 */
export function findNodeForFen(
  root: GameNode,
  headers: PgnHeaders,
  targetFen: string
): GameNode | GameChildNode | null {
  const targetKey = fenPositionKey(targetFen)
  if (fenPositionKey(rootPositionFen(headers)) === targetKey) {
    return root
  }
  const queue: (GameNode | GameChildNode)[] = [...root.children]
  let qi = 0
  while (qi < queue.length) {
    const node = queue[qi]
    qi += 1
    if (isChildNode(node) && fenPositionKey(node.data.fen) === targetKey) {
      return node
    }
    node.children.forEach(child => {
      queue.push(child as GameChildNode)
    })
  }
  return null
}
