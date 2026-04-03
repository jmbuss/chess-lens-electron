import { EventEmitter } from 'node:events'
import type { EventChannels } from './channels'

export class EventBus {
  private emitter = new EventEmitter()

  on<K extends keyof EventChannels & string>(
    event: K,
    handler: (payload: EventChannels[K]) => void,
  ): void {
    this.emitter.on(event, handler as (...args: unknown[]) => void)
  }

  off<K extends keyof EventChannels & string>(
    event: K,
    handler: (payload: EventChannels[K]) => void,
  ): void {
    this.emitter.off(event, handler as (...args: unknown[]) => void)
  }

  emit<K extends keyof EventChannels & string>(
    event: K,
    payload: EventChannels[K],
  ): void {
    this.emitter.emit(event, payload)
  }
}
