import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { UCIEngine } from './UCIEngine'
import type { EngineConfig, EngineName, MaiaEngineConfig } from './types'

export const VALID_MAIA_RATINGS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900] as const
export type MaiaRating = (typeof VALID_MAIA_RATINGS)[number]

/**
 * EngineManager handles resolving binary paths, extracting archives,
 * and creating/managing UCIEngine instances.
 */
export class EngineManager {
  private engines: Map<string, UCIEngine> = new Map()
  private resourcesPath: string
  private cachePath: string

  /**
   * @param resourcesPath - Path to the resources/engines/ directory
   * @param cachePath - Path to write extracted/cached engine binaries (e.g., app.getPath('userData'))
   */
  constructor(resourcesPath: string, cachePath: string) {
    this.resourcesPath = resourcesPath
    this.cachePath = cachePath
    fs.mkdirSync(path.join(this.cachePath, 'engines'), { recursive: true })
  }

  /**
   * Create and initialize a Stockfish engine instance.
   */
  async createStockfish(options?: {
    threads?: number
    hash?: number
    multipv?: number
  }): Promise<UCIEngine> {
    const binaryPath = await this.resolveStockfishBinary()

    const config: EngineConfig = {
      name: 'stockfish',
      binaryPath,
      options: {
        ...(options?.threads !== undefined && { Threads: options.threads }),
        ...(options?.hash !== undefined && { Hash: options.hash }),
      },
    }

    const engine = new UCIEngine(config)
    await engine.initialize()

    this.engines.set('stockfish', engine)
    return engine
  }

  /**
   * Create and initialize a Maia engine instance (lc0 + maia network).
   */
  async createMaia(rating: MaiaRating): Promise<UCIEngine> {
    if (!VALID_MAIA_RATINGS.includes(rating)) {
      throw new Error(
        `Invalid Maia rating: ${rating}. Valid ratings: ${VALID_MAIA_RATINGS.join(', ')}`
      )
    }

    const binaryPath = this.resolveLc0Binary()
    const networkPath = this.resolveMaiaNetwork(rating)

    const config: MaiaEngineConfig = {
      name: 'maia',
      binaryPath,
      networkPath,
      targetRating: rating,
      args: [`--weights=${networkPath}`],
      options: {
        // Maia uses a single node search for human-like move prediction
        VerboseMoveStats: 'true',
      },
    }

    const engine = new UCIEngine(config)
    await engine.initialize()

    const key = `maia-${rating}`
    this.engines.set(key, engine)
    return engine
  }

  /**
   * Get an existing engine instance by key.
   */
  getEngine(key: string): UCIEngine | undefined {
    return this.engines.get(key)
  }

  /**
   * Quit a specific engine.
   */
  async quitEngine(key: string): Promise<void> {
    const engine = this.engines.get(key)
    if (engine) {
      await engine.quit()
      this.engines.delete(key)
    }
  }

  /**
   * Quit all running engines.
   */
  async quitAll(): Promise<void> {
    const quitPromises = Array.from(this.engines.entries()).map(async ([key, engine]) => {
      await engine.quit()
      this.engines.delete(key)
    })
    await Promise.all(quitPromises)
  }

  /**
   * Get the status of all managed engines.
   */
  getStatus(): Record<string, string> {
    const status: Record<string, string> = {}
    for (const [key, engine] of this.engines) {
      status[key] = engine.getStatus()
    }
    return status
  }

  // ==================== Path Resolution ====================

  /**
   * Ensure a file is executable. Only calls chmod if needed to avoid
   * triggering file watchers (which causes app reload in dev).
   */
  private ensureExecutable(filePath: string): void {
    try {
      const stat = fs.statSync(filePath)
      if ((stat.mode & 0o111) === 0) {
        fs.chmodSync(filePath, 0o755)
      }
    } catch {
      // Fallback: chmod anyway if stat fails (e.g., Windows, permissions)
      fs.chmodSync(filePath, 0o755)
    }
  }

  private getPlatformDir(): string {
    const platform = process.platform
    switch (platform) {
      case 'darwin':
        return 'darwin'
      case 'win32':
        return 'win32'
      case 'linux':
        return 'linux'
      default:
        throw new Error(`Unsupported platform: ${platform}`)
    }
  }

