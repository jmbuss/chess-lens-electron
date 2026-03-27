import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import { GameCoordinatorRegistry } from '../GameCoordinatorRegistry'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'analysis:studyPosition': {
      request: { gameId: string; nodeId: number }
      response: { queued: boolean }
    }
  }
}

export class StudyPositionHandler extends IpcHandler {
  static readonly channel = 'analysis:studyPosition' as const

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ gameId: string; nodeId: number }>,
  ): Promise<IpcResponse<{ queued: boolean }>> {
    const p = request.params
    if (!p?.gameId || p.nodeId == null) {
      return { success: false, error: 'gameId and nodeId are required' }
    }

    const coordinator = GameCoordinatorRegistry.get(p.gameId)
    if (!coordinator) {
      return { success: true, data: { queued: false } }
    }

    coordinator.navigate(p.nodeId)
    return { success: true, data: { queued: true } }
  }
}
