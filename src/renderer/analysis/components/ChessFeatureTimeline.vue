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
import type { PositionAnalysis } from 'src/database/analysis/types'
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

const FEATURE_TIMELINE_X_DZ_ID = 'featureTimelineInsideX'
const FEATURE_TIMELINE_Y_DZ_ID = 'featureTimelineInsideY'

const { analysisByFen } = useInjectedGameAnalysis()
const { moveList, goToNode, root, currentFen } = useInjectedGameNavigator()
const { isDark } = useDarkMode()

// ── Raw feature definitions ────────────────────────────────────────────────

const PER_COLOR_KEYS: Array<{ key: string; label: string }> = [
  { key: 'pawn_count', label: 'Pawn count' },
  { key: 'knight_count', label: 'Knight count' },
  { key: 'bishop_count', label: 'Bishop count' },
  { key: 'rook_count', label: 'Rook count' },
  { key: 'queen_count', label: 'Queen count' },
  { key: 'non_pawn_material', label: 'Non-pawn material' },
  { key: 'passed_pawns', label: 'Passed pawns' },
  { key: 'isolated_pawns', label: 'Isolated pawns' },
  { key: 'doubled_pawns', label: 'Doubled pawns' },
  { key: 'backward_pawns', label: 'Backward pawns' },
  { key: 'connected_pawns', label: 'Connected pawns' },
  { key: 'supported_pawns', label: 'Supported pawns' },
  { key: 'phalanx_pawns', label: 'Phalanx pawns' },
  { key: 'blocked_pawns', label: 'Blocked pawns' },
  { key: 'passed_pawn_best_rank', label: 'Best passed rank' },
  { key: 'free_passed_pawns', label: 'Free passed pawns' },
  { key: 'knight_mobility', label: 'Knight mobility' },
  { key: 'bishop_mobility', label: 'Bishop mobility' },
  { key: 'rook_mobility', label: 'Rook mobility' },
  { key: 'queen_mobility', label: 'Queen mobility' },
  { key: 'knight_outpost', label: 'Knight outpost' },
  { key: 'bishop_outpost', label: 'Bishop outpost' },
  { key: 'reachable_outpost', label: 'Reachable outpost' },
  { key: 'bad_outpost', label: 'Bad outpost' },
  { key: 'bishop_long_diagonal', label: 'Long diagonal bishop' },
  { key: 'bishop_pair', label: 'Bishop pair' },
  { key: 'bishop_pawns_same_color', label: 'Pawns same color as bishop' },
  { key: 'bishop_xray_pawns', label: 'Bishop X-ray pawns' },
  { key: 'minor_behind_pawn', label: 'Minor behind pawn' },
  { key: 'rook_on_open_file', label: 'Rook on open file' },
  { key: 'rook_on_semiopen_file', label: 'Rook on semi-open file' },
  { key: 'rook_on_queen_file', label: 'Rook on queen file' },
  { key: 'rook_on_king_ring', label: 'Rook on king ring' },
  { key: 'bishop_on_king_ring', label: 'Bishop on king ring' },
  { key: 'trapped_rook', label: 'Trapped rook' },
  { key: 'weak_queen', label: 'Weak queen' },
  { key: 'queen_infiltration', label: 'Queen infiltration' },
  { key: 'space_count', label: 'Space count' },
  { key: 'king_attackers_count', label: 'King attackers' },
  { key: 'king_attackers_weight', label: 'King attackers weight' },
  { key: 'king_attacks_count', label: 'King attacks count' },
  { key: 'king_danger', label: 'King danger' },
  { key: 'king_flank_attack', label: 'Flank attack' },
  { key: 'king_flank_defense', label: 'Flank defense' },
  { key: 'unsafe_checks', label: 'Unsafe checks' },
  { key: 'king_ring_weak', label: 'King ring weak' },
  { key: 'blockers_for_king', label: 'Blockers for king' },
  { key: 'king_pawnless_flank', label: 'Pawnless flank' },
  { key: 'can_castle_kingside', label: 'Can castle kingside' },
  { key: 'can_castle_queenside', label: 'Can castle queenside' },
  { key: 'weak_pieces', label: 'Weak pieces' },
  { key: 'hanging_pieces', label: 'Hanging pieces' },
  { key: 'restricted_pieces', label: 'Restricted pieces' },
  { key: 'threat_by_safe_pawn', label: 'Threat by safe pawn' },
  { key: 'threat_by_pawn_push', label: 'Threat by pawn push' },
  { key: 'threat_by_king', label: 'Threat by king' },
  { key: 'knight_on_queen', label: 'Knight on queen' },
  { key: 'slider_on_queen', label: 'Slider on queen' },
  { key: 'weak_queen_protection', label: 'Weak queen protection' },
]

