// composables/useGameNavigator.ts
import { computed, ref, watch } from 'vue'
import { usePlatforms } from 'src/renderer/composables/platforms/usePlatforms'
import type { useChessGame } from 'src/renderer/composables/chessGame/useChessGame'
import type { useChessGrounds } from './useChessGrounds'
import type { useGameTree } from './useGameTree'
import type { GameNode, GameChildNode } from './types'
import type { Key } from 'chessground/types'

interface CreateGameNavigatorOptions {
  chessGame: ReturnType<typeof useChessGame>
  chessgrounds: ReturnType<typeof useChessGrounds>
  gameTree: ReturnType<typeof useGameTree>
  /** Called whenever a move is played on the board that results in a new tree node. */
  onVariationPlayed?: (parentFen: string, newNode: GameChildNode) => void
}

export const createGameNavigator = ({
  chessGame,
  chessgrounds,
  gameTree,
  onVariationPlayed,
}: CreateGameNavigatorOptions) => {
  const { chessGame: chessGameData, isChessGameLoading, isChessGameError } = chessGame
  const { getPlatformNameForGame } = usePlatforms()

  const {
    root,
    currentNode,
    currentFen,
    currentMove,
    legalMoves,
    inCheck,
    turn,
    moveList,
    canGoBack,
    canGoForward,
    goForward: gameTreeGoForward,
    goBack: gameTreeGoBack,
    goToStart: gameTreeGoToStart,
    goToEnd: gameTreeGoToEnd,
    goToNode: gameTreeGoToNode,
    makeMove: gameTreeMakeMove,
    isLoading: isGameTreeLoading,
    isError: isGameTreeError,
  } = gameTree

  const username = computed(() => {
    return getPlatformNameForGame(chessGameData)
  })

  // Default orientation based on which color the user played
  const defaultOrientation = computed<'white' | 'black'>(() => {
    return chessGameData.value?.white.username === username.value ? 'white' : 'black'
  })

  // Manual orientation override (null means use default)
  const orientationOverride = ref<'white' | 'black' | null>(null)

  // Actual orientation to use
  const orientation = computed<'white' | 'black'>(() => {
    return orientationOverride.value ?? defaultOrientation.value
  })

  const { syncBoard: syncChessgroundsBoard, attachToDom: attachChessgroundsToDom } = chessgrounds

  /** When set, an arrow is drawn on the board for this move (e.g. from engine line hover). */
  const hoveredEvalMove = ref<{ from: Key; to: Key } | null>(null)

  // Handle a move made on the chessground board
  const handleBoardMove = (orig: Key, dest: Key) => {
    const parentFen = currentFen.value
    const newNode = gameTreeMakeMove(orig, dest)
    if (newNode && onVariationPlayed) {
      onVariationPlayed(parentFen, newNode)
    }
  }

  // Sync board whenever current position or hovered eval move changes
  const syncBoard = () => {
    if (!currentFen.value) return

    const move = hoveredEvalMove.value
    const shapes = move ? [{ orig: move.from, dest: move.to, brush: 'green' }] : []

    syncChessgroundsBoard({
      fen: currentFen.value,
      lastMove: currentMove.value,
      turn: turn.value,
      inCheck: inCheck.value,
      legalMoves: legalMoves.value,
      orientation: orientation.value,
      onMove: handleBoardMove,
      shapes,
    })
  }

  // Watch for position changes and sync the board
  watch(currentNode, () => {
    syncBoard()
  })

  // Also sync when orientation changes
  watch(orientation, () => {
    syncBoard()
  })

  // Sync when hovered eval move changes (show/hide arrow)
  watch(hoveredEvalMove, () => {
    syncBoard()
  })

  const attachToDom = (element: HTMLElement) => {
    attachChessgroundsToDom(element)
    syncBoard()
  }

  // Navigation methods that sync the board
  const goForward = (): boolean => {
    return gameTreeGoForward()
  }

  const goBack = (): boolean => {
    return gameTreeGoBack()
  }

  const goToStart = (): void => {
    gameTreeGoToStart()
  }

  const goToEnd = (): void => {
    gameTreeGoToEnd()
  }

  const goToNode = (node: GameNode | GameChildNode): void => {
    gameTreeGoToNode(node)
  }

  // Flip the board orientation
  const flipBoard = (): void => {
    orientationOverride.value = orientation.value === 'white' ? 'black' : 'white'
  }

  // Reset orientation to default (based on user's color)
  const resetOrientation = (): void => {
    orientationOverride.value = null
  }

  return {
    chessGame: chessGameData,
    chessgrounds,
    username,
    orientation,

    /** Ref for hovered engine-line move; when set, board shows an arrow. */
    hoveredEvalMove,

    // Tree structure
    root,

    // Position state
    currentNode,
    currentFen,
    currentMove,
    legalMoves,
    inCheck,
    turn,
    moveList,

    // Navigation state
    canGoBack,
    canGoForward,

    // Navigation methods
    goForward,
    goBack,
    goToStart,
    goToEnd,
    goToNode,

    // Board controls
    flipBoard,
    resetOrientation,
    attachToDom,

    // Loading state
    isLoading: computed(() => isChessGameLoading.value || isGameTreeLoading.value),
    isError: computed(() => isChessGameError.value || isGameTreeError.value),
  }
}

export type GameNavigator = ReturnType<typeof createGameNavigator>
