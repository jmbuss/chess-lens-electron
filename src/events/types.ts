import type { EventChannels } from './channels'

export type EventName = keyof EventChannels
export type EventPayload<K extends EventName> = EventChannels[K]
