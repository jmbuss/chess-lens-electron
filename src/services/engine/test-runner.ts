/**
 * Engine Test Runner
 *
 * A simple test script to verify that the engine classes can start and run.
 * Run with: npx tsx src/services/engine/test-runner.ts [test-name]
 *
 * Available tests:
 *   stockfish    - Test Stockfish initialization and analysis
 *   maia         - Test Maia (lc0) initialization and move prediction
 *   nag          - Test NAG classification on a short game
 *   fen          - Analyze TEST_FEN only, with debug output (for troubleshooting)
 *   all          - Run all tests (default)
 */

import path from 'node:path'
import os from 'node:os'
import { EngineManager } from './EngineManager'
import { AnalysisService } from './analysis/AnalysisService'
import { NAGService } from './analysis/NAGService'
import { HumanMoveService } from './analysis/HumanMoveService'
import { NAG_SYMBOLS } from './types'

// ==================== Configuration ====================

const RESOURCES_PATH = path.resolve(__dirname, '../../../resources/engines')
const CACHE_PATH = path.join(os.tmpdir(), 'chess-lens-test-engines')

// Stockfish engine settings for speed (use all cores + generous hash)
const STOCKFISH_OPTIONS = {
  threads: os.cpus().length,
  hash: 2048,
}

// Italian Game: 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.d3 Nf6 5.Nc3
const TEST_MOVES = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'd2d3', 'g8f6', 'b1c3']

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

// A position from the Fried Liver Attack where there's a clear best move
const TACTICAL_FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'

// A middlegame position (Sicilian Dragon style)
const TEST_FEN = 'r1bqk2r/pp2ppbp/2p2np1/2p5/4P3/3P1N1P/PPP2PP1/RNBQK2R w KQkq - 1 7'

// ==================== Helpers ====================

function log(section: string, ...args: unknown[]) {
  console.log(`\n[${section}]`, ...args)
}

function logResult(label: string, value: unknown) {
  console.log(`  ${label}: ${JSON.stringify(value)}`)
}

function separator() {
  console.log('\n' + '='.repeat(70))
}

// ==================== Tests ====================

async function testStockfish(manager: EngineManager) {
  separator()
  log('STOCKFISH', 'Initializing Stockfish engine...')

  const engine = await manager.createStockfish(STOCKFISH_OPTIONS)
  log('STOCKFISH', `Engine ready: ${engine.getEngineName()}`)
  log('STOCKFISH', `Status: ${engine.getStatus()}`)

  // Test 1: Single position analysis
  log('STOCKFISH', 'Analyzing starting position (depth 40)...')
  const analysis = new AnalysisService(engine)
  const result = await analysis.analyzePosition(STARTING_FEN, { depth: 40, multipv: 1 })

  log('STOCKFISH', 'Starting position analysis:')
  for (const line of result.lines) {
    const scoreStr =
      line.score.type === 'cp'
        ? `${(line.score.value / 100).toFixed(2)} pawns`
        : `mate in ${line.score.value}`
    logResult(`  Line ${line.multipv}`, `${scoreStr} | PV: ${line.pv.slice(0, 5).join(' ')}`)
  }

  // Test 2: Tactical position
  log('STOCKFISH', 'Analyzing tactical position (depth 40)...')
  const tactical = await analysis.analyzePosition(TACTICAL_FEN, { depth: 40, multipv: 1 })
  const topLine = tactical.lines[0]
  if (topLine) {
    const scoreStr =
      topLine.score.type === 'cp'
        ? `${(topLine.score.value / 100).toFixed(2)} pawns`
        : `mate in ${topLine.score.value}`
    log('STOCKFISH', `Best move: ${topLine.pv[0]} (${scoreStr})`)
    log('STOCKFISH', `PV: ${topLine.pv.join(' ')}`)
  }

  // Test 3: Quick eval
  log('STOCKFISH', 'Quick eval of starting position (depth 40)...')
  const quickResult = await analysis.quickEval(STARTING_FEN, 40)
  if (quickResult) {
    log('STOCKFISH', `Eval: ${quickResult.score.value}cp, best: ${quickResult.pv[0]}`)
  }

  // Test 4: User-provided test FEN
  log('STOCKFISH', `Analyzing test position (depth 40, FEN: ${TEST_FEN})...`)
  const testResult = await analysis.analyzePosition(TEST_FEN, { depth: 40, multipv: 1 })
  const testTopLine = testResult.lines[0]
  if (testTopLine) {
    const scoreStr =
      testTopLine.score.type === 'cp'
        ? `${(testTopLine.score.value / 100).toFixed(2)} pawns`
        : `mate in ${testTopLine.score.value}`
    log('STOCKFISH', `Best move: ${testTopLine.pv[0]} (${scoreStr})`)
    log('STOCKFISH', `PV: ${testTopLine.pv.slice(0, 6).join(' ')}`)
  }

  await manager.quitEngine('stockfish')
  log('STOCKFISH', 'Engine shut down. PASSED')
}

async function testStockfishFen(manager: EngineManager) {
  separator()
  log('FEN', `Analyzing TEST_FEN only (with debug output)...`)
  log('FEN', `FEN: ${TEST_FEN}`)

  const engine = await manager.createStockfish(STOCKFISH_OPTIONS)
  log('FEN', `Engine ready: ${engine.getEngineName()}`)

  const analysis = new AnalysisService(engine)
  const result = await analysis.analyzePosition(TEST_FEN, {
    depth: 40,
    multipv: 1,
    debug: true,
  })

  const topLine = result.lines[0]
  if (topLine) {
    const scoreStr =
      topLine.score.type === 'cp'
        ? `${(topLine.score.value / 100).toFixed(2)} pawns`
        : `mate in ${topLine.score.value}`
    log('FEN', `Best move: ${topLine.pv[0]} (${scoreStr})`)
    log('FEN', `PV: ${topLine.pv.join(' ')}`)
  }

  await manager.quitEngine('stockfish')
  log('FEN', 'Engine shut down. PASSED')
}

