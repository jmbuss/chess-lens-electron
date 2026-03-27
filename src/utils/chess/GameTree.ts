import { Chess } from 'chessops/chess'
import { parseFen, makeFen } from 'chessops/fen'
import { parsePgn, startingPosition, Node, ChildNode, parseComment, isChildNode } from 'chessops/pgn'
import { makeSquare, parseSquare } from 'chessops/util'
import { makeSan, parseSan } from 'chessops/san'
import { isDrop } from 'chessops/types'
import type { AugmentedNodeData, GameNode, GameChildNode, ParsedGameTree, PgnHeaders } from './types'
import type { Role, Color } from 'chessops/types'

export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function colorToShort(color: Color): 'w' | 'b' {
  return color === 'white' ? 'w' : 'b'
}

function roleToChar(role: Role): string {
  const roleMap: Record<Role, string> = {
    pawn: 'p',
    knight: 'n',
    bishop: 'b',
    rook: 'r',
    queen: 'q',
    king: 'k',
  }
  return roleMap[role]
}

function extractClock(comments?: string[]): number | undefined {
  if (!comments || comments.length === 0) return undefined
  for (const comment of comments) {
    const parsed = parseComment(comment)
    if (parsed.clock !== undefined) return parsed.clock
  }
  return undefined
}

function extractHeaders(raw: Map<string, string>): PgnHeaders {
  const get = (key: string) => raw.get(key)
  const headers: PgnHeaders = {}

  if (get('White')) headers.white = get('White')
  if (get('Black')) headers.black = get('Black')
  if (get('WhiteElo')) headers.whiteElo = get('WhiteElo')
  if (get('BlackElo')) headers.blackElo = get('BlackElo')
  if (get('Event')) headers.event = get('Event')
  if (get('Site')) headers.site = get('Site')
  if (get('Date')) headers.date = get('Date')
  if (get('Round')) headers.round = get('Round')
  if (get('Result')) headers.result = get('Result')
  if (get('ECO')) headers.eco = get('ECO')
  if (get('TimeControl')) headers.timeControl = get('TimeControl')
  if (get('Termination')) headers.termination = get('Termination')

  const known = new Set(['White', 'Black', 'WhiteElo', 'BlackElo', 'Event', 'Site', 'Date', 'Round', 'Result', 'ECO', 'TimeControl', 'Termination'])
  for (const [key, value] of raw) {
    if (!known.has(key)) headers[key] = value
  }

  return headers
}

/**
 * Parse a PGN string and build an annotated game tree.
 * Returns the root node and parsed headers; mainline and all variations are reachable from root.
 */
export function parseGameTree(pgn: string): ParsedGameTree {
  const root = new Node<AugmentedNodeData>()
  const emptyHeaders: PgnHeaders = {}

  if (!pgn) return { root, headers: emptyHeaders }

  try {
    const games = parsePgn(pgn)
    if (!games.length) return { root, headers: emptyHeaders }

    const game = games[0]

    const startPosResult = startingPosition(game.headers)
    if (startPosResult.isErr) {
      console.error('Invalid starting position:', startPosResult.error)
      return { root, headers: emptyHeaders }
    }

    const startPos = startPosResult.value
    let currentMoveNumber = startPos.fullmoves

    function buildTree(
      sourceNode: Node<{ san: string; comments?: string[]; nags?: number[]; startingComments?: string[] }>,
      targetNode: GameNode,
      pos: Chess,
      parentNode: GameNode | null
    ): void {
      for (let i = 0; i < sourceNode.children.length; i++) {
        const sourceChild = sourceNode.children[i]
        const san = sourceChild.data.san

        const move = parseSan(pos, san)
        if (!move) {
          console.error(`Invalid move: ${san}`)
          continue
        }

        if (isDrop(move)) {
          console.error(`Drop moves not supported: ${san}`)
          continue
        }

        const fromSquare = makeSquare(move.from)
        const toSquare = makeSquare(move.to)
        const piece = pos.board.get(move.from)
        const captured = pos.board.get(move.to)
        const colorBefore = pos.turn
        const moveNumber = currentMoveNumber

        const newPos = pos.clone()
        newPos.play(move)

        if (colorBefore === 'black') {
          currentMoveNumber++
        }

        const augmentedData: AugmentedNodeData = {
          san,
          fen: makeFen(newPos.toSetup()),
          from: fromSquare,
          to: toSquare,
          piece: piece ? roleToChar(piece.role) : 'p',
          color: colorToShort(colorBefore),
          captured: captured ? roleToChar(captured.role) : undefined,
          promotion: move.promotion ? roleToChar(move.promotion) : undefined,
          clock: extractClock(sourceChild.data.comments),
          moveNumber,
          comments: sourceChild.data.comments,
          nags: sourceChild.data.nags,
          startingComments: sourceChild.data.startingComments,
          parent: targetNode,
        }

        const targetChild = new ChildNode<AugmentedNodeData>(augmentedData)
        targetNode.children.push(targetChild)

        const savedMoveNumber = currentMoveNumber
        buildTree(sourceChild, targetChild, newPos, targetNode)

        if (i < sourceNode.children.length - 1) {
          currentMoveNumber = savedMoveNumber
        }
      }
    }

    buildTree(game.moves, root, startPos.clone(), null)
    console.log('game.headers:', game.headers)

    return { root, headers: extractHeaders(game.headers) }
  } catch (error) {
    console.error('Error parsing PGN:', error)
  }

  return { root, headers: emptyHeaders }
}

