import type { UCIInfoLine, UCIBestMove, UCIOption, UCIScore } from './types'

/**
 * Parse a UCI "info" line into structured data.
 *
 * Example input:
 *   "info depth 20 seldepth 28 multipv 1 score cp 35 nodes 1234567 nps 1000000 time 1234 pv e2e4 e7e5 g1f3"
 *   "info depth 15 score mate 3 pv e2e4 e7e5 d1h5"
 */
export function parseInfoLine(line: string): UCIInfoLine | null {
  if (!line.startsWith('info ')) return null

  const tokens = line.split(/\s+/)
  let depth = 0
  let seldepth: number | undefined
  let multipv: number | undefined
  let score: UCIScore | undefined
  let nodes: number | undefined
  let nps: number | undefined
  let time: number | undefined
  let pv: string[] = []
  let tbhits: number | undefined
  let hashfull: number | undefined

  for (let i = 1; i < tokens.length; i++) {
    switch (tokens[i]) {
      case 'depth':
        depth = parseInt(tokens[++i], 10)
        break
      case 'seldepth':
        seldepth = parseInt(tokens[++i], 10)
        break
      case 'multipv':
        multipv = parseInt(tokens[++i], 10)
        break
      case 'score':
        {
          const scoreType = tokens[++i]
          const scoreValue = parseInt(tokens[++i], 10)
          if (scoreType === 'cp' || scoreType === 'mate') {
            score = { type: scoreType, value: scoreValue }
          }
        }
        break
      case 'nodes':
        nodes = parseInt(tokens[++i], 10)
        break
      case 'nps':
        nps = parseInt(tokens[++i], 10)
        break
      case 'time':
        time = parseInt(tokens[++i], 10)
        break
      case 'tbhits':
        tbhits = parseInt(tokens[++i], 10)
        break
      case 'hashfull':
        hashfull = parseInt(tokens[++i], 10)
        break
      case 'pv':
        // Everything after "pv" is the principal variation
        pv = tokens.slice(i + 1)
        i = tokens.length
        break
      case 'string':
      case 'currmove':
      case 'currmovenumber':
        // Skip tokens we don't need (consume value)
        i++
        break
    }
  }

  if (!score || depth === 0) return null

  return {
    depth,
    seldepth,
    multipv,
    score,
    nodes,
    nps,
    time,
    pv,
    tbhits,
    hashfull,
  }
}

/**
 * Parse a UCI "bestmove" line.
 *
 * Example input:
 *   "bestmove e2e4 ponder e7e5"
 *   "bestmove e2e4"
 */
export function parseBestMove(line: string): UCIBestMove | null {
  if (!line.startsWith('bestmove ')) return null

  const tokens = line.split(/\s+/)
  const move = tokens[1]
  if (!move || move === '(none)') return null

  const ponderIndex = tokens.indexOf('ponder')
  const ponder = ponderIndex !== -1 ? tokens[ponderIndex + 1] : undefined

  return { move, ponder }
}

/**
 * Parse a lc0 VerboseMoveStats "info string" line to extract a move's policy probability.
 *
 * lc0 emits one line per root move when VerboseMoveStats is enabled, e.g.:
 *   e2e4  (V: +0.31)  (P:  28.17%)  (Q: +0.31)  (U: +0.00)  (Q+U: +0.31)
 *
 * Returns the move (UCI) and its policy probability [0, 1], or null if the line
 * doesn't match the expected format.
 */
export function parseVerboseMoveStatsLine(line: string): { move: string; policy: number } | null {
  const moveMatch = line.match(/\b([a-h][1-8][a-h][1-8][qrbn]?)\b/)
  const policyMatch = line.match(/\(P:\s*([\d.]+)%\)/)
  if (!moveMatch || !policyMatch) return null
  return {
    move: moveMatch[1],
    policy: parseFloat(policyMatch[1]) / 100,
  }
}

/**
 * Parse a UCI "option" line.
 *
 * Example input:
 *   "option name Hash type spin default 16 min 1 max 33554432"
 *   "option name Threads type spin default 1 min 1 max 1024"
 *   "option name UCI_Chess960 type check default false"
 */
export function parseOption(line: string): UCIOption | null {
  if (!line.startsWith('option name ')) return null

  const nameMatch = line.match(/^option name (.+?) type (\w+)/)
  if (!nameMatch) return null

  const name = nameMatch[1]
  const type = nameMatch[2] as UCIOption['type']

  const option: UCIOption = { name, type }

  const defaultMatch = line.match(/default\s+(\S+)/)
  if (defaultMatch) option.default = defaultMatch[1]

  const minMatch = line.match(/min\s+(-?\d+)/)
  if (minMatch) option.min = parseInt(minMatch[1], 10)

  const maxMatch = line.match(/max\s+(-?\d+)/)
  if (maxMatch) option.max = parseInt(maxMatch[1], 10)

  const varMatches = line.matchAll(/var\s+(\S+)/g)
  const vars = Array.from(varMatches, m => m[1])
  if (vars.length > 0) option.vars = vars

  return option
}
