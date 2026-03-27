import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { PositionalFeatures, EvalTerm, EvalTermScore } from 'src/database/analysis/types'

const INIT_TIMEOUT_MS = 10_000
const EVAL_TIMEOUT_MS = 5_000

// ==================== Output Parser ====================

/**
 * Parse a two-number score string like "  0.76 -0.00" or "  ----  ----".
 * Returns null when either value is "----" (term not applicable for that side).
 */
function parseScore(s: string): EvalTermScore | null {
  if (s.includes('----')) return null
  const m = s.match(/([-\d.]+)\s+([-\d.]+)/)
  if (!m) return null
  return { mg: parseFloat(m[1]), eg: parseFloat(m[2]) }
}

/**
 * Term-name → PositionalFeatures key mapping.
 * Keys must match the engine output exactly (case-sensitive).
 */
const TERM_KEYS: Record<string, keyof Omit<PositionalFeatures, 'finalEvaluation'>> = {
  'Material':    'material',
  'Imbalance':   'imbalance',
  'Pawns':       'pawns',
  'Knights':     'knights',
  'Bishops':     'bishops',
  'Rooks':       'rooks',
  'Queens':      'queens',
  'Mobility':    'mobility',
  'King safety': 'kingSafety',
  'Threats':     'threats',
  'Passed':      'passed',
  'Space':       'space',
  'Winnable':    'winnable',
}

const EMPTY_TERM: EvalTerm = { white: null, black: null, total: null }

function defaultFeatures(): PositionalFeatures {
  return {
    material:        { ...EMPTY_TERM },
    imbalance:       { ...EMPTY_TERM },
    pawns:           { ...EMPTY_TERM },
    knights:         { ...EMPTY_TERM },
    bishops:         { ...EMPTY_TERM },
    rooks:           { ...EMPTY_TERM },
    queens:          { ...EMPTY_TERM },
    mobility:        { ...EMPTY_TERM },
    kingSafety:      { ...EMPTY_TERM },
    threats:         { ...EMPTY_TERM },
    passed:          { ...EMPTY_TERM },
    space:           { ...EMPTY_TERM },
    winnable:        { ...EMPTY_TERM },
    finalEvaluation: 0,
  }
}

/**
 * Parse the raw lines captured from a single `eval` command invocation.
 * Exported for unit testing.
 */
export function parseEvalOutput(lines: string[]): PositionalFeatures {
  const features = defaultFeatures()

  for (const line of lines) {
    // "Final evaluation: 0.45 (white side)"  or  "Final evaluation: none (in check)"
    const finalMatch = line.match(/Final evaluation:\s+([-\d.]+)\s+\(white side\)/)
    if (finalMatch) {
      features.finalEvaluation = parseFloat(finalMatch[1])
      continue
    }

    // Data rows have the form:  "  Term name | wMG  wEG | bMG  bEG | tMG  tEG"
    // Split on '|' and skip header/separator rows.
    if (!line.includes('|')) continue
    const parts = line.split('|')
    if (parts.length < 4) continue

    const termName = parts[0].trim()
    const key = TERM_KEYS[termName]
    if (!key) continue

    features[key] = {
      white: parseScore(parts[1]),
      black: parseScore(parts[2]),
      total: parseScore(parts[3]),
    }
  }

  return features
}

// ==================== Service ====================

type LineHandler = (line: string) => void

/**
 * Manages a long-lived stockfish-classic child process and exposes a single
 * `evalPosition(fen)` method that sends the `eval` command and returns parsed
 * positional features.
 *
 * Lifecycle:
 *   1. `initialize()` — spawn, UCI handshake, wait for readyok
 *   2. `evalPosition(fen)` — can be called repeatedly (sequential use only)
 *   3. `quit()` — graceful shutdown
 */
export class StockfishClassicEvalService {
  private process: ChildProcess | null = null
  private lineBuffer = ''
  private handlers: LineHandler[] = []

  constructor(private readonly binaryPath: string) {}

  async initialize(): Promise<void> {
    this.process = spawn(this.binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] })

    this.process.stdout!.on('data', (data: Buffer) => {
      this.lineBuffer += data.toString()
      const lines = this.lineBuffer.split('\n')
      this.lineBuffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed) this.dispatch(trimmed)
      }
    })

    this.process.stderr!.on('data', (data: Buffer) => {
      console.error('[StockfishClassic] stderr:', data.toString().trim())
    })

    this.process.on('error', (err: Error) => {
      console.error('[StockfishClassic] process error:', err.message)
    })

    this.process.on('exit', (code) => {
      console.log(`[StockfishClassic] process exited (code ${code})`)
      this.process = null
    })

    await this.waitFor('uci', 'uciok', INIT_TIMEOUT_MS)
    await this.waitFor('isready', 'readyok', INIT_TIMEOUT_MS)
    console.log('[StockfishClassic] initialized')
  }

  /**
   * Run a static evaluation for the given FEN and return parsed positional features.
   * Must be called sequentially — concurrent calls are not supported.
   */
  async evalPosition(fen: string): Promise<PositionalFeatures> {
    if (!this.process) {
      console.warn('[StockfishClassic] process not running — returning defaults')
      return defaultFeatures()
    }

    this.send(`position fen ${fen}`)
    this.send('eval')

    const captured: string[] = []

    return new Promise<PositionalFeatures>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeHandler(handler)
        console.warn('[StockfishClassic] eval timed out, returning defaults')
        resolve(defaultFeatures())
      }, EVAL_TIMEOUT_MS)

      const handler: LineHandler = (line) => {
        captured.push(line)
        if (line.startsWith('Final evaluation:') || line.startsWith('Final evaluation: none')) {
          clearTimeout(timeout)
          this.removeHandler(handler)
          resolve(parseEvalOutput(captured))
        }
      }

      this.handlers.push(handler)
    })
  }

  async quit(): Promise<void> {
    if (!this.process) return
    this.handlers = []
    await new Promise<void>(resolve => {
      const proc = this.process!
      proc.once('exit', () => resolve())
      this.send('quit')
      // Force kill if graceful quit doesn't complete
      setTimeout(() => { proc.kill('SIGKILL'); resolve() }, 2000)
    })
    this.process = null
  }

  // ==================== Private ====================

  private send(cmd: string): void {
    this.process?.stdin?.write(cmd + '\n')
  }

  private dispatch(line: string): void {
    for (const h of [...this.handlers]) h(line)
  }

  private removeHandler(h: LineHandler): void {
    this.handlers = this.handlers.filter(x => x !== h)
  }

  private waitFor(cmd: string, expected: string, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        this.removeHandler(handler)
        reject(new Error(`[StockfishClassic] timeout waiting for "${expected}"`))
      }, timeoutMs)

      const handler: LineHandler = (line) => {
        if (line.includes(expected)) {
          clearTimeout(t)
          this.removeHandler(handler)
          resolve()
        }
      }

      this.handlers.push(handler)
      this.send(cmd)
    })
  }
}