/**
 * Get all moves in the main line as an ordered array (excludes the root node).
 */
export function getMoveList(root: GameNode): GameChildNode[] {
  return [...root.mainlineNodes()]
}

/**
 * Get legal moves for the given FEN position.
 * Returns a Map of from-square -> to-squares[], compatible with chessground's Dests type.
 */
export function getLegalMoves(fen: string): Map<string, string[]> {
  const dests: Map<string, string[]> = new Map()

  const setupResult = parseFen(fen)
  if (setupResult.isErr) {
    console.error('Invalid FEN:', setupResult.error)
    return dests
  }

  const posResult = Chess.fromSetup(setupResult.value)
  if (posResult.isErr) {
    console.error('Invalid position:', posResult.error)
    return dests
  }

  const pos = posResult.value

  for (const [from, squares] of pos.allDests()) {
    const fromSq = makeSquare(from)
    const toSquares: string[] = []
    for (const to of squares) {
      toSquares.push(makeSquare(to))
    }
    if (toSquares.length > 0) {
      dests.set(fromSq, toSquares)
    }
  }

  return dests
}

/** Check if the position described by the given FEN is in check. */
export function isInCheck(fen: string): boolean {
  const setupResult = parseFen(fen)
  if (setupResult.isErr) return false
  const posResult = Chess.fromSetup(setupResult.value)
  if (posResult.isErr) return false
  return posResult.value.isCheck()
}

/** Return whose turn it is from a FEN string. */
export function getTurn(fen: string): 'w' | 'b' {
  const setupResult = parseFen(fen)
  if (setupResult.isErr) return 'w'
  return colorToShort(setupResult.value.turn)
}

function getNodeFen(node: GameNode | GameChildNode): string {
  return isChildNode(node) ? node.data.fen : STARTING_FEN
}

function getNextMoveNumber(node: GameNode | GameChildNode): number {
  if (isChildNode(node)) {
    return node.data.color === 'b' ? node.data.moveNumber + 1 : node.data.moveNumber
  }
  return 1
}

/**
 * Add a move to the game tree from the given parent node.
 * Returns the resulting child node, or null if the move is illegal.
 * If the move already exists as a child it is returned without duplication.
 */
export function addMove(
  parentNode: GameNode | GameChildNode,
  orig: string,
  dest: string,
  promotion?: Role
): GameChildNode | null {
  const fen = getNodeFen(parentNode)

  const setupResult = parseFen(fen)
  if (setupResult.isErr) return null

  const posResult = Chess.fromSetup(setupResult.value)
  if (posResult.isErr) return null

  const pos = posResult.value

  const fromSq = parseSquare(orig)
  const toSq = parseSquare(dest)
  if (fromSq === undefined || toSq === undefined) return null

  const move = { from: fromSq, to: toSq, promotion }

  const san = makeSan(pos, move)
  if (!san) return null

  for (const child of parentNode.children) {
    if (child.data.san === san) return child
  }

  const piece = pos.board.get(fromSq)
  const captured = pos.board.get(toSq)
  const colorBefore = pos.turn
  const moveNumber = getNextMoveNumber(parentNode)

  const newPos = pos.clone()
  newPos.play(move)

  const augmentedData: AugmentedNodeData = {
    san,
    fen: makeFen(newPos.toSetup()),
    from: orig,
    to: dest,
    piece: piece ? roleToChar(piece.role) : 'p',
    color: colorToShort(colorBefore),
    captured: captured ? roleToChar(captured.role) : undefined,
    promotion: promotion ? roleToChar(promotion) : undefined,
    moveNumber,
    parent: parentNode,
  }

  const childNode = new ChildNode<AugmentedNodeData>(augmentedData)
  parentNode.children.push(childNode)

  return childNode
}
