<script setup lang="ts">
import { computed, ref } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  DataZoomComponent,
  LegendComponent,
} from 'echarts/components'
import type { EChartsOption } from 'echarts'
import type { PositionAnalysis } from 'src/database/analysis/types'
import { useDarkMode } from 'src/renderer/composables/darkMode/useDarkMode'
import { useInjectedGameAnalysis } from '../composables/provideGameAnalysis'
import { useInjectedGameNavigator } from '../composables/provideChessGame'
import {
  handleShiftWheelYAxisDataZoom,
  type EChartsComponentApi,
} from '../composables/yAxisWheelDataZoom'
import type { GameNode, GameChildNode } from '../composables/types'

use([CanvasRenderer, LineChart, BarChart, GridComponent, TooltipComponent, MarkLineComponent, DataZoomComponent, LegendComponent])

const GAME_CHART_X_DZ_ID = 'gameChartInsideX'
const GAME_CHART_Y_DZ_ID = 'gameChartInsideY'

const { analysisByFen } = useInjectedGameAnalysis()
const { currentFen, moveList, goToNode, root } = useInjectedGameNavigator()
const { isDark } = useDarkMode()

// ── Phase color interpolation ──────────────────────────────────────────────────

const PHASE_RGBA = {
  opening:    { r: 31,  g: 156, b: 137, a: 0.22 },
  middlegame: { r: 120, g: 120, b: 120, a: 0.06 },
  endgame:    { r: 180, g: 90,  b: 30,  a: 0.22 },
}

