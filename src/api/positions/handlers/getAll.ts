import Database from 'better-sqlite3'
import { IpcMainEvent } from 'electron'
import { PositionIndexModel } from 'src/database/vectors/PositionIndexModel'
import type { PositionIndexRow } from 'src/database/vectors/types'
import { IpcHandler } from 'src/ipc/IPCHandler'
import { IpcRequest, IpcResponse } from 'src/ipc/types'

/** Plain JSON-like rows only — Electron IPC cannot clone better-sqlite3 / driver wrapper objects. */
function positionIndexRowForIpc(row: PositionIndexRow): PositionIndexRow {
  return {
    id: Number(row.id),
    game_id: String(row.game_id),
    ply: Number(row.ply),
    fen: String(row.fen),
    san: row.san == null ? null : String(row.san),
    uci_move: row.uci_move == null ? null : String(row.uci_move),
    color: String(row.color),
    move_number: row.move_number == null ? null : Number(row.move_number),
    nag: row.nag == null ? null : String(row.nag),
    eval_cp: row.eval_cp == null ? null : Number(row.eval_cp),
    eval_mate: row.eval_mate == null ? null : Number(row.eval_mate),
    wdl_win: row.wdl_win == null ? null : Number(row.wdl_win),
    wdl_draw: row.wdl_draw == null ? null : Number(row.wdl_draw),
    wdl_loss: row.wdl_loss == null ? null : Number(row.wdl_loss),
    criticality_score: row.criticality_score == null ? null : Number(row.criticality_score),
    phase_score: row.phase_score == null ? null : Number(row.phase_score),
    is_best_move: row.is_best_move == null ? null : Number(row.is_best_move),
    move_accuracy: row.move_accuracy == null ? null : Number(row.move_accuracy),
    index_reason: String(row.index_reason),
    opening_eco: row.opening_eco == null ? null : String(row.opening_eco),
    opening_name: row.opening_name == null ? null : String(row.opening_name),
    created_at: String(row.created_at),
  }
}

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'positions:getAll': {
      request: Record<string, never>
      response: { positions: PositionIndexRow[] }
    }
  }
}

export class PositionsGetAllHandler extends IpcHandler {
  static readonly channel = 'positions:getAll' as const

  constructor(private db: Database.Database) {
    super()
  }

  async handle(
    _event: IpcMainEvent,
    _request: IpcRequest<Record<string, never>>,
  ): Promise<IpcResponse<{ positions: PositionIndexRow[] }>> {
    const rows = PositionIndexModel.findAll(this.db)

    return {
      success: true,
      data: {
        positions: rows.map(positionIndexRowForIpc),
      },
    }
  }
}
