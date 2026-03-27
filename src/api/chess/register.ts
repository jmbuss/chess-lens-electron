import { IPCHandlerRegistry } from 'src/ipc/IPCHandlerRegistry'
import Database from 'better-sqlite3'
import { ChessSyncHandler, ChessGetByIdHandler, ChessGetAllHandler } from './handlers'

export const registerChessHandlers = (
  ipcHandlerRegistry: IPCHandlerRegistry,
  db: Database.Database
) => {
  const chessHandlers = [
    new ChessSyncHandler(db),
    new ChessGetByIdHandler(db),
    new ChessGetAllHandler(db),
  ]
  ipcHandlerRegistry.registerHandlers(...chessHandlers)
}
