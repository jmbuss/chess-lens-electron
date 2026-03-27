/**
 * Renderer-safe IPC exports
 * This file should be imported by renderer code instead of the main index.ts
 * to avoid pulling in electron/main-process dependencies
 */
import { IpcService } from './IPCService'

export const ipcService = new IpcService()

;(window as any).ipcService = ipcService

// Re-export types that are safe for renderer
export type { ChannelName, ChannelRequest, ChannelResponse } from './types'
