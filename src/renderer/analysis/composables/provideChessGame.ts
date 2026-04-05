import { useChessGame } from 'src/renderer/composables/chessGame/useChessGame'
import { inject, MaybeRef, provide } from 'vue'
import { useChessGrounds } from './useChessGrounds'
import { useGameTree } from './useGameTree'
import { createGameNavigator, GameNavigator } from './useChessGameNavigator'
import type { GameChildNode } from './types'

const gameNavigatorSymbol = Symbol('gameNavigator')

// Internal symbols - not exposed for direct use
const gameTreeSymbol = Symbol('gameTree')
const chessgroundsSymbol = Symbol('chessgrounds')
const chessGameSymbol = Symbol('chessGame')

export const provideChessGame = ({
  gameId,
  initialFen,
  onVariationPlayed,
}: {
  gameId: MaybeRef<string>
  initialFen?: MaybeRef<string | null | undefined>
  onVariationPlayed?: (parentFen: string, newNode: GameChildNode) => void
}) => {
  const chessGame = useChessGame({ gameId })
  const chessgrounds = useChessGrounds()
  const gameTree = useGameTree({ gameId, initialFen })

  // Create the game navigator which is the main public API
  const gameNavigator = createGameNavigator({ chessGame, chessgrounds, gameTree, onVariationPlayed })

  // Provide the navigator as the primary API
  provide(gameNavigatorSymbol, gameNavigator)

  // Still provide internals for components that need direct access
  provide(gameTreeSymbol, gameTree)
  provide(chessgroundsSymbol, chessgrounds)
  provide(chessGameSymbol, chessGame)

  return {
    gameNavigator,
    gameTree,
    chessgrounds,
    chessGame,
  }
}

/**
 * Main public API for game navigation and board interaction.
 * Use this for all UX interactions.
 */
export const useInjectedGameNavigator = (): GameNavigator => {
  const gameNavigator = inject<GameNavigator>(gameNavigatorSymbol)
  if (!gameNavigator) {
    throw new Error(
      'Game navigator not found. Make sure provideChessGame() is called in a parent component.'
    )
  }
  return gameNavigator
}

/**
 * @internal Direct access to game tree state. Prefer useInjectedGameNavigator() for most use cases.
 */
export const useInjectedGameTree = () => {
  const gameTree = inject<ReturnType<typeof useGameTree>>(gameTreeSymbol)
  if (!gameTree) {
    throw new Error('Game tree not found')
  }
  return gameTree
}

/**
 * @internal Direct access to chessground. Prefer useInjectedGameNavigator() for most use cases.
 */
export const useInjectedChessGrounds = () => {
  const chessgrounds = inject<ReturnType<typeof useChessGrounds>>(chessgroundsSymbol)
  if (!chessgrounds) {
    throw new Error('Chessground API not found')
  }
  return chessgrounds
}

/**
 * @internal Direct access to chess game data. Prefer useInjectedGameNavigator() for most use cases.
 */
export const useInjectedChessGame = () => {
  const chessGame = inject<ReturnType<typeof useChessGame>>(chessGameSymbol)
  if (!chessGame) {
    throw new Error('Chess game not found')
  }
  return chessGame
}
