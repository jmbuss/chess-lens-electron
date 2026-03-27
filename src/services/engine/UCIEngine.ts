import { ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { parseInfoLine, parseBestMove, parseVerboseMoveStatsLine } from './parsers'
import type {
  EngineConfig,
  EngineStatus,
  EngineEvents,
  UCIInfoLine,
  UCIBestMove,
  AnalysisOptions,
  AnalysisLine,
} from './types'

const INIT_TIMEOUT_MS = 10_000
const READY_TIMEOUT_MS = 5_000

export class UCIEngine extends EventEmitter<EngineEvents> {
  private process: ChildProcess | null = null
  private status: EngineStatus = 'idle'
  private lineBuffer = ''
  private engineName = ''
  private engineAuthor = ''
  private readonly config: EngineConfig

  constructor(config: EngineConfig) {
    super()
    this.config = config
  }

  getStatus(): EngineStatus {
    return this.status
  }

  getEngineName(): string {
    return this.engineName
  }

  /**
   * Spawn the engine process, send "uci", configure options, and wait for "readyok".
   */
  async initialize(): Promise<void> {
    console.log(`[UCIEngine:${this.config.name}] initialize() called (current status: ${this.status})`)

    if (this.status !== 'idle' && this.status !== 'quit' && this.status !== 'error') {
      const err = `Cannot initialize engine in state: ${this.status}`
      console.error(`[UCIEngine:${this.config.name}] initialize() rejected — ${err}`)
      throw new Error(err)
    }

    this.status = 'initializing'
    this.lineBuffer = ''

    console.log(`[UCIEngine:${this.config.name}] spawning process: ${this.config.binaryPath}`, this.config.args ?? [])
    this.process = spawn(this.config.binaryPath, this.config.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    console.log(`[UCIEngine:${this.config.name}] process spawned (pid: ${this.process.pid})`)

    this.process.stdout!.on('data', (data: Buffer) => {
      this.onData(data.toString())
    })

    this.process.stderr!.on('data', (data: Buffer) => {
      console.error(`[UCIEngine:${this.config.name}] stderr:`, data.toString().trim())
    })

    this.process.on('error', (err: Error) => {
      console.error(`[UCIEngine:${this.config.name}] process error:`, err.message)
      this.status = 'error'
      this.emit('error', err)
    })

    this.process.on('exit', (code: number | null) => {
      console.log(`[UCIEngine:${this.config.name}] process exited with code ${code}`)
      this.status = 'quit'
      this.process = null
      this.emit('exit', code)
    })

    // Send "uci" and wait for "uciok"
    console.log(`[UCIEngine:${this.config.name}] waiting for uciok (timeout: ${INIT_TIMEOUT_MS}ms)`)
    await this.waitForResponse('uci', 'uciok', INIT_TIMEOUT_MS)
    console.log(`[UCIEngine:${this.config.name}] received uciok`)

    // Set options
    if (this.config.options) {
      for (const [name, value] of Object.entries(this.config.options)) {
        console.log(`[UCIEngine:${this.config.name}] setting option: ${name} = ${value}`)
        this.sendCommand(`setoption name ${name} value ${value}`)
      }
    }

    // Send "isready" and wait for "readyok"
    console.log(`[UCIEngine:${this.config.name}] waiting for readyok (timeout: ${READY_TIMEOUT_MS}ms)`)
    await this.waitForResponse('isready', 'readyok', READY_TIMEOUT_MS)
    console.log(`[UCIEngine:${this.config.name}] received readyok — engine is ready`)

    this.status = 'ready'
    this.emit('ready')
  }

  /**
   * Analyze a position. Returns the final analysis lines when the engine
   * finishes searching (sends "bestmove").
   */
  async analyze(
    fen: string,
    options: AnalysisOptions = {},
    onProgress?: (lines: AnalysisLine[]) => void
  ): Promise<AnalysisLine[]> {
    console.log(`[UCIEngine:${this.config.name}] analyze() called`, { fen, options })
    this.ensureReady()
    this.status = 'analyzing'

    // Always set MultiPV at the start of every call so the correct value is
    // guaranteed even if the previous call was interrupted before it could
    // reset the option. This also eliminates the trailing async reset that
    // previously caused a race: stopAndWait() resolves on bestmove, but the
    // trailing waitForResponse kept status='analyzing', causing the next
    // analyze() call to throw "Engine is not ready".
    const multipv = options.multipv ?? 1
    console.log(`[UCIEngine:${this.config.name}] setting MultiPV to ${multipv}`)
    this.sendCommand(`setoption name MultiPV value ${multipv}`)
    await this.waitForResponse('isready', 'readyok', READY_TIMEOUT_MS)

    this.sendCommand(`position fen ${fen}`)

    const goCommand = this.buildGoCommand(options)
    console.log(`[UCIEngine:${this.config.name}] sending go command: ${goCommand}`)

    const lines = await this.collectAnalysis(goCommand, onProgress)
    console.log(`[UCIEngine:${this.config.name}] analysis complete — ${lines.length} line(s) returned`)

    // Set status immediately — no trailing async work so stopAndWait() callers
    // see 'ready' as soon as the next microtask runs after bestmove fires.
    this.status = 'ready'
    return lines
  }

  /**
   * Analyze a position and also collect per-move policy probabilities from
   * lc0 VerboseMoveStats "info string" lines.
   *
   * Returns the same analysis lines as `analyze()` plus a map of
   * UCI move → raw policy probability [0, 1].  The policy map is empty when
   * the engine does not emit VerboseMoveStats output.
   */
  async analyzeWithPolicy(
    fen: string,
    options: AnalysisOptions = {},
  ): Promise<{ lines: AnalysisLine[]; policy: Map<string, number> }> {
    console.log(`[UCIEngine:${this.config.name}] analyzeWithPolicy() called`, { fen, options })
    this.ensureReady()
    this.status = 'analyzing'

    const multipv = options.multipv ?? 1
    this.sendCommand(`setoption name MultiPV value ${multipv}`)
    await this.waitForResponse('isready', 'readyok', READY_TIMEOUT_MS)

    this.sendCommand(`position fen ${fen}`)

    const goCommand = this.buildGoCommand(options)
    console.log(`[UCIEngine:${this.config.name}] analyzeWithPolicy — go: ${goCommand}`)

    const { lines, policy } = await this.collectAnalysisWithPolicy(goCommand)
    console.log(
      `[UCIEngine:${this.config.name}] analyzeWithPolicy complete — ${lines.length} line(s), ${policy.size} policy entries`
    )

    this.status = 'ready'
    return { lines, policy }
  }

  /**
   * Send a "stop" command to halt the current analysis.
   */
  stop(): void {
    if (this.status === 'analyzing') {
      this.sendCommand('stop')
    }
  }

  /**
   * Stop the current analysis and wait until the engine returns to the ready state.
   * Safe to call when not analyzing — resolves immediately.
   */
  stopAndWait(): Promise<void> {
    if (this.status !== 'analyzing') return Promise.resolve()

    return new Promise<void>(resolve => {
      this.once('bestmove', () => resolve())
      this.sendCommand('stop')
    })
  }

  /**
   * Send "quit" to gracefully shut down the engine process.
   */
  async quit(): Promise<void> {
    if (!this.process) return

    return new Promise<void>(resolve => {
      this.process!.once('exit', () => resolve())
      this.sendCommand('quit')

      // Force kill after timeout
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL')
          resolve()
        }
      }, 2000)
    })
  }

  /**
   * Start a new game (clears engine hash tables / state).
   */
  async newGame(): Promise<void> {
    this.ensureReady()
    this.sendCommand('ucinewgame')
    await this.waitForResponse('isready', 'readyok', READY_TIMEOUT_MS)
  }

  /**
   * Send a raw UCI command to the engine.
   */
  sendCommand(command: string): void {
    if (!this.process?.stdin?.writable) {
      const err = 'Engine process is not running'
      console.error(`[UCIEngine:${this.config.name}] sendCommand failed — ${err} (tried to send: "${command}")`)
      throw new Error(err)
    }
    console.log(`[UCIEngine:${this.config.name}] >> ${command}`)
    this.process.stdin.write(command + '\n')
  }

  // ==================== Private Methods ====================

  private onData(data: string): void {
    this.lineBuffer += data
    const lines = this.lineBuffer.split('\n')

    // Keep the last incomplete line in the buffer
    this.lineBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed) {
        this.processLine(trimmed)
      }
    }
  }

  private processLine(line: string): void {
    console.log(`[UCIEngine:${this.config.name}] << ${line}`)

    // Parse engine identity
    if (line.startsWith('id name ')) {
      this.engineName = line.substring(8)
      return
    }
    if (line.startsWith('id author ')) {
      this.engineAuthor = line.substring(10)
      return
    }

    // Route "info string" lines separately (e.g. lc0 VerboseMoveStats) so they
    // don't get swallowed by parseInfoLine (which returns null for depth=0 lines).
    if (line.startsWith('info string ')) {
      this.emit('stringInfo', line.slice('info string '.length))
      return
    }

    // Parse info lines and emit
    const info = parseInfoLine(line)
    if (info) {
      this.emit('info', info)
      return
    }

    // Parse bestmove and emit.
    // Always check for any "bestmove" line — including terminal responses like
    // "bestmove (none)" or "bestmove 0000" — so that collectAnalysis always
    // resolves rather than hanging when there are no legal moves.
    if (line.startsWith('bestmove ')) {
      const bestmove = parseBestMove(line)
      if (bestmove) {
        console.log(`[UCIEngine:${this.config.name}] bestmove received:`, bestmove)
        this.emit('bestmove', bestmove)
      } else {
        console.log(`[UCIEngine:${this.config.name}] terminal position — no legal moves (${line})`)
        this.emit('bestmove', { move: '', ponder: undefined })
      }
      return
    }
  }

  private buildGoCommand(options: AnalysisOptions): string {
    const parts = ['go']
    if (options.depth !== undefined) parts.push(`depth ${options.depth}`)
    if (options.timeMs !== undefined) parts.push(`movetime ${options.timeMs}`)
    if (options.nodes !== undefined) parts.push(`nodes ${options.nodes}`)
    const hasSearchLimit = options.depth !== undefined || options.timeMs !== undefined || options.nodes !== undefined
    if (!hasSearchLimit) parts.push('depth 20')
    // searchmoves must come last — it is a rest-of-line argument that consumes
    // all remaining tokens as move names, so any depth/time limits placed after
    // it would be silently parsed as (invalid) moves and ignored by the engine.
    if (options.searchmoves?.length) {
      parts.push('searchmoves', ...options.searchmoves)
    }
    return parts.join(' ')
  }

  /**
   * Send a go command and collect all info lines until bestmove is received.
   * Returns the deepest info line per MultiPV slot.
   *
   * onProgress is called after each depth increase (throttled by progressDepthInterval).
   * Only fires once all MultiPV slots have been updated at that depth.
   */
  private collectAnalysis(
    goCommand: string,
    onProgress?: (lines: AnalysisLine[]) => void,
    progressDepthInterval = 1
  ): Promise<AnalysisLine[]> {
    return new Promise<AnalysisLine[]>((resolve, reject) => {
      const lines = new Map<number, AnalysisLine>()
      let lastEmittedDepth = 0

      const onInfo = (info: UCIInfoLine) => {
        const mpv = info.multipv ?? 1
        const existing = lines.get(mpv)

        // Keep the deepest line for each MultiPV slot
        if (!existing || info.depth >= existing.depth) {
          lines.set(mpv, {
            multipv: mpv,
            depth: info.depth,
            score: info.score,
            pv: info.pv,
            nodes: info.nodes,
            nps: info.nps,
            time: info.time,
          })
        }

        // Emit progress once per depth tick, after all MultiPV slots are populated at that depth
        if (onProgress && info.depth >= lastEmittedDepth + progressDepthInterval) {
          lastEmittedDepth = info.depth
          onProgress(Array.from(lines.values()).sort((a, b) => a.multipv - b.multipv))
        }
      }

      const onBestMove = (_bestmove: UCIBestMove) => {
        this.off('info', onInfo)
        this.off('bestmove', onBestMove)
        this.off('error', onError)

        const result = Array.from(lines.values()).sort((a, b) => a.multipv - b.multipv)
        resolve(result)
      }

      const onError = (err: Error) => {
        console.error(`[UCIEngine:${this.config.name}] error during analysis:`, err.message)
        this.off('info', onInfo)
        this.off('bestmove', onBestMove)
        this.off('error', onError)
        reject(err)
      }

      this.on('info', onInfo)
      this.on('bestmove', onBestMove)
      this.on('error', onError)

      this.sendCommand(goCommand)
    })
  }

  /**
   * Send a command and wait for a specific response line.
   */
  private waitForResponse(command: string, expected: string, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      console.log(`[UCIEngine:${this.config.name}] waitForResponse — sending "${command}", expecting "${expected}" within ${timeoutMs}ms`)

      const timeout = setTimeout(() => {
        console.error(`[UCIEngine:${this.config.name}] TIMEOUT — never received "${expected}" after ${timeoutMs}ms (sent "${command}")`)
        cleanup()
        reject(new Error(`Timeout waiting for "${expected}" after ${timeoutMs}ms`))
      }, timeoutMs)

      const onData = (data: Buffer) => {
        const text = data.toString()
        if (text.includes(expected)) {
          console.log(`[UCIEngine:${this.config.name}] waitForResponse — received "${expected}"`)
          cleanup()
          resolve()
        }
      }

      const cleanup = () => {
        clearTimeout(timeout)
        this.process?.stdout?.off('data', onData)
      }

      this.process?.stdout?.on('data', onData)
      this.sendCommand(command)
    })
  }

  /**
   * Like collectAnalysis but also collects policy probabilities from
   * lc0 "info string" VerboseMoveStats lines.
   */
  private collectAnalysisWithPolicy(
    goCommand: string,
  ): Promise<{ lines: AnalysisLine[]; policy: Map<string, number> }> {
    return new Promise<{ lines: AnalysisLine[]; policy: Map<string, number> }>((resolve, reject) => {
      const lines = new Map<number, AnalysisLine>()
      const policy = new Map<string, number>()

      const onInfo = (info: UCIInfoLine) => {
        const mpv = info.multipv ?? 1
        const existing = lines.get(mpv)
        if (!existing || info.depth >= existing.depth) {
          lines.set(mpv, {
            multipv: mpv,
            depth: info.depth,
            score: info.score,
            pv: info.pv,
            nodes: info.nodes,
            nps: info.nps,
            time: info.time,
          })
        }
      }

      const onStringInfo = (line: string) => {
        const parsed = parseVerboseMoveStatsLine(line)
        if (parsed) policy.set(parsed.move, parsed.policy)
      }

      const onBestMove = (_bestmove: UCIBestMove) => {
        this.off('info', onInfo)
        this.off('stringInfo', onStringInfo)
        this.off('bestmove', onBestMove)
        this.off('error', onError)
        resolve({
          lines: Array.from(lines.values()).sort((a, b) => a.multipv - b.multipv),
          policy,
        })
      }

      const onError = (err: Error) => {
        console.error(`[UCIEngine:${this.config.name}] error during analyzeWithPolicy:`, err.message)
        this.off('info', onInfo)
        this.off('stringInfo', onStringInfo)
        this.off('bestmove', onBestMove)
        this.off('error', onError)
        reject(err)
      }

      this.on('info', onInfo)
      this.on('stringInfo', onStringInfo)
      this.on('bestmove', onBestMove)
      this.on('error', onError)

      this.sendCommand(goCommand)
    })
  }

  private ensureReady(): void {
    if (this.status !== 'ready') {
      const err = `Engine is not ready (current state: ${this.status})`
      console.error(`[UCIEngine:${this.config.name}] ensureReady() failed — ${err}`)
      throw new Error(err)
    }
  }
}
