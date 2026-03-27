import { onUnmounted, ref } from 'vue'
import { Api as ChessgroundApi } from 'chessground/api'
import { Config as ChessgroundConfig } from 'chessground/config'
import type { DrawShape } from 'chessground/draw'
import { Dests, Key } from 'chessground/types'
import { Chessground } from 'chessground'

/** Minimal move info needed for chessground display */
export interface LastMoveInfo {
  from: string
  to: string
}

export interface SyncBoardOptions {
  fen: string
  lastMove: LastMoveInfo | null
  turn: 'w' | 'b'
  inCheck: boolean
  legalMoves: Dests
  orientation?: 'white' | 'black'
  onMove?: (orig: Key, dest: Key) => void
  /** Arrow/shape overlays (e.g. for hovered eval move) */
  shapes?: DrawShape[]
}

export const useChessGrounds = () => {
  const chessgroundApi = ref<ChessgroundApi | null>(null)

  const attachToDom = (element: HTMLElement): void => {
    chessgroundApi.value = Chessground(element)
  }

  const createConfig = (options: SyncBoardOptions): ChessgroundConfig => {
    const turnColor = options.turn === 'w' ? 'white' : 'black'
    const shapes = options.shapes ?? []

    return {
      fen: options.fen,
      lastMove: options.lastMove
        ? [options.lastMove.from as Key, options.lastMove.to as Key]
        : undefined,
      turnColor,
      check: options.inCheck,
      orientation: options.orientation,
      movable: {
        free: false,
        color: turnColor,
        dests: options.legalMoves,
        events: {
          after: options.onMove
            ? (orig: Key, dest: Key) => options.onMove!(orig, dest)
            : undefined,
        },
      },
      drawable: {
        shapes,
        visible: true,
      },
    }
  }

  // Sync chessground with current position
  const syncBoard = (options: SyncBoardOptions): void => {
    if (!chessgroundApi.value) return

    const config = createConfig(options)
    chessgroundApi.value.set(config)
  }

  onUnmounted(() => {
    chessgroundApi.value?.destroy()
  })

  return {
    chessgroundApi,
    syncBoard,
    attachToDom,
  }
}
