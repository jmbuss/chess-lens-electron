import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { PositionIndexModel } from 'src/database/vectors/PositionIndexModel'
import { VectorModel } from 'src/database/vectors/VectorModel'
import { PositionAnalysisModel } from 'src/database/analysis-queue'
import type { PositionIndexRow } from 'src/database/vectors/types'
import { buildPositionalVector, buildStructuralVector } from 'src/services/analysis/vectors/VectorBuilder'
import type { PositionOutput } from 'src/services/analysis/machines/positionMachine'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

export interface SimilarPositionMatch {
  positionIndexId: number
  distance: number
  positionalDistance?: number
  structuralDistance?: number
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
        mode?: 'positional' | 'structural' | 'combined'
        positionalWeight?: number
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
      mode?: 'positional' | 'structural' | 'combined'
      positionalWeight?: number
    }>,
  ): Promise<IpcResponse<{ matches: SimilarPositionMatch[] }>> {
    const params = request.params
    if (!params?.fen) {
      return { success: false, error: 'fen is required' }
    }

    const { fen, k = 10, configHash, mode = 'combined', positionalWeight = 0.5 } = params

    let positionalVec: Float32Array | null = null
    if (mode === 'positional' || mode === 'combined') {
      const paRow = configHash
        ? PositionAnalysisModel.findByFen(this.db, fen, configHash)
        : PositionAnalysisModel.findByFenAnyConfig(this.db, fen)[0] ?? null

      if (paRow?.result_json) {
        const posOutput = JSON.parse(paRow.result_json) as PositionOutput
        positionalVec = buildPositionalVector(posOutput)
      }
    }

    const structuralVec = buildStructuralVector(fen)
    let knnResults: Array<{
      position_index_id: number
      distance: number
      positionalDistance?: number
      structuralDistance?: number
    }>

    switch (mode) {
      case 'positional':
        if (!positionalVec) {
          return { success: true, data: { matches: [] } }
        }
        knnResults = VectorModel.knnPositional(this.db, positionalVec, k)
        break

      case 'structural':
        knnResults = VectorModel.knnStructural(this.db, structuralVec, k).map(r => ({
          ...r,
          structuralDistance: r.distance,
        }))
        break

      case 'combined':
      default:
        knnResults = VectorModel.knnCombined(
          this.db,
          positionalVec,
          structuralVec,
          k,
          positionalWeight,
        )
        break
    }

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
      const m: SimilarPositionMatch = {
        positionIndexId: Number(r.position_index_id),
        distance: Number(r.distance),
        fen: String(row.fen),
        gameId: String(row.game_id),
        ply: Number(row.ply),
        san: row.san == null ? null : String(row.san),
        nag: row.nag == null ? null : String(row.nag),
        indexReason: String(row.index_reason),
      }
      if (r.positionalDistance != null) m.positionalDistance = Number(r.positionalDistance)
      if (r.structuralDistance != null) m.structuralDistance = Number(r.structuralDistance)
      matches.push(m)
    }

    return { success: true, data: { matches } }
  }
}
