import { computed, MaybeRef, ref, shallowRef, toValue, watch, markRaw } from 'vue'
import {
  parseGameTree,
  getMoveList,
  getLegalMoves,
  isInCheck,
  getTurn,
  addMove,
} from 'src/utils/chess/GameTree'
import { findNodeForFen } from 'src/utils/chess/gameTreeFindByFen'
import { useChessGame } from 'src/renderer/composables/chessGame/useChessGame'
import { useQuery } from '@tanstack/vue-query'
import { queryClient } from 'src/renderer/query/queryClient'
import type { GameNode, GameChildNode, PgnHeaders } from './types'
import type { Dests, Key } from 'chessground/types'
import { isChildNode } from 'chessops/pgn'

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export const useGameTree = ({
  gameId,
  initialFen: _initialFen,
}: {
  gameId: MaybeRef<string>
  /** Initial position to navigate to on first load (e.g. route `?fen=`). */
  initialFen?: MaybeRef<string | null | undefined>
}) => {
  const { chessGame } = useChessGame({ gameId })

  // Query to parse and cache the game tree structure
  const queryKey = computed(() => ['gameTree', toValue(gameId), chessGame.value?.pgn] as const)
  const {
    data: gameTree,
    isLoading,
    isError,
  } = useQuery(
    {
      queryKey,
      queryFn: ({ queryKey }) => {
        const [, , pgn] = queryKey
        const { root, headers } = parseGameTree(pgn ?? '')
        // Mark the tree as raw to allow direct mutations (for adding variations)
        console.log('parseGameTree', root, headers)
        return markRaw({ root, headers })
      },
      enabled: computed(() => !!chessGame.value?.pgn),
    },
    queryClient
  )

  const root = computed(() => gameTree.value?.root ?? null)
  const headers = computed<PgnHeaders>(() => gameTree.value?.headers ?? {})

  // Reactive navigation state
  // Can be either the root node (before any moves) or a child node (after a move)
  const currentNode = shallowRef<GameNode | GameChildNode | null>(null)

  // Helper to check if current node is a child node (has move data)
  const isCurrentChildNode = computed(() => {
    return currentNode.value !== null && isChildNode(currentNode.value)
  })

  // Computed properties for navigation state
  const canGoBack = computed(() => {
    if (!currentNode.value) return false
    // If it's a child node, check its parent reference in data
    if (isChildNode(currentNode.value)) {
      return currentNode.value.data.parent !== null
    }
    // Root node can't go back
    return false
  })

  const canGoForward = computed(() => {
    if (!currentNode.value) return false
    return currentNode.value.children.length > 0
  })

  const moveList = computed(() => {
    if (!root.value) return []
    return getMoveList(root.value as GameNode)
  })

  // Current position info
  const currentFen = computed(() => {
    if (!currentNode.value) return STARTING_FEN
    // If it's a child node, get FEN from data
    if (isChildNode(currentNode.value)) {
      return currentNode.value.data.fen
    }
    // Root node - return starting FEN
    return STARTING_FEN
  })

  const currentMove = computed(() => {
    if (!currentNode.value) return null
    // If it's a child node, return move data
    if (isChildNode(currentNode.value)) {
      return {
        san: currentNode.value.data.san,
        from: currentNode.value.data.from,
        to: currentNode.value.data.to,
        piece: currentNode.value.data.piece,
        color: currentNode.value.data.color,
        captured: currentNode.value.data.captured,
        promotion: currentNode.value.data.promotion,
      }
    }
    // Root node has no move
    return null
  })

  const legalMoves = computed<Dests>(() => {
    if (!currentFen.value) return new Map()
    return getLegalMoves(currentFen.value)
  })

  const inCheck = computed(() => (currentFen.value ? isInCheck(currentFen.value) : false))
  const turn = computed(() => (currentFen.value ? getTurn(currentFen.value) : 'w'))

  // Navigation methods
  const goForward = (): boolean => {
    if (!currentNode.value || currentNode.value.children.length === 0) return false
    // Move to first child (main line)
    currentNode.value = currentNode.value.children[0]
    return true
  }

  const goBack = (): boolean => {
    if (!currentNode.value) return false
    // If it's a child node, go to parent
    if (isChildNode(currentNode.value) && currentNode.value.data.parent) {
      currentNode.value = currentNode.value.data.parent
      return true
    }
    return false
  }

  const goToStart = (): void => {
    if (root.value) {
      currentNode.value = root.value as GameNode
    }
  }

  const goToEnd = (): void => {
    if (!currentNode.value) return
    // Use the end() method from chessops Node class
    currentNode.value = currentNode.value.end()
  }

  const goToNode = (node: GameNode | GameChildNode): void => {
    currentNode.value = node
  }

  const goToFen = (targetFen: string): boolean => {
    const r = root.value
    if (!r) return false
    const node = findNodeForFen(r, headers.value, targetFen)
    if (!node) return false
    currentNode.value = node
    return true
  }

  /** Normalized deep-link FEN from route (or other MaybeRef). */
  const resolvedInitialFen = computed(() => {
    const v = toValue(_initialFen)
    if (v == null || typeof v !== 'string') return null
    const t = v.trim()
    return t.length > 0 ? t : null
  })

  // When `?fen=` changes for the same game, jump to the new position. First load is still handled
  // by the `root` watcher below (`initialFenConsumed`); this watch is intentionally not `immediate`.
  watch(resolvedInitialFen, fen => {
    if (!root.value) return
    if (fen) {
      goToFen(fen)
    } else {
      goToStart()
    }
  })

  // Tracks whether the initialFen deep-link has been applied for the current game.
  // Reset when gameId changes so the deep-link applies fresh to each new game session.
  const initialFenConsumed = ref(false)

  watch(
    () => toValue(gameId),
    () => {
      initialFenConsumed.value = false
    },
    { immediate: true },
  )

  watch(
    root,
    newRoot => {
      if (!newRoot) {
        currentNode.value = null
        return
      }

      if (!initialFenConsumed.value) {
        // First load for this gameId: apply the deep-link position, then never re-apply it
        initialFenConsumed.value = true
        currentNode.value = newRoot
        const deep = toValue(_initialFen)
        if (deep) goToFen(deep)
        return
      }

      // Tree replaced for same game (e.g. after saving a variation): restore current position
      const fenToRestore =
        currentNode.value && isChildNode(currentNode.value) ? currentNode.value.data.fen : null
      currentNode.value = newRoot
      if (fenToRestore) goToFen(fenToRestore)
    },
    { immediate: true },
  )

  const makeMove = (orig: Key, dest: Key): GameChildNode | null => {
    if (!currentNode.value) return null
    // Try without promotion first, then with queen promotion as fallback
    // (handles pawn reaching the 8th rank -- a promotion picker UI can be added later)
    let resultNode = addMove(currentNode.value, orig, dest)
    if (!resultNode) {
      resultNode = addMove(currentNode.value, orig, dest, 'queen')
    }
    if (!resultNode) return null
    currentNode.value = resultNode
    return resultNode
  }

  return {
    // Tree structure
    root,
    headers,
    currentNode,
    moveList,

    // Navigation state
    canGoBack,
    canGoForward,
    isCurrentChildNode,

    // Position info
    currentFen,
    currentMove,
    legalMoves,
    inCheck,
    turn,

    // Navigation methods
    goForward,
    goBack,
    goToStart,
    goToEnd,
    goToNode,
    goToFen,

    // Move input
    makeMove,

    // Loading state
    isLoading,
    isError,
  }
}