const GLOBAL_KEYS: Array<{ key: string; label: string }> = [
  { key: 'phase', label: 'Phase' },
  { key: 'scale_factor', label: 'Scale factor' },
  { key: 'outflanking', label: 'Outflanking' },
  { key: 'pawns_on_both_flanks', label: 'Pawns on both flanks' },
  { key: 'almost_unwinnable', label: 'Almost unwinnable' },
  { key: 'infiltration', label: 'Infiltration' },
  { key: 'opposite_bishops', label: 'Opposite bishops' },
  { key: 'rule50_count', label: '50-move rule count' },
]

const EVAL_COLOR = '#fbbf24'
const COMPLEXITY_COLOR = '#c084fc'

const PALETTE = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#84cc16',
  '#ec4899',
  '#14b8a6',
  '#a78bfa',
  '#fb923c',
  '#e11d48',
  '#0ea5e9',
  '#d946ef',
  '#65a30d',
  '#0891b2',
  '#c026d3',
  '#ea580c',
  '#6366f1',
]

// ── Build series descriptors ──────────────────────────────────────────────

interface SeriesDef {
  name: string
  rawKey: string
  color: string
  dashed: boolean
}

const rawSeriesDefs: SeriesDef[] = []
PER_COLOR_KEYS.forEach(({ key, label }, i) => {
  const color = PALETTE[i % PALETTE.length]
  rawSeriesDefs.push({ name: `${label} (W)`, rawKey: `${key}_w`, color, dashed: false })
  rawSeriesDefs.push({ name: `${label} (B)`, rawKey: `${key}_b`, color, dashed: true })
})
GLOBAL_KEYS.forEach(({ key, label }, i) => {
  const color = PALETTE[(PER_COLOR_KEYS.length + i) % PALETTE.length]
  rawSeriesDefs.push({ name: label, rawKey: key, color, dashed: false })
})

const OVERVIEW_SERIES = ['Eval', 'Complexity'] as const
const allLegendSeriesNames = [...OVERVIEW_SERIES, ...rawSeriesDefs.map(s => s.name)] as const

// ── Legend state (persisted) — only Eval + Complexity visible by default ───

const legendSelected = useStoredLegendSelection(
  'chess-lens.analysis.feature-timeline.legend',
  () => ({
    Eval: true,
    Complexity: true,
    ...Object.fromEntries(rawSeriesDefs.map(s => [s.name, false])),
  }),
  allLegendSeriesNames,
)

const seriesPickerOpen = ref(false)
/** Increment when opening popover so Command remounts and clears its internal search. */
const seriesPickerSession = ref(0)
watch(seriesPickerOpen, open => {
  if (open) seriesPickerSession.value += 1
})

const visibleSeriesOrdered = computed(() =>
  allLegendSeriesNames.filter(name => legendSelected.value[name])
)

