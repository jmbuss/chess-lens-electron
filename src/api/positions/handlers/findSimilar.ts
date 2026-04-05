import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { PositionIndexModel } from 'src/database/vectors/PositionIndexModel'
import { VectorModel } from 'src/database/vectors/VectorModel'
import { PositionAnalysisModel } from 'src/database/analysis-queue'
import type { PositionIndexRow } from 'src/database/vectors/types'
import { buildPositionalVector } from 'src/services/analysis/vectors/VectorBuilder'
import type { PositionOutput } from 'src/services/analysis/machines/positionMachine'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

export interface SimilarPositionMatch {
  positionIndexId: number
  distance: number
  fen: string
  gameId: string
  ply: number
  san: string | null
  nag: string | null
  indexReason: string
}

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'positions:findSimilar': {
      request: {
        fen: string
        k?: number
        configHash?: string
      }
      response: { matches: SimilarPositionMatch[] }
    }
  }
}

export class PositionsFindSimilarHandler extends IpcHandler {
  static readonly channel = 'positions:findSimilar' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    request: IpcRequest<{
      fen: string
      k?: number
      configHash?: string
    }>,
  ): Promise<IpcResponse<{ matches: SimilarPositionMatch[] }>> {
    const params = request.params
    if (!params?.fen) {
      return { success: false, error: 'fen is required' }
    }

    const { fen, k = 10, configHash } = params

    const paRow = configHash
      ? PositionAnalysisModel.findByFen(this.db, fen, configHash)
      : PositionAnalysisModel.findByFenAnyConfig(this.db, fen)[0] ?? null

    let positionalVec: Float32Array | null = null
    if (paRow?.result_json) {
      const posOutput = JSON.parse(paRow.result_json) as PositionOutput
      positionalVec = buildPositionalVector(posOutput)
    }

    if (!positionalVec) {
      return { success: true, data: { matches: [] } }
    }

    const knnResults = VectorModel.knnPositional(this.db, positionalVec, k)

    if (knnResults.length === 0) {
      return { success: true, data: { matches: [] } }
    }

    const ids = knnResults.map(r => r.position_index_id)
    const indexRows = PositionIndexModel.findByIds(this.db, ids)

    const indexMap = new Map<number, PositionIndexRow>(
      indexRows.map(r => [Number(r.id), r]),
    )

    const matches: SimilarPositionMatch[] = []
    for (const r of knnResults) {
      const row = indexMap.get(Number(r.position_index_id))
      if (!row) continue
      matches.push({
        positionIndexId: Number(r.position_index_id),
        distance: Number(r.distance),
        fen: String(row.fen),
        gameId: String(row.game_id),
        ply: Number(row.ply),
        san: row.san == null ? null : String(row.san),
        nag: row.nag == null ? null : String(row.nag),
        indexReason: String(row.index_reason),
      })
    }

    return { success: true, data: { matches } }
  }
}
