import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { parseSquare } from 'chessops/util'
import type { Color } from 'chessops/types'
import { findOpening } from '@chess-openings/eco.json'
import type { Opening } from '@chess-openings/eco.json'
import { parseGameTree, getMoveList } from 'src/utils/chess/GameTree'
import { getOpeningBookSingleton } from 'src/utils/chess/openingBook'

const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export interface PhaseResult {
  /** Derived phase category */
  phase: 'opening' | 'middlegame' | 'endgame'
  /** Composite phase score: 128 = pure opening, 64 = middlegame baseline, 0 = pure endgame */
  phaseScore: number
  /** Normalized opening likelihood: 0–1 */
  openingScore: number
  /** Normalized middlegame likelihood: 0–1 */
  middlegameScore: number
  /** Normalized endgame likelihood: 0–1 */
  endgameScore: number
  /** ECO opening if this position is still in the opening book, null otherwise */
  ecoMatch: Opening | null
}

/**
 * Parse a FEN into a chessops Chess position. Returns null on invalid FEN.
 */
function posFromFen(fen: string): Chess | null {
  const setupResult = parseFen(fen)
  if (setupResult.isErr) return null
  const posResult = Chess.fromSetup(setupResult.value)
  if (posResult.isErr) return null
  return posResult.value
}

/**
 * Compute the Stockfish-style material phase score from a chessops position.
 * Scale: 128 = full material (opening/middlegame), 0 = no non-pawn material (pure endgame).
 *
 * Piece weights: knight=1, bishop=1, rook=2, queen=4 (max total = 24)
 * Formula: floor((phase * 128 + 12) / 24)
 */
function computeMaterialPhase(pos: Chess): number {
  const countPieces = (color: Color, role: 'knight' | 'bishop' | 'rook' | 'queen') =>
    pos.board.pieces(color, role).size()

  const knights = countPieces('white', 'knight') + countPieces('black', 'knight')
  const bishops = countPieces('white', 'bishop') + countPieces('black', 'bishop')
  const rooks   = countPieces('white', 'rook')   + countPieces('black', 'rook')
  const queens  = countPieces('white', 'queen')  + countPieces('black', 'queen')

  let phase = knights * 1 + bishops * 1 + rooks * 2 + queens * 4
  phase = Math.min(phase, 24)
  return Math.floor((phase * 128 + 12) / 24)
}

/**
 * Count minor pieces (knights + bishops) still on their starting squares.
 * White home squares: b1, g1, c1, f1  |  Black home squares: b8, g8, c8, f8
 * Returns 0–8.
 */
function countUndevelopedMinors(pos: Chess): number {
  const board = pos.board
  let count = 0

  const check = (sq: string, color: Color, role: 'knight' | 'bishop') => {
    const piece = board.get(parseSquare(sq)!)
    if (piece?.color === color && piece?.role === role) count++
  }

  check('b1', 'white', 'knight')
  check('g1', 'white', 'knight')
  check('c1', 'white', 'bishop')
  check('f1', 'white', 'bishop')
  check('b8', 'black', 'knight')
  check('g8', 'black', 'knight')
  check('c8', 'black', 'bishop')
  check('f8', 'black', 'bishop')

  return count
}

/**
 * Determine whether each side has castled by checking if the king is on a
 * post-castling square (g1/c1 for white, g8/c8 for black).
 */
function getCastlingState(pos: Chess): { whiteCastled: boolean; blackCastled: boolean } {
  const board = pos.board

  const isKingOn = (sq: string, color: Color) => {
    const piece = board.get(parseSquare(sq)!)
    return piece?.color === color && piece?.role === 'king'
  }

  return {
    whiteCastled: isKingOn('g1', 'white') || isKingOn('c1', 'white'),
    blackCastled: isKingOn('g8', 'black') || isKingOn('c8', 'black'),
  }
}

/** Return true when neither side has any queens remaining. */
function noQueensOnBoard(pos: Chess): boolean {
  return pos.board.pieces('white', 'queen').isEmpty() &&
         pos.board.pieces('black', 'queen').isEmpty()
}

/**
 * Derive three normalized per-phase scores from the raw 0–128 phaseScore.
 */
function deriveNormalizedScores(phaseScore: number): {
  openingScore: number
  middlegameScore: number
  endgameScore: number
} {
  return {
    openingScore:    phaseScore > 64 ? (phaseScore - 64) / 64 : 0,
    middlegameScore: 1 - Math.abs(phaseScore - 64) / 64,
    endgameScore:    phaseScore < 64 ? (64 - phaseScore) / 64 : 0,
  }
}