async function testMaia(manager: EngineManager) {
  separator()
  log('MAIA', 'Initializing Maia (lc0 + maia-1500 network)...')

  const engine = await manager.createMaia(1500)
  log('MAIA', `Engine ready: ${engine.getEngineName()}`)
  log('MAIA', `Status: ${engine.getStatus()}`)

  const humanMoveService = new HumanMoveService()
  humanMoveService.registerEngine(1500, engine)

  // Test 1: Predict a move from starting position
  log('MAIA', 'Predicting human move from starting position...')
  const prediction = await humanMoveService.predictMove(STARTING_FEN, 1500)
  log('MAIA', `Maia-1500 would play: ${prediction[0]?.move}`)

  // Test 2: Predict from tactical position
  log('MAIA', 'Predicting human move from tactical position...')
  const tacticalPrediction = await humanMoveService.predictMove(TACTICAL_FEN, 1500)
  log('MAIA', `Maia-1500 would play: ${tacticalPrediction[0]?.move}`)

  // Test 3: Predict from user-provided test FEN
  log('MAIA', `Predicting human move from test position (FEN: ${TEST_FEN})...`)
  const testPrediction = await humanMoveService.predictMove(TEST_FEN, 1500)
  log('MAIA', `Maia-1500 would play: ${testPrediction[0]?.move}`)

  // Test 4: Multiple variations (top 3)
  log('MAIA', 'Predicting top 3 human moves from starting position...')
  const top3 = await humanMoveService.predictMove(STARTING_FEN, 1500, 3)
  for (const p of top3) {
    logResult(`  Rank ${p.rank}`, `${p.move}${p.score !== undefined ? ` (score: ${p.score})` : ''}`)
  }

  // Test 5: Multiple ratings
  log('MAIA', 'Testing multiple Maia ratings...')
  const ratings = [1100, 1500, 1900] as const
  for (const rating of ratings) {
    if (rating === 1500) {
      // Already initialized
      const pred = await humanMoveService.predictMove(STARTING_FEN, 1500)
      logResult(`Maia-${rating}`, pred[0]?.move)
    } else {
      const ratingEngine = await manager.createMaia(rating)
      humanMoveService.registerEngine(rating, ratingEngine)
      const pred = await humanMoveService.predictMove(STARTING_FEN, rating)
      logResult(`Maia-${rating}`, pred[0]?.move)
    }
  }

  // Test 6: Analyze game moves
  log('MAIA', 'Analyzing game moves against Maia-1500 predictions...')
  const shortMoves = TEST_MOVES.slice(0, 4)
  const gameAnalysis = await humanMoveService.analyzeGameMoves(shortMoves, 1500)
  for (const m of gameAnalysis) {
    const matchStr = m.matchesPrediction ? 'MATCH' : 'DIFFERS'
    logResult(
      `Move ${m.moveIndex + 1}`,
      `Played: ${m.movePlayed} | Maia: ${m.maiaPrediction} | ${matchStr}`
    )
  }

  // Cleanup all Maia engines
  for (const rating of ratings) {
    await manager.quitEngine(`maia-${rating}`)
  }
  log('MAIA', 'Engines shut down. PASSED')
}

async function testNAG(manager: EngineManager) {
  separator()
  log('NAG', 'Initializing Stockfish for NAG classification...')

  const engine = await manager.createStockfish(STOCKFISH_OPTIONS)
  log('NAG', `Engine ready: ${engine.getEngineName()}`)

  const nagService = new NAGService(engine)

  // Classify moves from the test game
  log('NAG', `Classifying ${TEST_MOVES.length} moves (depth 12)...`)
  const classifications = await nagService.classifyGame(TEST_MOVES, { depth: 12 }, undefined, (
    completed,
    total
  ) => {
    process.stdout.write(`\r  Progress: ${completed}/${total}`)
  })
  console.log() // newline after progress

  log('NAG', 'Move classifications:')
  for (const c of classifications) {
    const symbolStr = c.symbol ? ` (${c.symbol})` : ''
    logResult(
      `Move ${c.moveIndex + 1}: ${c.move}`,
      `NAG=${c.nag}${symbolStr} | WR: ${(c.winRateBefore * 100).toFixed(1)}% → ${(c.winRateAfter * 100).toFixed(1)}% | Loss: ${(c.winRateLoss * 100).toFixed(1)}% | Best: ${c.bestMove}`
    )
  }

  await manager.quitEngine('stockfish')
  log('NAG', 'Engine shut down. PASSED')
}

// ==================== Main ====================

async function main() {
  const testArg = process.argv[2] ?? 'all'

  console.log('Chess Engine Test Runner')
  console.log(`Resources path: ${RESOURCES_PATH}`)
  console.log(`Cache path: ${CACHE_PATH}`)
  console.log(`Test: ${testArg}`)

  const manager = new EngineManager(RESOURCES_PATH, CACHE_PATH)

  try {
    if (testArg === 'all' || testArg === 'stockfish') {
      await testStockfish(manager)
    }

    if (testArg === 'fen') {
      await testStockfishFen(manager)
    }

    if (testArg === 'all' || testArg === 'maia') {
      await testMaia(manager)
    }

    if (testArg === 'all' || testArg === 'nag') {
      await testNAG(manager)
    }

    separator()
    console.log('\nAll tests completed successfully!')
  } catch (error) {
    console.error('\nTest FAILED:', error)
    process.exitCode = 1
  } finally {
    await manager.quitAll()
  }
}

main()
