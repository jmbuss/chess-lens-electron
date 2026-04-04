/**
 * @deprecated The game machine has been removed in favor of the queue-driven
 * GameCoordinator async loop. Helper functions (computePlayerStats,
 * buildEvalCurveFromMainLine, etc.) have been moved to GameAggregateService.
 *
 * This file is kept as a stub so existing imports don't break during migration.
 * Remove this file once all consumers have been updated.
 */

export {
  computePlayerStats,
  buildEvalCurveFromMainLine,
  buildMaiaFloorEvalCurve,
  buildMaiaCeilingEvalCurve,
  gameTreeToAnalysis,
} from '../GameAggregateService'

export type { PlayerStats } from 'src/database/analysis/types'