/**
 * Compute a composite phase score (0–128) blending opening and endgame signals.
 *
 * Score interpretation:
 *   128 = strongly opening   (score ≥ 96  → 'opening')
 *    64 = pure middlegame    (32 ≤ score < 96 → 'middlegame')
 *     0 = strongly endgame   (score < 32  → 'endgame')
 */
function computePhaseScore(
  pos: Chess,
  ecoMatch: Opening | null,
  ply: number,
): { phase: 'opening' | 'middlegame' | 'endgame'; phaseScore: number } {
  const materialPhase = computeMaterialPhase(pos)
  const undeveloped   = countUndevelopedMinors(pos)
  const castling      = getCastlingState(pos)
  const queensOff     = noQueensOnBoard(pos)
  const materialRatio = materialPhase / 128

  // Opening pull (0.0–1.0)
  let opening = 0.0
  if (ecoMatch !== null)       opening += 0.40
  if (undeveloped >= 6)        opening += 0.30
  else if (undeveloped >= 4)   opening += 0.20
  else if (undeveloped >= 2)   opening += 0.10
  if (!castling.whiteCastled)  opening += 0.10
  if (!castling.blackCastled)  opening += 0.10
  if (ply < 12)                opening += 0.10
  opening = Math.max(0, Math.min(1, opening))

  // Endgame pull (0.0–1.0)
  let endgame = 0.0
  if (materialRatio < 0.3)       endgame += 0.50
  else if (materialRatio < 0.5)  endgame += 0.30
  else if (materialRatio < 0.7)  endgame += 0.10
  if (queensOff)                 endgame += 0.30
  if (undeveloped === 0)         endgame += 0.10
  if (castling.whiteCastled && castling.blackCastled) endgame += 0.10
  endgame = Math.max(0, Math.min(1, endgame))

  const phaseScore = Math.max(0, Math.min(128, Math.round(64 + opening * 64 - endgame * 64)))

  let phase: 'opening' | 'middlegame' | 'endgame'
  if (phaseScore >= 96)      phase = 'opening'
  else if (phaseScore >= 32) phase = 'middlegame'
  else                       phase = 'endgame'

  return { phase, phaseScore }
}

/**
 * Classifies a single position into a PhaseResult.
 * Used by the per-position pipeline (positionMachine FEATURES branch).
 */
export class PhaseClassificationService {
  async classifyPosition(fen: string, ply: number): Promise<PhaseResult> {
    const { book, positionBook } = await getOpeningBookSingleton()
    const ecoMatch = findOpening(book, fen, positionBook) ?? null
    const pos = posFromFen(fen)

    if (!pos) {
      return {
        phase: 'middlegame',
        phaseScore: 64,
        openingScore: 0,
        middlegameScore: 1,
        endgameScore: 0,
        ecoMatch: null,
      }
    }

    const { phase, phaseScore } = computePhaseScore(pos, ecoMatch, ply)
    const { openingScore, middlegameScore, endgameScore } = deriveNormalizedScores(phaseScore)

    return { phase, phaseScore, openingScore, middlegameScore, endgameScore, ecoMatch }
  }

  /**
   * Classifies each position in a game's mainline into a phase result.
   * Kept for reference but no longer called by the analysis pipeline.
   */
  async classifyGame(pgn: string): Promise<PhaseResult[]> {
    const { book, positionBook } = await getOpeningBookSingleton()

    const { root } = parseGameTree(pgn)
    const mainline = getMoveList(root)

    const fens: string[] = [
      STANDARD_START_FEN,
      ...mainline.map(node => node.data.fen),
    ]

    return fens.map((fen, ply) => {
      const ecoMatch = findOpening(book, fen, positionBook) ?? null
      const pos = posFromFen(fen)

      if (!pos) {
        return {
          phase: 'middlegame' as const,
          phaseScore: 64,
          openingScore: 0,
          middlegameScore: 1,
          endgameScore: 0,
          ecoMatch: null,
        }
      }

      const { phase, phaseScore } = computePhaseScore(pos, ecoMatch, ply)
      const { openingScore, middlegameScore, endgameScore } = deriveNormalizedScores(phaseScore)

      return { phase, phaseScore, openingScore, middlegameScore, endgameScore, ecoMatch }
    })
  }
}
