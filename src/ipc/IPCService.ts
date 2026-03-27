import type { IpcRequest, IpcResponse, ChannelName, ChannelRequest, ChannelResponse } from './types'

/**
 * Callback type for IPC event listeners
 */
export type IpcEventCallback<T = any> = (data: T) => void

// Electron API exposed via preload script
declare global {
  interface Window {
    electronAPI: {
      send: <T = any>(channel: string, request?: any) => Promise<T>
      emit: (channel: string, request?: any) => void
      on: (channel: string, callback: (event: any, ...args: any[]) => void) => void
      off: (channel: string, callback: (event: any, ...args: any[]) => void) => void
    }
  }
}

/**
 * Renderer process IPC service for making type-safe IPC calls
 * This is separate from the main process IpcService
 */
export class IpcService {
  // Store wrapped callbacks so we can properly remove them
  private callbackMap = new Map<IpcEventCallback, (event: any, data: any) => void>()

  /**
   * Send a request to the main process via IPC
   */
  async send<T extends ChannelName>(
    channel: T,
    request?: ChannelRequest<T>
  ): Promise<ChannelResponse<T>> {
    if (!window.electronAPI) {
      throw new Error('electronAPI is not available. Make sure the preload script is loaded.')
    }

    const ipcRequest: IpcRequest<ChannelRequest<T>> = {
      params: request,
    }

    const response = await window.electronAPI.send<IpcResponse<ChannelResponse<T>>>(
      channel,
      ipcRequest
    )

    if (!response.success) {
      throw new Error(response.error || 'IPC request failed')
    }

    return response.data!
  }

  /**
   * Fire-and-forget send — no awaited response.
   * Use for long-running operations where results arrive via a dedicated push channel.
   */
  emit<T extends ChannelName>(channel: T, request?: ChannelRequest<T>): void {
    if (!window.electronAPI) {
      throw new Error('electronAPI is not available. Make sure the preload script is loaded.')
    }

    const ipcRequest: IpcRequest<ChannelRequest<T>> = {
      params: request,
    }

    window.electronAPI.emit(channel, ipcRequest)
  }

  /**
   * Subscribe to events on a channel
   * @param channel - The channel to listen on
   * @param callback - Function called with the event data (not the raw IPC event)
   */
  on<T = any>(channel: string, callback: IpcEventCallback<T>): void {
    if (!window.electronAPI) {
      throw new Error('electronAPI is not available. Make sure the preload script is loaded.')
    }

    // Wrap the callback to strip the IPC event and just pass the data
    const wrappedCallback = (_event: any, data: T) => {
      callback(data)
    }

    // Store the mapping so we can remove it later
    this.callbackMap.set(callback, wrappedCallback)

    window.electronAPI.on(channel, wrappedCallback)
  }

  /**
   * Unsubscribe from events on a channel
   * @param channel - The channel to stop listening on
   * @param callback - The same callback function passed to `on()`
   */
  off<T = any>(channel: string, callback: IpcEventCallback<T>): void {
    if (!window.electronAPI) {
      return
    }

    // Get the wrapped callback we stored
    const wrappedCallback = this.callbackMap.get(callback)
    if (wrappedCallback) {
      window.electronAPI.off(channel, wrappedCallback)
      this.callbackMap.delete(callback)
    }
  }
}

// Export singleton instance
export const ipc = new IpcService()