  /**
   * Resolve Stockfish binary.
   *
   * First checks for a pre-extracted binary in resources/engines/{platform}/stockfish/.
   * Falls back to extracting from a .tar archive if no binary is found (caches the
   * result in cachePath so extraction only happens once).
   */
  private async resolveStockfishBinary(): Promise<string> {
    const platformDir = this.getPlatformDir()
    const stockfishDir = path.join(this.resourcesPath, platformDir, 'stockfish')

    // 1. Look for a pre-extracted binary in the resources directory
    const directBinary = this.findExecutableRecursive(stockfishDir, 'stockfish')
    if (directBinary) {
      this.ensureExecutable(directBinary)
      console.log(`[EngineManager] Stockfish binary found at ${directBinary}`)
      return directBinary
    }

    // 2. Fallback: extract from tar archive and cache the binary
    const stockfishCacheDir = path.join(this.cachePath, 'engines', 'stockfish')
    const cachedBinary = path.join(stockfishCacheDir, 'stockfish-bin')

    if (fs.existsSync(cachedBinary)) {
      return cachedBinary
    }

    const files = fs.readdirSync(stockfishDir)
    const tarFile = files.find(f => f.endsWith('.tar'))

    if (!tarFile) {
      throw new Error(
        `No Stockfish binary or tar archive found in ${stockfishDir}. ` +
          `Expected either a pre-extracted binary or a .tar file.`
      )
    }

    const tarPath = path.join(stockfishDir, tarFile)
    const extractDir = path.join(stockfishCacheDir, '_extract')

    console.log(`[EngineManager] Extracting Stockfish from ${tarPath}...`)
    fs.mkdirSync(extractDir, { recursive: true })
    execSync(`tar -xf "${tarPath}" -C "${extractDir}"`)

    const extractedBinary = this.findExecutableRecursive(extractDir, 'stockfish')
    if (!extractedBinary) {
      throw new Error(`Could not find stockfish binary after extracting to ${extractDir}`)
    }

    fs.mkdirSync(stockfishCacheDir, { recursive: true })
    fs.copyFileSync(extractedBinary, cachedBinary)
    this.ensureExecutable(cachedBinary)
    fs.rmSync(extractDir, { recursive: true, force: true })

    console.log(`[EngineManager] Stockfish binary extracted and cached at ${cachedBinary}`)
    return cachedBinary
  }

  /**
   * Resolve the stockfish-classic binary path.
   * The binary lives at resources/engines/{platform}/stockfish-classic/.
   */
  resolveStockfishClassicBinary(): string {
    const platformDir = this.getPlatformDir()
    const dir = path.join(this.resourcesPath, platformDir, 'stockfish-classic')

    if (!fs.existsSync(dir)) {
      throw new Error(`Stockfish classic directory not found at ${dir}`)
    }

    const binary = this.findExecutableRecursive(dir, 'stockfish')
    if (!binary) {
      throw new Error(`No stockfish-classic binary found in ${dir}`)
    }

    this.ensureExecutable(binary)
    console.log(`[EngineManager] Stockfish classic binary found at ${binary}`)
    return binary
  }

  /**
   * Resolve the lc0 binary path.
   */
  private resolveLc0Binary(): string {
    const platformDir = this.getPlatformDir()
    const binaryPath = path.join(this.resourcesPath, platformDir, 'lc0', 'lc0')

    if (!fs.existsSync(binaryPath)) {
      throw new Error(`lc0 binary not found at ${binaryPath}`)
    }

    this.ensureExecutable(binaryPath)
    return binaryPath
  }

  /**
   * Resolve a Maia network file path.
   */
  private resolveMaiaNetwork(rating: MaiaRating): string {
    const networkPath = path.join(this.resourcesPath, 'networks', `maia-${rating}.pb.gz`)

    if (!fs.existsSync(networkPath)) {
      throw new Error(`Maia network not found at ${networkPath}`)
    }

    return networkPath
  }

  /**
   * Recursively search for an executable file whose name starts with the given prefix.
   * This handles platform-specific naming (e.g., "stockfish-macos-m1-apple-silicon").
   */
  private findExecutableRecursive(dir: string, namePrefix: string): string | null {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isFile() && entry.name.startsWith(namePrefix) && !entry.name.includes('.')) {
        // Check if it looks like a binary (no file extension)
        try {
          const stat = fs.statSync(fullPath)
          // Must be a non-trivial file size (> 100KB) to be a binary
          if (stat.size > 100_000) return fullPath
        } catch {
          // Skip files we can't stat
        }
      }
      if (entry.isDirectory()) {
        const found = this.findExecutableRecursive(fullPath, namePrefix)
        if (found) return found
      }
    }

    return null
  }
}
