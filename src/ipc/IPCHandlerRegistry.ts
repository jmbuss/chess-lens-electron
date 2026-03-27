import { ipcMain, type IpcMainEvent } from 'electron'
import type { IpcHandler } from './IPCHandler'
import type { IpcRequest, IpcResponse } from './types'

/**
 * Main process IPC service that registers and manages IPC handlers
 * Uses custom response channels for promise-based communication
 */
export class IPCHandlerRegistry {
  private handlers: Map<string, IpcHandler> = new Map()

  /**
   * Register one or more IPC handlers
   */
  registerHandlers(...handlers: IpcHandler[]): void {
    for (const handler of handlers) {
      const channel = handler.getChannel()

      if (this.handlers.has(channel)) {
        console.warn(`Handler for channel "${channel}" already exists, overwriting...`)
        // Remove old listener
        ipcMain.removeAllListeners(channel)
      }

      this.handlers.set(channel, handler)

      // Register the handler with ipcMain using 'on' instead of 'handle'
      // This allows us to use custom response channels
      ipcMain.on(channel, async (event: IpcMainEvent, request: IpcRequest) => {
        try {
          const response = await handler.handle(event, request)

          if (request.responseChannel) {
            event.sender.send(request.responseChannel, response)
          }
        } catch (error) {
          console.error(`Error handling IPC channel "${channel}":`, error)
          if (request.responseChannel) {
            event.sender.send(request.responseChannel, {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            } as IpcResponse)
          }
        }
      })
    }
  }

  /**
   * Unregister a handler by channel name
   */
  unregisterHandler(channel: string): void {
    if (this.handlers.has(channel)) {
      ipcMain.removeAllListeners(channel)
      this.handlers.delete(channel)
    }
  }

  /**
   * Get all registered channel names
   */
  getRegisteredChannels(): string[] {
    return Array.from(this.handlers.keys())
  }
}
