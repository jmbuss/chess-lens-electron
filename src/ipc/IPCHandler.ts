import type { IpcMainEvent } from 'electron'
import type { IpcRequest, IpcResponse } from './types'

/**
 * Base abstract class for all IPC handlers
 * Each handler extends this class and defines a static channel property
 *
 * @example
 * export class UserCreateHandler extends IpcHandler {
 *   static readonly channel = 'user:create'
 *
 *   async handle(event, request) {
 *     // implementation
 *   }
 * }
 */
export abstract class IpcHandler {
  /**
   * The IPC channel name - must be defined as a static property in subclasses
   * This allows accessing the channel without instantiating the handler
   */
  static readonly channel: string

  /**
   * Get the channel name this handler responds to
   * Reads from the static channel property
   */
  getChannel(): string {
    return (this.constructor as typeof IpcHandler).channel
  }

  /**
   * Handle an IPC request
   * @param event - The IPC event from Electron
   * @param request - The request data
   * @returns Promise that resolves to the response data
   */
  abstract handle(event: IpcMainEvent, request: IpcRequest): Promise<IpcResponse>
}
