import { IpcMainEvent } from 'electron'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'
import { stopStockfish } from 'src/services/engine/manager'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'engine:stop': {
      request: undefined
      response: void
    }
  }
}

export class EngineStopHandler extends IpcHandler {
  static readonly channel = 'engine:stop' as const

  async handle(
    _event: IpcMainEvent,
    _request: IpcRequest<undefined>
  ): Promise<IpcResponse<void>> {
    try {
      stopStockfish()

      return {
        success: true,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
