import { DatabaseService } from './db'
import { UserModel } from './user'
import { PlatformAccountModel } from './platform-account'
import { ChessGameModel } from './chess'
import { SyncModel } from './sync'
import { GameFavoritesModel } from './favorites'
import { GameAnalysisQueueModel } from './analysis-queue/GameAnalysisQueueModel'
import { PositionAnalysisModel } from './analysis-queue/PositionAnalysisModel'
import { GamePositionsModel } from './game-positions'

export const database = new DatabaseService([
  new UserModel(),
  new PlatformAccountModel(),
  new ChessGameModel(),
  new SyncModel(),
  new GameFavoritesModel(),
  new GameAnalysisQueueModel(),
  new PositionAnalysisModel(),
  new GamePositionsModel(),
])
