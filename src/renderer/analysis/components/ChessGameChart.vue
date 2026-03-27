<script setup lang="ts">
import { computed } from 'vue'
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
import { useInjectedGameAnalysis } from '../composables/provideGameAnalysis'
import { useInjectedGameNavigator } from '../composables/provideChessGame'
import type { AnalysisNode } from 'src/database/analysis/types'
import { useDarkMode } from 'src/renderer/composables/darkMode/useDarkMode'

use([CanvasRenderer, LineChart, BarChart, GridComponent, TooltipComponent, MarkLineComponent, DataZoomComponent, LegendComponent])

const { analysisTree } = useInjectedGameAnalysis()
const { currentFen, moveList, goToNode } = useInjectedGameNavigator()
const { isDark } = useDarkMode()

// ── Phase color interpolation ──────────────────────────────────────────────────
//
// phaseScore is a continuous value: 128 = pure opening (full material),
// 64 = pure middlegame, 0 = pure endgame (minimal material).

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
    // opening → middlegame  (phase 128 → 64)
    t = (p - 64) / 64
    c1 = PHASE_RGBA.middlegame
    c2 = PHASE_RGBA.opening
  } else {
    // middlegame → endgame  (phase 64 → 0)
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

// ── Tree helpers ───────────────────────────────────────────────────────────────

function getMainLine(root: AnalysisNode | null): AnalysisNode[] {
  const nodes: AnalysisNode[] = []
  let current: AnalysisNode | null = root
  while (current) {
    nodes.push(current)
    current = current.children[0] ?? null
  }
  return nodes
}

// ── Data helpers ───────────────────────────────────────────────────────────────

function clampEval(node: AnalysisNode): number | null {
  const { engineResult } = node
  if (!engineResult) return null
  if (engineResult.evalMate != null) return engineResult.evalMate > 0 ? 10 : -10
  if (engineResult.evalCp != null) return Math.max(-10, Math.min(10, engineResult.evalCp / 100))
  return null
}

/**
 * Returns one bar datum per move for the phase-background series.
 * Each bar has value 1 (full height on the hidden 0-1 axis) and is tinted
 * with the interpolated phase color. Nodes without phaseScore data yet are
 * rendered transparent so no false color appears during in-progress analysis.
 */
function buildPhaseBackground(nodes: AnalysisNode[]) {
  return nodes.map(n => ({
    value: 1,
    itemStyle: {
      color: n.phaseScore != null ? interpolatePhaseColor(n.phaseScore) : 'rgba(0,0,0,0)',
    },
  }))
}

// ── Computed chart data ────────────────────────────────────────────────────────

const mainLineNodes = computed(() => getMainLine(analysisTree.value))
const moveNodes = computed(() => mainLineNodes.value.slice(1))
const hasData = computed(() => moveNodes.value.length > 0)

const currentMoveIndex = computed(() =>
  moveNodes.value.findIndex(n => n.fen === currentFen.value),
)

const handleChartClick = (params: { dataIndex: number }) => {
  const node = moveNodes.value[params.dataIndex]
  if (!node) return
  const gameNode = moveList.value.find(n => n.data.fen === node.fen)
  if (gameNode) goToNode(gameNode)
}

const option = computed((): EChartsOption => {
  const nodes = moveNodes.value

  const moveLabels = nodes.map(n => {
    const prefix = n.color === 'w' ? `${n.moveNumber}.` : `${n.moveNumber}...`
    return `${prefix} ${n.san ?? ''}`
  })

  const evalData = nodes.map(n => clampEval(n))

  // maiaFloorBestEval on node N = "Stockfish eval of Maia's top move *from* position N"
  // That's the eval of the position reached at N+1, so to align with the Stockfish
  // evalCp at chart position i (= eval after move i was played), we read Maia's best
  // eval from the *parent* node (mainLineNodes[i]), not from moveNodes[i] itself.
  const maiaFloorData = nodes.map((_, i) => {
    const parent = mainLineNodes.value[i]
    const v = parent?.maiaFloorBestEval
    if (v == null) return null
    return Math.max(-10, Math.min(10, v / 100))
  })

  const maiaCeilingData = nodes.map((_, i) => {
    const parent = mainLineNodes.value[i]
    const v = parent?.maiaCeilingBestEval
    if (v == null) return null
    return Math.max(-10, Math.min(10, v / 100))
  })

  const phaseBackground = buildPhaseBackground(nodes)

  const labelInterval = Math.max(0, Math.floor(nodes.length / 16) - 1)

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
        const node = nodes[idx]
        const evalItem = items.find(p => p.seriesName === 'Eval')
        const maiaFloorItem = items.find(p => p.seriesName === 'Maia Floor')
        const maiaCeilingItem = items.find(p => p.seriesName === 'Maia Ceiling')
        const evalStr = formatEvalTooltip(evalItem?.value)
        const maiaFloorStr = formatEvalTooltip(maiaFloorItem?.value)
        const maiaCeilingStr = formatEvalTooltip(maiaCeilingItem?.value)
        const phaseStr = node?.phaseScore != null ? node.phaseScore.toString() : '–'
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
        xAxisIndex: 0,
        start: 0,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        preventDefaultMouseMove: true,
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
        // index 0 — eval  (auto-fit to dataset with small padding)
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
        // index 1 — phase background  (0 to 1, hidden)
        type: 'value',
        min: 0,
        max: 1,
        show: false,
      },
    ],
    series: [
      {
        // Phase background: full-width bars, one per move, z=0 (behind everything)
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
        // Eval: smooth line on top
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
        // Invisible full-height bars used as click targets so any click in a column registers
        name: 'ClickTarget',
        type: 'bar',
        barWidth: '100%',
        barCategoryGap: '0%',
        data: nodes.map(() => ({ value: 1, itemStyle: { opacity: 0 }, cursor: 'pointer' })),
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
  <VChart v-else :option="option" autoresize class="w-full h-full cursor-pointer" @click="handleChartClick" />
</template>
