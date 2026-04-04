/**
 * Global singleton EngineManager instance for the main process.
 *
 * This manages all chess engine instances (Stockfish and Maia) for the app.
 * Initialized on app.ready and cleaned up on app.before-quit.
 */

import path from 'node:path'
import os from 'node:os'
import { app } from 'electron'
import { EngineManager } from './EngineManager'
import { UCIEngine } from './UCIEngine'

let engineManager: EngineManager | null = null
let stockfishEngine: UCIEngine | null = null
const maiaEngines = new Map<number, UCIEngine>()

/**
 * Initialize the global engine manager.
 * Should be called on app.ready.
 */
export function initEngineManager(): void {
  if (engineManager) {
    console.warn('[EngineManager] Already initialized')
    return
  }

  // Resources path: in development it's relative to the built main.js,
  // in production it's relative to the app resources
  const resourcesPath = app.isPackaged
    ? path.join(process.resourcesPath, 'engines')
    : path.resolve(__dirname, '../../resources/engines')

  const cachePath = app.getPath('userData')

  engineManager = new EngineManager(resourcesPath, cachePath)
}

/**
 * Get the singleton EngineManager instance.
 * Throws if not initialized.
 */
export function getEngineManager(): EngineManager {
  if (!engineManager) {
    throw new Error('EngineManager not initialized. Call initEngineManager() first.')
  }
  return engineManager
}

/**
 * Get or create the Stockfish engine instance.
 * Uses default settings optimized for analysis.
 */
export async function getStockfish(): Promise<UCIEngine> {
  if (!stockfishEngine || stockfishEngine.getStatus() === 'quit') {
    const manager = getEngineManager()
    stockfishEngine = await manager.createStockfish({
      threads: 6,
      hash: 256,
    })
  }
  return stockfishEngine
}

/**
 * Get or create a Maia engine for the given rating.
 * Maia instances are cached per rating.
 */
export async function getMaia(rating: number): Promise<UCIEngine> {
  const existingEngine = maiaEngines.get(rating)
  if (existingEngine && existingEngine.getStatus() !== 'quit') {
    return existingEngine
  }

  const manager = getEngineManager()
  const engine = await manager.createMaia(rating as any)
  maiaEngines.set(rating, engine)
  return engine
}

/**
 * Resolve the path to the stockfish-classic binary used for static eval.
 * Throws if the binary cannot be found.
 */
export function getStockfishClassicBinaryPath(): string {
  return getEngineManager().resolveStockfishClassicBinary()
}

/**
 * Stop the current analysis on the Stockfish engine.
 */
export function stopStockfish(): void {
  if (stockfishEngine) {
    stockfishEngine.stop()
  }
}

/**
 * Shut down all engines.
 * Should be called on app.before-quit.
 */
export async function shutdownEngines(): Promise<void> {
  if (engineManager) {
    await engineManager.quitAll()
  }
  stockfishEngine = null
  maiaEngines.clear()
  engineManager = null
}
