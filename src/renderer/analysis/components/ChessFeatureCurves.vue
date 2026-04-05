<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import { Check, ChevronsUpDown, X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components'
import type { EChartsOption } from 'echarts'
import type { PositionAnalysis, PositionalFeatures } from 'src/database/analysis/types'
import { useDarkMode } from 'src/renderer/composables/darkMode/useDarkMode'
import { useInjectedGameAnalysis } from '../composables/provideGameAnalysis'
import { useInjectedGameNavigator } from '../composables/provideChessGame'
import { useStoredLegendSelection } from '../composables/useStoredLegendSelection'
import {
  handleShiftWheelYAxisDataZoom,
  type EChartsComponentApi,
} from '../composables/yAxisWheelDataZoom'
import type { GameNode, GameChildNode } from '../composables/types'

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
])

const FEATURE_CURVES_X_DZ_ID = 'featureCurvesInsideX'
const FEATURE_CURVES_Y_DZ_ID = 'featureCurvesInsideY'

const { analysisByFen } = useInjectedGameAnalysis()
const { moveList, goToNode, root, currentFen } = useInjectedGameNavigator()
const { isDark } = useDarkMode()

// ── Radar axis / term constants (mirrored from ChessPositionalRadar) ──────

const SATURATION = {
  material: 3.0,
  structure: 4.0,
  activity: 2.0,
  safety: 2.0,
} as const

const BAR_SATURATION = 3.0
const MATERIAL_SWING_SATURATION_CP = 200
const MATERIAL_TERM_KEYS = new Set(['material', 'imbalance'])

// ── Colours ───────────────────────────────────────────────────────────────

const EVAL_COLOR = '#fbbf24'

const AXIS_COLORS = {
  material: '#d4a84b',
  structure: '#10b981',
  activity: '#3b82f6',
  safety: '#ef4444',
} as const

const TERM_COLORS: Record<string, string> = {
  material: '#f59e0b',
  imbalance: '#fb923c',
  pawns: '#22c55e',
  passed: '#14b8a6',
  knights: '#60a5fa',
  bishops: '#818cf8',
  rooks: '#a78bfa',
  queens: '#c084fc',
  mobility: '#38bdf8',
  kingSafety: '#f87171',
  threats: '#fb7185',
  space: '#06b6d4',
  winnable: '#6b7280',
}

// ── Types ─────────────────────────────────────────────────────────────────

const TERM_ORDER: Array<{ key: keyof PositionalFeatures; label: string }> = [
  { key: 'material', label: 'Material' },
  { key: 'imbalance', label: 'Imbalance' },
  { key: 'pawns', label: 'Pawns' },
  { key: 'passed', label: 'Passed Pawns' },
  { key: 'knights', label: 'Knights' },
  { key: 'bishops', label: 'Bishops' },
  { key: 'rooks', label: 'Rooks' },
  { key: 'queens', label: 'Queens' },
  { key: 'mobility', label: 'Mobility' },
  { key: 'kingSafety', label: 'King Safety' },
  { key: 'threats', label: 'Threats' },
  { key: 'space', label: 'Space' },
]

// ── Legend state ───────────────────────────────────────────────────────────

const RADAR_AXIS_LABELS = ['Material', 'Structure', 'Activity', 'Safety'] as const
const radarAxisNames = RADAR_AXIS_LABELS.flatMap(a => [`${a} (W)`, `${a} (B)`])
const termSeriesNames = TERM_ORDER.flatMap(t => [`${t.label} (W)`, `${t.label} (B)`])
const OVERVIEW_SERIES = ['Eval'] as const
const allLegendSeriesNames = [...OVERVIEW_SERIES, ...radarAxisNames, ...termSeriesNames] as const

const RADAR_LABEL_TO_COLOR: Record<(typeof RADAR_AXIS_LABELS)[number], string> = {
  Material: AXIS_COLORS.material,
  Structure: AXIS_COLORS.structure,
  Activity: AXIS_COLORS.activity,
  Safety: AXIS_COLORS.safety,
}

const legendSelected = useStoredLegendSelection(
  'chess-lens.analysis.feature-curves.legend',
  () => ({
    Eval: true,
    ...Object.fromEntries(radarAxisNames.map(n => [n, true])),
    ...Object.fromEntries(termSeriesNames.map(n => [n, false])),
  }),
  allLegendSeriesNames,
)

