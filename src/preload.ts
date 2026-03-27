import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

/**
 * Expose protected methods that allow the renderer process to use
 * the ipcRenderer without exposing the entire object
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Send an IPC request and return a promise that resolves when the response arrives
   * Uses custom response channels for promise-based communication
   */
  send: <T = any>(channel: string, request?: any): Promise<T> => {
    // Generate a unique response channel if not provided
    if (!request || !request.responseChannel) {
      const responseChannel = `${channel}_response_${Date.now()}_${Math.random()}`
      if (!request) {
        request = { responseChannel }
      } else {
        request.responseChannel = responseChannel
      }
    }

    const { responseChannel } = request

    // Send the request
    ipcRenderer.send(channel, request)

    // Return a promise that resolves when the response arrives on the custom channel
    return new Promise((resolve, reject) => {
      // Use 'once' to only listen for this specific response
      ipcRenderer.once(responseChannel, (_, response: T) => {
        resolve(response)
      })

      // Timeout for IPC requests (5 minutes for engine analysis)
      setTimeout(() => {
        ipcRenderer.removeAllListeners(responseChannel)
        reject(new Error(`IPC request to ${channel} timed out`))
      }, 300000)
    })
  },

  /**
   * Fire-and-forget send — no response channel, no awaited promise.
   * Use for long-running operations where results arrive via a push channel.
   */
  emit: (channel: string, request?: any): void => {
    ipcRenderer.send(channel, request ?? {})
  },

  /**
   * Subscribe to events on a channel
   */
  on: (channel: string, callback: (event: IpcRendererEvent, ...args: any[]) => void) => {
    ipcRenderer.on(channel, callback)
  },

  /**
   * Unsubscribe from events on a channel
   */
  off: (channel: string, callback: (event: IpcRendererEvent, ...args: any[]) => void) => {
    ipcRenderer.off(channel, callback)
  },
})
