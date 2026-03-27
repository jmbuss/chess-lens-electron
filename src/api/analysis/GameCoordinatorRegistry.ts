import type { GameCoordinator } from 'src/services/analysis/GameCoordinator'

/**
 * Process-wide registry that maps gameId → GameCoordinator.
 * Shared between IPC handlers so AddVariationHandler and StudyPositionHandler
 * can send navigate events into whichever coordinator is running.
 */
export class GameCoordinatorRegistry {
  private static map = new Map<string, GameCoordinator>()

  static register(gameId: string, coordinator: GameCoordinator): void {
    GameCoordinatorRegistry.map.set(gameId, coordinator)
  }

  static get(gameId: string): GameCoordinator | undefined {
    return GameCoordinatorRegistry.map.get(gameId)
  }

  static clear(gameId: string): void {
    GameCoordinatorRegistry.map.delete(gameId)
  }

  /**
   * Stop every running coordinator and clear the registry. Because Stockfish
   * and the Maia engines are global singletons, only one coordinator can use
   * them at a time. Call this (and await it) before starting any new
   * coordinator to guarantee the engines are idle and ready.
   */
  static async stopAll(): Promise<void> {
    const entries = Array.from(GameCoordinatorRegistry.map.entries())
    GameCoordinatorRegistry.map.clear()
    await Promise.allSettled(entries.map(([, coordinator]) => coordinator.stop()))
  }
}
