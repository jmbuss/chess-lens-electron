import type { IpcChannels } from './handlers'

/**
 * Request structure for IPC calls
 */
export interface IpcRequest<T = any> {
  params?: T
  responseChannel?: string
}

/**
 * Response structure for IPC calls
 */
export interface IpcResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Type helper to extract channel names from IpcChannels
 */
export type ChannelName = keyof IpcChannels

/**
 * Type helper to extract request params for a channel
 */
export type ChannelRequest<T extends ChannelName> = IpcChannels[T] extends { request: infer R }
  ? R
  : never

/**
 * Type helper to extract response data for a channel
 */
export type ChannelResponse<T extends ChannelName> = IpcChannels[T] extends { response: infer R }
  ? R
  : never

/**
 * Channels that declare a `push` shape can be used with pushToRenderer / ipcService.onPush.
 * A push channel has no request/response — it is main-initiated, renderer-received only.
 */
export type PushChannelName = {
  [K in keyof IpcChannels]: IpcChannels[K] extends { push: any } ? K : never
}[keyof IpcChannels]

export type PushPayload<K extends PushChannelName> = IpcChannels[K] extends { push: infer P }
  ? P
  : never
