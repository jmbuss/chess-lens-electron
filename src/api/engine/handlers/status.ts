import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import { getEngineManager } from 'src/services/engine/manager'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'engine:status': {
      request: undefined
      response: Record<string, string>
    }
  }
}

export class EngineStatusHandler extends IpcHandler {
  static readonly channel = 'engine:status' as const

  async handle(
    _event: IpcMainEvent,
    _request: IpcRequest<undefined>
  ): Promise<IpcResponse<Record<string, string>>> {
    try {
      const manager = getEngineManager()
      const status = manager.getStatus()

      return {
        success: true,
        data: status,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
