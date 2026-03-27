/**
 * Main process IPC exports
 *
 * WARNING: This file imports from 'electron' and should ONLY be used in the main process.
 * For renderer process code, import from './ipc/renderer' instead.
 */
import { IPCHandlerRegistry } from './IPCHandlerRegistry'

export const ipcHandlerRegistry = new IPCHandlerRegistry()
export { IPCHandlerRegistry } from './IPCHandlerRegistry'
export type { IpcHandler } from './IPCHandler'
export type { IpcRequest, IpcResponse } from './types'
export type { ChannelName, ChannelRequest, ChannelResponse } from './types'
