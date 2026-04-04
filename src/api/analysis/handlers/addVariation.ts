import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import { GameAnalysisModel } from 'src/database/analysis/GameAnalysisModel'
import type { AnalysisNode, GameFSMState } from 'src/database/analysis/types'
import type { AnalysisOrchestrator } from 'src/services/analysis/AnalysisOrchestrator'

interface AddVariationParams {
  gameId: string
  parentFen: string
  fen: string
  uciMove: string
  san: string
  from: string
  to: string
  piece: string
  color: 'w' | 'b'
  captured?: string
  promotion?: string
  moveNumber: number
}

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:addVariation': {
      request: AddVariationParams
      response: { nodeId: number; isNew: boolean }
    }
    /**
     * Pushed when a variation node is added to the analysis tree.
     * The node starts with fsmState = 'UNANALYZED'; a subsequent node-update
     * will arrive once the coordinator processes it.
     */
    'analysis:node-added': {
      request: never
      response: {
        gameId: string
        parentFen: string
        node: Omit<AnalysisNode, 'children'>
        gameFsmState: GameFSMState
      }
    }
  }
}

function findNodeByFen(root: AnalysisNode, fen: string): AnalysisNode | null {
  if (root.fen === fen) return root
  for (const child of root.children) {
    const found = findNodeByFen(child, fen)
    if (found) return found
  }
  return null
}

export class AddVariationHandler extends IpcHandler {
  static readonly channel = 'analysis:addVariation' as const

  constructor(
    private db: Database.Database,
    private orchestrator: AnalysisOrchestrator,
  ) {
    super()
  }

  async handle(
    event: IpcMainEvent,
    request: IpcRequest<AddVariationParams>,
  ): Promise<IpcResponse<{ nodeId: number; isNew: boolean }>> {
    const p = request.params
    if (!p?.gameId || !p.parentFen || !p.fen || !p.uciMove) {
      return { success: false, error: 'gameId, parentFen, fen, and uciMove are required' }
    }

    const state = GameAnalysisModel.findByGameId(this.db, p.gameId)
    if (!state?.tree) {
      return { success: false, error: `No analysis found for game ${p.gameId}` }
    }

    const parent = findNodeByFen(state.tree, p.parentFen)
    if (!parent) {
      return { success: false, error: `Parent node not found for FEN: ${p.parentFen}` }
    }

    // Idempotent — return the existing node if this move is already in the tree.
    const existing = parent.children.find(c => c.uciMove === p.uciMove)
    if (existing) {
      return { success: true, data: { nodeId: existing.id, isNew: false } }
    }

    const nodeId = state.nextId++
    const newNode: AnalysisNode = {
      id: nodeId,
      ply: parent.ply + 1,
      fen: p.fen,
      uciMove: p.uciMove,
      san: p.san,
      from: p.from,
      to: p.to,
      piece: p.piece,
      color: p.color,
      captured: p.captured,
      promotion: p.promotion,
      moveNumber: p.moveNumber,
      fsmState: 'UNANALYZED',
      children: [],
    }

    parent.children.push(newNode)
    GameAnalysisModel.save(this.db, state)

    if (!event.sender.isDestroyed()) {
      const { children: _children, ...nodeWithoutChildren } = newNode
      event.sender.send('analysis:node-added', {
        success: true,
        data: {
          gameId: p.gameId,
          parentFen: p.parentFen,
          node: nodeWithoutChildren,
          gameFsmState: state.gameFsmState,
        },
      })
    }

    // Inject the new node into the machine's context tree AND navigate to it
    // atomically. Using plain navigate() would fail because the machine's
    // in-memory tree is a separate copy that does not yet contain newNode.
    this.orchestrator.getActiveCoordinator(p.gameId)?.insertNode(parent.id, newNode, state.nextId)

    return { success: true, data: { nodeId, isNew: true } }
  }
}