function interpolatePhaseColor(phase: number): string {
  const p = Math.max(0, Math.min(128, phase))
  let t: number
  let c1: typeof PHASE_RGBA.opening
  let c2: typeof PHASE_RGBA.opening

  if (p >= 64) {
    t = (p - 64) / 64
    c1 = PHASE_RGBA.middlegame
    c2 = PHASE_RGBA.opening
  } else {
    t = p / 64
    c1 = PHASE_RGBA.endgame
    c2 = PHASE_RGBA.middlegame
  }

  const r = Math.round(c1.r + (c2.r - c1.r) * t)
  const g = Math.round(c1.g + (c2.g - c1.g) * t)
  const b = Math.round(c1.b + (c2.b - c1.b) * t)
  const a = c1.a + (c2.a - c1.a) * t
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`
}

// ── Mainline helpers ───────────────────────────────────────────────────────────

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

interface MainlineEntry {
  fen: string
  analysis: PositionAnalysis | undefined
  san?: string
  color?: 'w' | 'b'
  moveNumber?: number
}

function getMainLine(gameRoot: GameNode): MainlineEntry[] {
  const entries: MainlineEntry[] = [{
    fen: STARTING_FEN,
    analysis: undefined,
  }]
  let current: GameNode | GameChildNode = gameRoot
  while (current.children.length > 0) {
    const child = current.children[0] as GameChildNode
    entries.push({
      fen: child.data.fen,
      san: child.data.san,
      color: child.data.color,
      moveNumber: child.data.moveNumber,
      analysis: undefined,
    })
    current = child
  }
  return entries
}

// ── Data helpers ───────────────────────────────────────────────────────────────

function clampEval(a: PositionAnalysis | undefined): number | null {
  if (!a?.engineResult) return null
  if (a.engineResult.evalMate != null) return a.engineResult.evalMate > 0 ? 10 : -10
  if (a.engineResult.evalCp != null) return Math.max(-10, Math.min(10, a.engineResult.evalCp / 100))
  return null
}

function buildPhaseBackground(entries: MainlineEntry[]) {
  return entries.map(e => ({
    value: 1,
    itemStyle: {
      color: e.analysis?.phaseScore != null ? interpolatePhaseColor(e.analysis.phaseScore) : 'rgba(0,0,0,0)',
    },
  }))
}

// ── Computed chart data ────────────────────────────────────────────────────────

const mainLineEntries = computed(() => {
  if (!root.value) return []
  const entries = getMainLine(root.value as GameNode)
  const map = analysisByFen.value
  for (const entry of entries) {
    entry.analysis = map.get(entry.fen)
  }
  return entries
})

const moveEntries = computed(() => mainLineEntries.value.slice(1))
const hasData = computed(() => moveEntries.value.length > 0)

const currentMoveIndex = computed(() =>
  moveEntries.value.findIndex(e => e.fen === currentFen.value),
)

const gameChartRef = ref<EChartsComponentApi | null>(null)

function onGameChartWheelCapture(e: WheelEvent) {
  if (!hasData.value || !e.shiftKey) return
  handleShiftWheelYAxisDataZoom(gameChartRef.value, e, GAME_CHART_Y_DZ_ID)
}

const handleChartClick = (params: { dataIndex: number }) => {
  const entry = moveEntries.value[params.dataIndex]
  if (!entry) return
  const gameNode = moveList.value.find(n => n.data.fen === entry.fen)
  if (gameNode) goToNode(gameNode)
}

const option = computed((): EChartsOption => {
  const entries = moveEntries.value

  const moveLabels = entries.map(e => {
    const prefix = e.color === 'w' ? `${e.moveNumber}.` : `${e.moveNumber}...`
    return `${prefix} ${e.san ?? ''}`
  })

  const evalData = entries.map(e => clampEval(e.analysis))

  // maiaFloorBestEval on position N = "Stockfish eval of Maia's top move *from* position N"
  // Align with Stockfish evalCp at chart position i by reading from the parent.
  const maiaFloorData = entries.map((_, i) => {
    const parent = mainLineEntries.value[i]
    const v = parent?.analysis?.maiaFloorBestEval
    if (v == null) return null
    return Math.max(-10, Math.min(10, v / 100))
  })

  const maiaCeilingData = entries.map((_, i) => {
    const parent = mainLineEntries.value[i]
    const v = parent?.analysis?.maiaCeilingBestEval
    if (v == null) return null
    return Math.max(-10, Math.min(10, v / 100))
  })

  const phaseBackground = buildPhaseBackground(entries)

  const labelInterval = Math.max(0, Math.floor(entries.length / 16) - 1)

  const allEvalValues = [...evalData, ...maiaFloorData, ...maiaCeilingData].filter((v): v is number => v != null)
  const dataMin = allEvalValues.length ? Math.min(...allEvalValues) : -10
  const dataMax = allEvalValues.length ? Math.max(...allEvalValues) : 10
  const padding = Math.max(0.5, (dataMax - dataMin) * 0.08)
  const yMin = Math.round(Math.max(-10, dataMin - padding) * 100) / 100
  const yMax = Math.round(Math.min(10, dataMax + padding) * 100) / 100

  const axisLabelColor = isDark.value ? '#a2b1b8' : '#888'
  const axisLineColor  = isDark.value ? '#445969' : '#ccc'
  const splitLineColor = isDark.value ? '#374a57' : '#e8e8e8'
  const markLineColor  = isDark.value ? '#566e79' : '#bbb'

  const formatEvalTooltip = (v: number | null | undefined): string => {
    if (v == null) return '–'
    if (v === 10) return '+M'
    if (v === -10) return '-M'
    return `${v > 0 ? '+' : ''}${v.toFixed(2)}`
  }

  const formatMaiaTooltip = (parentAnalysis: PositionAnalysis | undefined, key: 'augmentedMaiaFloor' | 'augmentedMaiaCeiling'): string => {
    const topPrediction = parentAnalysis?.[key]?.predictions[0]
    if (!topPrediction) return '–'
    const score = topPrediction.stockfishScore
    if (score == null) return '–'
    if (score.type === 'mate') return score.value > 0 ? `+M${Math.abs(score.value)}` : `-M${Math.abs(score.value)}`
    if (score.type === 'cp') {
      const v = Math.max(-10, Math.min(10, score.value / 100))
      return `${v > 0 ? '+' : ''}${v.toFixed(2)}`
    }
    return '–'
  }

  return {
    animation: false,
    backgroundColor: 'transparent',
    grid: {
      top: 28,
      right: 16,
      bottom: 48,
      left: 42,
    },
    legend: {
      data: ['Eval', 'Maia Floor', 'Maia Ceiling'],
      top: 4,
      right: 16,
      textStyle: { color: axisLabelColor, fontSize: 9 },
      itemWidth: 14,
      itemHeight: 6,
      icon: 'rect',
    },
    tooltip: {
      appendTo: 'body',
      extraCssText: 'z-index: 999999;',
      trigger: 'axis',
      axisPointer: { type: 'line' },
      backgroundColor: isDark.value ? '#2c3b45' : '#fff',
      borderColor: isDark.value ? '#445969' : '#e0e0e0',
      textStyle: { color: isDark.value ? '#e8ebd4' : '#2e351a' },
      formatter: (params: unknown) => {
        const items = params as Array<{ seriesName: string; value: number | null; name: string; dataIndex?: number }>
        if (!items?.length) return ''
        const move = items[0].name
        const idx = items[0].dataIndex ?? 0
        const entry = entries[idx]
        const parentEntry = mainLineEntries.value[idx]
        const evalItem = items.find(p => p.seriesName === 'Eval')
        const evalStr = formatEvalTooltip(evalItem?.value)
        const maiaFloorStr = formatMaiaTooltip(parentEntry?.analysis, 'augmentedMaiaFloor')
        const maiaCeilingStr = formatMaiaTooltip(parentEntry?.analysis, 'augmentedMaiaCeiling')
        const phaseStr = entry?.analysis?.phaseScore != null ? entry.analysis.phaseScore.toString() : '–'
        return (
          `<b>${move}</b>` +
          `<br/>Stockfish: ${evalStr}` +
          `<br/>Maia Floor: ${maiaFloorStr}` +
          `<br/>Maia Ceiling: ${maiaCeilingStr}` +
          `<br/>Phase: ${phaseStr}`
        )
      },
    },
    dataZoom: [
      {
        type: 'inside',
        id: GAME_CHART_X_DZ_ID,
        xAxisIndex: 0,
        start: 0,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        preventDefaultMouseMove: true,
      },
      {
        type: 'inside',
        id: GAME_CHART_Y_DZ_ID,
        yAxisIndex: 0,
        start: 0,
        end: 100,
        zoomOnMouseWheel: false,
        moveOnMouseMove: false,
        preventDefaultMouseMove: true,
        minSpan: 5,
      },
    ],
    xAxis: {
      type: 'category',
      data: moveLabels,
      axisLabel: {
        rotate: 40,
        interval: labelInterval,
        fontSize: 9,
        color: axisLabelColor,
      },
      axisLine: { lineStyle: { color: axisLineColor } },
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        min: yMin,
        max: yMax,
        splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } },
        axisLabel: {
          fontSize: 9,
          color: axisLabelColor,
          formatter: (v: number) => (v > 0 ? `+${v}` : `${v}`),
        },
      },
      {
        type: 'value',
        min: 0,
        max: 1,
        show: false,
      },
    ],
    series: [
      {
        name: 'Phase',
        type: 'bar',
        barWidth: '100%',
        barCategoryGap: '0%',
        data: phaseBackground,
        yAxisIndex: 1,
        silent: true,
        z: 0,
        animation: false,
      },
      {
        name: 'Maia Floor',
        type: 'line',
        data: maiaFloorData,
        yAxisIndex: 0,
        smooth: 0.3,
        symbol: 'none',
        connectNulls: false,
        itemStyle: { color: '#06b6d4' },
        lineStyle: { color: '#06b6d4', width: 1.5, type: 'dashed' },
        z: 3,
      },
      {
        name: 'Maia Ceiling',
        type: 'line',
        data: maiaCeilingData,
        yAxisIndex: 0,
        smooth: 0.3,
        symbol: 'none',
        connectNulls: false,
        itemStyle: { color: '#f97316' },
        lineStyle: { color: '#f97316', width: 1.5, type: 'dashed' },
        z: 3,
      },
      {
        name: 'Eval',
        type: 'line',
        data: evalData,
        yAxisIndex: 0,
        smooth: 0.3,
        symbol: 'none',
        connectNulls: false,
        itemStyle: { color: '#22c55e' },
        lineStyle: { color: '#22c55e', width: 2 },
        z: 4,
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            { yAxis: 0, lineStyle: { color: markLineColor, type: 'solid', width: 1 } },
            ...(currentMoveIndex.value >= 0
              ? [{ xAxis: currentMoveIndex.value, lineStyle: { color: '#22c55e', type: 'dashed' as const, width: 1.5, opacity: 0.6 } }]
              : []),
          ],
          label: { show: false },
        },
      },
      {
        name: 'ClickTarget',
        type: 'bar',
        barWidth: '100%',
        barCategoryGap: '0%',
        data: entries.map(() => ({ value: 1, itemStyle: { opacity: 0 }, cursor: 'pointer' })),
        yAxisIndex: 1,
        z: 5,
        emphasis: { disabled: true },
      },
    ],
  }
})
</script>

<template>
  <div class="w-full h-full flex items-center justify-center" v-if="!hasData">
    <p class="text-sm text-muted">No analysis data yet.</p>
  </div>
  <div v-else class="w-full h-full relative" @wheel.capture="onGameChartWheelCapture">
    <VChart
      ref="gameChartRef"
      :option="option"
      autoresize
      class="w-full h-full cursor-pointer"
      @click="handleChartClick"
    />
  </div>
</template>
