/**
 * Main process IPC exports
 * This file should be imported by main process code only
 */
import { IPCHandlerRegistry } from './IPCHandlerRegistry'

export const ipcHandlerRegistry = new IPCHandlerRegistry()

// Re-export main process utilities
export { IPCHandlerRegistry } from './IPCHandlerRegistry'
export type { IpcHandler } from './IPCHandler'
export type { IpcRequest, IpcResponse } from './types'
export type { ChannelName, ChannelRequest, ChannelResponse } from './types'