function seriesSwatchColor(name: string): string {
  if (name === 'Eval') return EVAL_COLOR
  if (name === 'Complexity') return COMPLEXITY_COLOR
  return rawSeriesDefs.find(s => s.name === name)?.color ?? '#888'
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

function normalizeToMinMax(raw: (number | null)[]): (number | null)[] {
  const valid = raw.filter((v): v is number => v !== null)
  if (!valid.length) return raw
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const range = max - min
  if (range < 1e-6) return raw.map(v => (v === null ? null : 0))
  return raw.map(v => (v === null ? null : ((v - min) / range) * 2 - 1))
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

const featureTimelineChartRef = ref<EChartsComponentApi | null>(null)

function onFeatureTimelineChartWheelCapture(e: WheelEvent) {
  if (!hasData.value || !e.shiftKey) return
  handleShiftWheelYAxisDataZoom(featureTimelineChartRef.value, e, FEATURE_TIMELINE_Y_DZ_ID)
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

  const axisLabelColor = isDark.value ? '#a2b1b8' : '#888'
  const axisLineColor = isDark.value ? '#445969' : '#ccc'
  const splitLineColor = isDark.value ? '#374a57' : '#e8e8e8'
  const markLineColor = isDark.value ? '#566e79' : '#bbb'
  const labelInterval = Math.max(0, Math.floor(entries.length / 16) - 1)

  // Eval — fixed scale: 0 cp = y 0, ±600 cp saturates to ±1
  const EVAL_SATURATION_CP = 600
  const evalRaw = entries.map(e => {
    const a = e.analysis
    if (!a?.engineResult) return null
    if (a.engineResult.evalMate != null) return a.engineResult.evalMate > 0 ? 1000 : -1000
    return a.engineResult.evalCp ?? null
  })
  const evalNormalized = evalRaw.map(v =>
    v === null ? null : Math.max(-1, Math.min(1, v / EVAL_SATURATION_CP))
  )

  // Complexity
  const complexityRaw = entries.map(e => {
    const v = e.analysis?.evalRawFeatures?.complexity
    return v !== undefined ? v : null
  })
  const complexityNormalized = normalizeToMinMax(complexityRaw)

  // Raw feature series — extract raw values then normalize per-series
  const rawSeriesBuilt = rawSeriesDefs.map(def => {
    const raw = entries.map(e => {
      const v = e.analysis?.evalRawFeatures?.[def.rawKey]
      return v !== undefined ? v : null
    })
    return { def, raw, normalized: normalizeToMinMax(raw) }
  })

  // Build a rawKey→raw lookup for tooltip display
  const rawByKey: Record<string, (number | null)[]> = {}
  for (const s of rawSeriesBuilt) rawByKey[s.def.name] = s.raw

  const allSeriesNames = [...allLegendSeriesNames]

  return {
    animation: false,
    backgroundColor: 'transparent',
    grid: { top: 28, right: 16, bottom: 48, left: 36 },
    legend: {
      show: false,
      data: allSeriesNames,
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
        }>
        if (!items?.length) return ''
        const idx = items[0].dataIndex ?? 0
        const entry = entries[idx]
        const a = entry?.analysis
        let html = `<b>${items[0].name}</b>`
        for (const item of items) {
          if (item.seriesName === 'ClickTarget') continue
          if (item.value == null) continue
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
          if (item.seriesName === 'Complexity') {
            const raw = complexityRaw[idx]
            if (raw == null) continue
            html += `<br/><span style="color:${COMPLEXITY_COLOR}">■</span> Complexity: ${raw}`
            continue
          }
          const rawArr = rawByKey[item.seriesName]
          const raw = rawArr?.[idx]
          if (raw == null) continue
          const def = rawSeriesDefs.find(s => s.name === item.seriesName)
          html += `<br/><span style="color:${def?.color ?? '#888'}">■</span> ${item.seriesName}: ${raw}`
        }
        return html
      },
    },
    dataZoom: [
      {
        type: 'inside',
        id: FEATURE_TIMELINE_X_DZ_ID,
        xAxisIndex: 0,
        start: 0,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        preventDefaultMouseMove: true,
      },
      {
        type: 'inside',
        id: FEATURE_TIMELINE_Y_DZ_ID,
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
      {
        name: 'Complexity',
        type: 'line' as const,
        data: complexityNormalized,
        smooth: 0.3,
        symbol: 'none',
        connectNulls: false,
        itemStyle: { color: COMPLEXITY_COLOR },
        lineStyle: { color: COMPLEXITY_COLOR, width: 1.5 },
        z: 4,
      },
      ...rawSeriesBuilt.map(({ def, normalized }) => ({
        name: def.name,
        type: 'line' as const,
        data: normalized,
        smooth: 0.3,
        symbol: 'none',
        connectNulls: false,
        itemStyle: { color: def.color },
        lineStyle: {
          color: def.color,
          width: 1.5,
          type: (def.dashed ? 'dashed' : 'solid') as 'dashed' | 'solid',
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
                  <CommandGroup heading="Features">
                    <CommandItem
                      v-for="def in rawSeriesDefs"
                      :key="def.name"
                      :value="def.name"
                      @select="toggleLegendSeries(def.name)"
                    >
                      <Check
                        :class="
                          cn(
                            'size-4 shrink-0',
                            isSeriesVisible(def.name) ? 'opacity-100' : 'opacity-0'
                          )
                        "
                      />
                      <span
                        class="size-2.5 shrink-0 rounded-sm"
                        :style="{ backgroundColor: def.color }"
                      />
                      <span class="truncate">{{ def.name }}</span>
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
      <div class="flex-1 min-h-0 relative" @wheel.capture="onFeatureTimelineChartWheelCapture">
        <VChart
          ref="featureTimelineChartRef"
          :option="option"
          autoresize
          class="w-full h-full min-h-0 cursor-pointer"
          @click="handleChartClick"
        />
      </div>
    </template>
  </div>
</template>