const seriesPickerOpen = ref(false)
const seriesPickerSession = ref(0)
watch(seriesPickerOpen, open => {
  if (open) seriesPickerSession.value += 1
})

const visibleSeriesOrdered = computed(() =>
  allLegendSeriesNames.filter(name => legendSelected.value[name])
)

function seriesSwatchColor(name: string): string {
  if (name === 'Eval') return EVAL_COLOR
  const radar = /^(Material|Structure|Activity|Safety) \(([WB])\)$/.exec(name)
  if (radar && radar[1] in RADAR_LABEL_TO_COLOR) {
    return RADAR_LABEL_TO_COLOR[radar[1] as keyof typeof RADAR_LABEL_TO_COLOR]
  }
  const term = TERM_ORDER.find(t => name === `${t.label} (W)` || name === `${t.label} (B)`)
  if (term) return TERM_COLORS[term.key] ?? '#888'
  return '#888'
}

function isSeriesVisible(name: string): boolean {
  return legendSelected.value[name] ?? false
}

function toggleLegendSeries(name: string) {
  const cur = legendSelected.value[name] ?? false
  legendSelected.value = { ...legendSelected.value, [name]: !cur }
}

function setSeriesVisible(name: string, visible: boolean) {
  legendSelected.value = { ...legendSelected.value, [name]: visible }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function blendMgEg(mg: number, eg: number, t: number): number {
  return mg * t + eg * (1 - t)
}

function radarBlend(mg: number, eg: number, t: number, sat: number): number {
  const interpolated = blendMgEg(mg, eg, t)
  return Math.max(0, Math.min(1, 0.5 + interpolated / sat))
}

function toChart(radar01: number): number {
  return (radar01 - 0.5) * 2
}

function materialConfidence(evalSwingCp: number | null): number {
  if (evalSwingCp == null) return 1
  return Math.max(0, 1 - Math.abs(evalSwingCp) / MATERIAL_SWING_SATURATION_CP)
}

// ── Mainline extraction ────────────────────────────────────────────────────

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

interface MainlineEntry {
  fen: string
  analysis: PositionAnalysis | undefined
  san?: string
  color?: 'w' | 'b'
  moveNumber?: number
}

function getMainLine(gameRoot: GameNode): MainlineEntry[] {
  const entries: MainlineEntry[] = [{ fen: STARTING_FEN, analysis: undefined }]
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

// ── Chart ─────────────────────────────────────────────────────────────────

const currentMoveIndex = computed(() =>
  moveEntries.value.findIndex(e => e.fen === currentFen.value)
)

const featureChartRef = ref<EChartsComponentApi | null>(null)

function onFeatureChartWheelCapture(e: WheelEvent) {
  if (!hasData.value || !e.shiftKey) return
  handleShiftWheelYAxisDataZoom(featureChartRef.value, e, FEATURE_CURVES_Y_DZ_ID)
}

const handleChartClick = (params: { dataIndex: number }) => {
  const entry = moveEntries.value[params.dataIndex]
  if (!entry) return
  const gameNode = moveList.value.find(n => n.data.fen === entry.fen)
  if (gameNode) goToNode(gameNode)
}

function getEvalCp(a: PositionAnalysis | undefined): number | null {
  if (!a?.engineResult) return null
  if (a.engineResult.evalMate != null) return a.engineResult.evalMate > 0 ? 1000 : -1000
  return a.engineResult.evalCp ?? null
}

interface PerMoveData {
  f: PositionalFeatures | null
  t: number
  conf: number
}

const option = computed((): EChartsOption => {
  const all = mainLineEntries.value
  const entries = moveEntries.value

  const moveLabels = entries.map(e => {
    const prefix = e.color === 'w' ? `${e.moveNumber}.` : `${e.moveNumber}...`
    return `${prefix} ${e.san ?? ''}`
  })

  const axisLabelColor = isDark.value ? '#a2b1b8' : '#888'
  const axisLineColor = isDark.value ? '#445969' : '#ccc'
  const splitLineColor = isDark.value ? '#374a57' : '#e8e8e8'
  const markLineColor = isDark.value ? '#566e79' : '#bbb'
  const labelInterval = Math.max(0, Math.floor(entries.length / 16) - 1)

  // Eval (fixed scale)
  const EVAL_SATURATION_CP = 600
  const evalRaw = entries.map(e => getEvalCp(e.analysis))
  const evalNormalized = evalRaw.map(v =>
    v === null ? null : Math.max(-1, Math.min(1, v / EVAL_SATURATION_CP))
  )

  // Per-move: features, phase weight, materialConfidence
  const perMove: PerMoveData[] = entries.map((e, i) => {
    const a = e.analysis
    const f = a?.positionalFeatures ?? null
    const t = a?.phaseScore != null ? Math.max(0, Math.min(1, a.phaseScore / 128)) : 0.5
    const prevEval = getEvalCp(all[i]?.analysis)
    const curEval = getEvalCp(a)
    const swing = prevEval != null && curEval != null ? curEval - prevEval : null
    const conf = materialConfidence(swing)
    return { f, t, conf }
  })

  // ── Radar axis series (mapped from [0,1] to [-1,1]) ────────────────────

  type AxisPair = { w: (number | null)[]; b: (number | null)[] }

  const materialAxis: AxisPair = { w: [], b: [] }
  const structureAxis: AxisPair = { w: [], b: [] }
  const activityAxis: AxisPair = { w: [], b: [] }
  const safetyAxis: AxisPair = { w: [], b: [] }

  // Raw values for tooltip (before chart mapping)
  const materialRaw: { w: number[]; b: number[] } = { w: [], b: [] }
  const structureRaw: { w: number[]; b: number[] } = { w: [], b: [] }
  const activityRaw: { w: number[]; b: number[] } = { w: [], b: [] }
  const safetyRaw: { w: number[]; b: number[] } = { w: [], b: [] }

  for (const { f, t, conf } of perMove) {
    if (!f) {
      for (const axis of [materialAxis, structureAxis, activityAxis, safetyAxis]) {
        axis.w.push(null)
        axis.b.push(null)
      }
      for (const raw of [materialRaw, structureRaw, activityRaw, safetyRaw]) {
        raw.w.push(0)
        raw.b.push(0)
      }
      continue
    }

    // Material — total split into white/black, dampened by confidence
    const matMg = (f.material.total?.mg ?? 0) + (f.imbalance.total?.mg ?? 0)
    const matEg = (f.material.total?.eg ?? 0) + (f.imbalance.total?.eg ?? 0)
    const matInterp = blendMgEg(matMg, matEg, t)
    const mw = Math.max(0, Math.min(1, 0.5 + (matInterp * conf) / SATURATION.material))
    const mb = Math.max(0, Math.min(1, 0.5 - (matInterp * conf) / SATURATION.material))
    materialAxis.w.push(toChart(mw))
    materialAxis.b.push(toChart(mb))
    materialRaw.w.push(mw)
    materialRaw.b.push(mb)

    // Structure — per-side pawns + passed
    const swMg = (f.pawns.white?.mg ?? 0) + (f.passed.white?.mg ?? 0)
    const swEg = (f.pawns.white?.eg ?? 0) + (f.passed.white?.eg ?? 0)
    const sbMg = (f.pawns.black?.mg ?? 0) + (f.passed.black?.mg ?? 0)
    const sbEg = (f.pawns.black?.eg ?? 0) + (f.passed.black?.eg ?? 0)
    const sw = radarBlend(swMg, swEg, t, SATURATION.structure)
    const sb = radarBlend(sbMg, sbEg, t, SATURATION.structure)
    structureAxis.w.push(toChart(sw))
    structureAxis.b.push(toChart(sb))
    structureRaw.w.push(sw)
    structureRaw.b.push(sb)

    // Activity — per-side pieces + mobility
    const awMg =
      (f.knights.white?.mg ?? 0) +
      (f.bishops.white?.mg ?? 0) +
      (f.rooks.white?.mg ?? 0) +
      (f.queens.white?.mg ?? 0) +
      (f.mobility.white?.mg ?? 0)
    const awEg =
      (f.knights.white?.eg ?? 0) +
      (f.bishops.white?.eg ?? 0) +
      (f.rooks.white?.eg ?? 0) +
      (f.queens.white?.eg ?? 0) +
      (f.mobility.white?.eg ?? 0)
    const abMg =
      (f.knights.black?.mg ?? 0) +
      (f.bishops.black?.mg ?? 0) +
      (f.rooks.black?.mg ?? 0) +
      (f.queens.black?.mg ?? 0) +
      (f.mobility.black?.mg ?? 0)
    const abEg =
      (f.knights.black?.eg ?? 0) +
      (f.bishops.black?.eg ?? 0) +
      (f.rooks.black?.eg ?? 0) +
      (f.queens.black?.eg ?? 0) +
      (f.mobility.black?.eg ?? 0)
    const aw = radarBlend(awMg, awEg, t, SATURATION.activity)
    const ab = radarBlend(abMg, abEg, t, SATURATION.activity)
    activityAxis.w.push(toChart(aw))
    activityAxis.b.push(toChart(ab))
    activityRaw.w.push(aw)
    activityRaw.b.push(ab)

    // Safety — per-side king safety + threats
    const sfwMg = (f.kingSafety.white?.mg ?? 0) + (f.threats.white?.mg ?? 0)
    const sfwEg = (f.kingSafety.white?.eg ?? 0) + (f.threats.white?.eg ?? 0)
    const sfbMg = (f.kingSafety.black?.mg ?? 0) + (f.threats.black?.mg ?? 0)
    const sfbEg = (f.kingSafety.black?.eg ?? 0) + (f.threats.black?.eg ?? 0)
    const sfw = radarBlend(sfwMg, sfwEg, t, SATURATION.safety)
    const sfb = radarBlend(sfbMg, sfbEg, t, SATURATION.safety)
    safetyAxis.w.push(toChart(sfw))
    safetyAxis.b.push(toChart(sfb))
    safetyRaw.w.push(sfw)
    safetyRaw.b.push(sfb)
  }

  const radarAxes = [
    {
      name: 'Material',
      color: AXIS_COLORS.material,
      w: materialAxis.w,
      b: materialAxis.b,
      rw: materialRaw,
      rb: materialRaw,
    },
    {
      name: 'Structure',
      color: AXIS_COLORS.structure,
      w: structureAxis.w,
      b: structureAxis.b,
      rw: structureRaw,
      rb: structureRaw,
    },
    {
      name: 'Activity',
      color: AXIS_COLORS.activity,
      w: activityAxis.w,
      b: activityAxis.b,
      rw: activityRaw,
      rb: activityRaw,
    },
    {
      name: 'Safety',
      color: AXIS_COLORS.safety,
      w: safetyAxis.w,
      b: safetyAxis.b,
      rw: safetyRaw,
      rb: safetyRaw,
    },
  ]

  // ── Individual term series (per-side, normalized via BAR_SATURATION) ────

  interface TermSeries {
    name: string
    color: string
    dashed: boolean
    data: (number | null)[]
    raw: (number | null)[]
  }
  const termSeries: TermSeries[] = []

  for (const term of TERM_ORDER) {
    const color = TERM_COLORS[term.key] ?? '#888'
    const isMaterialTerm = MATERIAL_TERM_KEYS.has(term.key)

    const wRaw: (number | null)[] = []
    const bRaw: (number | null)[] = []
    const wData: (number | null)[] = []
    const bData: (number | null)[] = []

    for (const { f, t, conf } of perMove) {
      if (!f) {
        wRaw.push(null)
        bRaw.push(null)
        wData.push(null)
        bData.push(null)
        continue
      }
      const et = f[term.key]
      if (!et || typeof et !== 'object' || !('white' in et)) {
        wRaw.push(null)
        bRaw.push(null)
        wData.push(null)
        bData.push(null)
        continue
      }
      let wVal = blendMgEg(et.white?.mg ?? 0, et.white?.eg ?? 0, t)
      let bVal = blendMgEg(et.black?.mg ?? 0, et.black?.eg ?? 0, t)
      if (isMaterialTerm) {
        wVal *= conf
        bVal *= conf
      }
      wRaw.push(wVal)
      bRaw.push(bVal)
      wData.push(Math.max(-1, Math.min(1, wVal / BAR_SATURATION)))
      bData.push(Math.max(-1, Math.min(1, bVal / BAR_SATURATION)))
    }

    termSeries.push({ name: `${term.label} (W)`, color, dashed: false, data: wData, raw: wRaw })
    termSeries.push({ name: `${term.label} (B)`, color, dashed: true, data: bData, raw: bRaw })
  }

  // ── Tooltip raw value lookups ───────────────────────────────────────────

  const rawLookup: Record<string, { raw: (number | null)[]; fmt: (v: number) => string }> = {}
  for (const ax of radarAxes) {
    const fmt = (v: number) => v.toFixed(3)
    rawLookup[`${ax.name} (W)`] = { raw: ax.rw.w, fmt }
    rawLookup[`${ax.name} (B)`] = { raw: ax.rw.b, fmt }
  }
  for (const ts of termSeries) {
    rawLookup[ts.name] = { raw: ts.raw, fmt: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}` }
  }

  return {
    animation: false,
    backgroundColor: 'transparent',
    grid: { top: 28, right: 16, bottom: 48, left: 36 },
    legend: {
      show: false,
      data: [...allLegendSeriesNames],
      selected: legendSelected.value,
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
        const items = params as Array<{
          seriesName: string
          value: number | null
          name: string
          dataIndex?: number
          color?: string
        }>
        if (!items?.length) return ''
        const idx = items[0].dataIndex ?? 0
        const entry = entries[idx]
        const a = entry?.analysis
        let html = `<b>${items[0].name}</b>`
        for (const item of items) {
          if (item.seriesName === 'ClickTarget' || item.value == null) continue
          if (item.seriesName === 'Eval') {
            const raw = evalRaw[idx]
            if (raw == null) continue
            const isMate = a?.engineResult?.evalMate != null
            const label = isMate
              ? `M${Math.abs(a!.engineResult!.evalMate!)}`
              : `${raw >= 0 ? '+' : ''}${(raw / 100).toFixed(2)}`
            html += `<br/><span style="color:${EVAL_COLOR}">■</span> Eval: ${label}`
            continue
          }
          const lookup = rawLookup[item.seriesName]
          if (lookup) {
            const raw = lookup.raw[idx]
            if (raw == null) continue
            html += `<br/><span style="color:${item.color ?? '#888'}">■</span> ${item.seriesName}: ${lookup.fmt(raw)}`
          }
        }
        return html
      },
    },
    dataZoom: [
      {
        type: 'inside',
        id: FEATURE_CURVES_X_DZ_ID,
        xAxisIndex: 0,
        start: 0,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        preventDefaultMouseMove: true,
      },
      {
        type: 'inside',
        id: FEATURE_CURVES_Y_DZ_ID,
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
      axisLabel: { rotate: 40, interval: labelInterval, fontSize: 9, color: axisLabelColor },
      axisLine: { lineStyle: { color: axisLineColor } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: -1,
      max: 1,
      splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } },
      axisLabel: { fontSize: 9, color: axisLabelColor },
    },
    series: [
      {
        name: 'Eval',
        type: 'line' as const,
        data: evalNormalized,
        smooth: 0.3,
        symbol: 'none',
        connectNulls: false,
        itemStyle: { color: EVAL_COLOR },
        lineStyle: { color: EVAL_COLOR, width: 2, type: 'dashed' as const },
        z: 5,
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            { yAxis: 0, lineStyle: { color: markLineColor, type: 'solid' as const, width: 1 } },
            ...(currentMoveIndex.value >= 0
              ? [
                  {
                    xAxis: currentMoveIndex.value,
                    lineStyle: { color: '#888', type: 'dashed' as const, width: 1.5, opacity: 0.5 },
                  },
                ]
              : []),
          ],
          label: { show: false },
        },
      },
      ...radarAxes.flatMap(ax => [
        {
          name: `${ax.name} (W)`,
          type: 'line' as const,
          data: ax.w,
          smooth: 0.3,
          symbol: 'none',
          connectNulls: false,
          itemStyle: { color: ax.color },
          lineStyle: { color: ax.color, width: 2 },
          z: 4,
        },
        {
          name: `${ax.name} (B)`,
          type: 'line' as const,
          data: ax.b,
          smooth: 0.3,
          symbol: 'none',
          connectNulls: false,
          itemStyle: { color: ax.color },
          lineStyle: { color: ax.color, width: 2, type: 'dashed' as const },
          z: 4,
        },
      ]),
      ...termSeries.map(ts => ({
        name: ts.name,
        type: 'line' as const,
        data: ts.data,
        smooth: 0.3,
        symbol: 'none',
        connectNulls: false,
        itemStyle: { color: ts.color },
        lineStyle: {
          color: ts.color,
          width: 1.5,
          type: (ts.dashed ? 'dashed' : 'solid') as 'dashed' | 'solid',
        },
        z: 3,
      })),
      {
        name: 'ClickTarget',
        type: 'bar' as const,
        barWidth: '100%',
        barCategoryGap: '0%',
        data: entries.map(() => ({ value: 1, itemStyle: { opacity: 0 }, cursor: 'pointer' })),
        yAxisIndex: 0,
        z: 6,
        emphasis: { disabled: true },
      },
    ],
  }
})
</script>

<template>
  <div class="w-full h-full flex flex-col">
    <div v-if="!hasData" class="flex-1 flex items-center justify-center">
      <p class="text-sm text-muted">No analysis data yet.</p>
    </div>
    <template v-else>
      <div class="px-3 pt-1.5 pb-1 shrink-0 flex flex-wrap items-start gap-2">
        <div class="shrink-0 self-start">
          <Popover v-model:open="seriesPickerOpen">
            <PopoverTrigger as-child>
              <Button
                variant="outline"
                size="sm"
                class="h-8 gap-1.5 px-2.5"
                type="button"
                :aria-expanded="seriesPickerOpen"
              >
                <span class="text-xs">Series</span>
                <ChevronsUpDown class="size-3.5 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-[min(22rem,calc(100vw-2rem))] p-0" align="start">
              <Command :key="seriesPickerSession">
                <CommandInput
                  placeholder="Search series…"
                  class="h-9 border-0 border-b rounded-none"
                />
                <CommandList class="max-h-[min(20rem,50vh)]">
                  <CommandEmpty>No series match.</CommandEmpty>
                  <CommandGroup heading="Overview">
                    <CommandItem
                      v-for="name in OVERVIEW_SERIES"
                      :key="name"
                      :value="name"
                      @select="toggleLegendSeries(name)"
                    >
                      <Check
                        :class="
                          cn('size-4 shrink-0', isSeriesVisible(name) ? 'opacity-100' : 'opacity-0')
                        "
                      />
                      <span
                        class="size-2.5 shrink-0 rounded-sm"
                        :style="{ backgroundColor: seriesSwatchColor(name) }"
                      />
                      <span class="truncate">{{ name }}</span>
                    </CommandItem>
                  </CommandGroup>
                  <CommandGroup heading="Radar axes">
                    <CommandItem
                      v-for="name in radarAxisNames"
                      :key="name"
                      :value="name"
                      @select="toggleLegendSeries(name)"
                    >
                      <Check
                        :class="
                          cn('size-4 shrink-0', isSeriesVisible(name) ? 'opacity-100' : 'opacity-0')
                        "
                      />
                      <span
                        class="size-2.5 shrink-0 rounded-sm"
                        :style="{ backgroundColor: seriesSwatchColor(name) }"
                      />
                      <span class="truncate">{{ name }}</span>
                    </CommandItem>
                  </CommandGroup>
                  <CommandGroup heading="Terms">
                    <CommandItem
                      v-for="name in termSeriesNames"
                      :key="name"
                      :value="name"
                      @select="toggleLegendSeries(name)"
                    >
                      <Check
                        :class="
                          cn('size-4 shrink-0', isSeriesVisible(name) ? 'opacity-100' : 'opacity-0')
                        "
                      />
                      <span
                        class="size-2.5 shrink-0 rounded-sm"
                        :style="{ backgroundColor: seriesSwatchColor(name) }"
                      />
                      <span class="truncate">{{ name }}</span>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div class="flex flex-wrap gap-1 flex-1 min-w-0 items-start justify-end">
          <Badge
            v-for="name in visibleSeriesOrdered"
            :key="name"
            variant="outline"
            class="inline-flex max-w-full items-center gap-1 pl-1.5 pr-0.5 py-0.5 font-normal text-[10px] leading-tight"
          >
            <span
              class="size-2 shrink-0 rounded-sm"
              :style="{ backgroundColor: seriesSwatchColor(name) }"
            />
            <span class="truncate">{{ name }}</span>
            <button
              type="button"
              class="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
              :aria-label="`Hide ${name}`"
              @click="setSeriesVisible(name, false)"
            >
              <X class="size-3" />
            </button>
          </Badge>
        </div>
      </div>
      <div class="flex-1 min-h-0 relative" @wheel.capture="onFeatureChartWheelCapture">
        <VChart
          ref="featureChartRef"
          :option="option"
          autoresize
          class="w-full h-full min-h-0 cursor-pointer"
          @click="handleChartClick"
        />
      </div>
    </template>
  </div>
</template>
