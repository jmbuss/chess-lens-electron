import { DatabaseService } from './db'
import { UserModel } from './user'
import { PlatformAccountModel } from './platform-account'
import { ChessGameModel } from './chess'
import { SyncModel } from './sync'
import { GameAnalysisModel } from './analysis'
import { GameFavoritesModel } from './favorites'

export const database = new DatabaseService([
  new UserModel(),
  new PlatformAccountModel(),
  new ChessGameModel(),
  new SyncModel(),
  new GameAnalysisModel(),
  new GameFavoritesModel(),
])
