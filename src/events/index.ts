import { EventBus } from './EventBus'

export const eventBus = new EventBus()
export { EventBus } from './EventBus'
export type { EventChannels } from './channels'
export type { EventName, EventPayload } from './types'
