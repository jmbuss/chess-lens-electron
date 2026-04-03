import type { WebContents } from 'electron'
import type { PushChannelName, PushPayload } from './types'

/**
 * Type-safe main-process push to a renderer WebContents.
 * Channel must be declared with a `push` shape in IpcChannels.
 */
export function pushToRenderer<K extends PushChannelName>(
  webContents: WebContents,
  channel: K,
  payload: PushPayload<K>,
): void {
  webContents.send(channel as string, payload)
}
