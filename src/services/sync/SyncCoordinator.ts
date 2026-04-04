import type Database from 'better-sqlite3'
import type { WebContents } from 'electron'
import type { EventBus } from '../../events'
import { syncWorkerManager } from './worker'
import { PlatformAccountModel } from '../../database/platform-account'
import { ChessGameModel } from '../../database/chess'
import type { SyncPlatform } from '../../database/sync'
import { pushToRenderer } from '../../ipc/push'
import '../../events/app'
import '../../api/platform/events'
import '../../api/sync/handlers'

export class SyncCoordinator {
  constructor(
    private db: Database.Database,
    private bus: EventBus,
    private webContents: WebContents,
  ) {
    this.bus.on('app:started', () => void this.runInitialSync())
    this.bus.on('platform:account:created', ({ username, platform }) => {
      void this.syncAccount(username, platform as SyncPlatform)
    })
  }

  private async runInitialSync(): Promise<void> {
    const accounts = PlatformAccountModel.findAll(this.db)

    for (const account of accounts) {
      const { platformUsername: username, platform } = account
      await this.syncAccount(username, platform as SyncPlatform)
    }
  }

  private async syncAccount(username: string, platform: SyncPlatform): Promise<void> {
    if (syncWorkerManager.isRunning(username, platform)) return

    const worker = syncWorkerManager.getOrCreate(this.db, username, platform)

    await worker.buildQueue(true)
    await worker.start(
      (progress) => {
        pushToRenderer(this.webContents, 'sync:progress', progress)
      },
      (gameIds) => {
        const games = ChessGameModel.findByIdsWithAnalysisStatus(this.db, gameIds)
        if (games.length > 0) {
          pushToRenderer(this.webContents, 'sync:games-added', games)
        }
      },
    )
  }
}
