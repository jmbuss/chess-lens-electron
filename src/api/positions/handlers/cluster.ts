import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { ClusteringService, type PositionCluster } from 'src/services/analysis/ClusteringService'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'positions:cluster': {
      request: { k?: number }
      response: { clusters: PositionCluster[] }
    }
  }
}

export class PositionsClusterHandler extends IpcHandler {
  static readonly channel = 'positions:cluster' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{ k?: number }>,
  ): Promise<IpcResponse<{ clusters: PositionCluster[] }>> {
    const k = request.params?.k ?? 20
    const service = new ClusteringService(this.db)
    const clusters = service.cluster(k)

    return {
      success: true,
      data: { clusters },
    }
  }
}
