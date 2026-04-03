import type Database from 'better-sqlite3'
import type { WebContents } from 'electron'
import type { EventBus } from '../../events'
import { syncWorkerManager } from './worker'
import { PlatformAccountModel } from '../../database/platform-account'
import type { SyncPlatform } from '../../database/sync'
import { pushToRenderer } from '../../ipc/push'
import '../../events/app'
import '../../api/sync/handlers'

export class SyncCoordinator {
  constructor(
    private db: Database.Database,
    private bus: EventBus,
    private webContents: WebContents,
  ) {
    this.bus.on('app:started', () => void this.runInitialSync())
  }

  private async runInitialSync(): Promise<void> {
    const accounts = PlatformAccountModel.findAll(this.db)

    for (const account of accounts) {
      const { platformUsername: username, platform } = account

      if (syncWorkerManager.isRunning(username, platform as SyncPlatform)) continue

      const worker = syncWorkerManager.getOrCreate(this.db, username, platform as SyncPlatform)

      await worker.buildQueue(true)
      await worker.start((progress) => {
        pushToRenderer(this.webContents, 'sync:progress', progress)
      })
    }
  }
}
