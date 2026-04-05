<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { RadarChart } from 'echarts/charts'
import { RadarComponent, TooltipComponent } from 'echarts/components'
import type { EChartsOption } from 'echarts'
import type { PositionalFeatures } from 'src/database/analysis/types'
import { useDarkMode } from 'src/renderer/composables/darkMode/useDarkMode'

use([CanvasRenderer, RadarChart, RadarComponent, TooltipComponent])

const props = defineProps<{
  features: PositionalFeatures | null | undefined
  /** Raw Stockfish phase score: 128 = pure middlegame, 0 = pure endgame. Null = treat as midgame. */
  phaseScore: number | null | undefined
  /**
   * Eval swing at this position in centipawns (positive = mover lost ground).
   * Large absolute values indicate a trade is in progress; used to reduce the
   * weight of the Material dimension so the mid-trade snapshot is less noisy.
   */
  evalSwingCp: number | null | undefined
}>()

const { isDark } = useDarkMode()

const hasFeatures = computed(() => props.features != null)

/**
 * Phase weight in [0, 1]: 1 = pure middlegame, 0 = pure endgame.
 * Stockfish's phaseScore ranges from 0 (endgame) to 128 (opening/middlegame).
 */
const phaseWeight = computed(() =>
  props.phaseScore != null ? Math.max(0, Math.min(1, props.phaseScore / 128)) : 1
)

/** Per-axis saturation divisors (in pawn units). Controls how quickly each axis saturates. */
const SATURATION = {
  material:  3.0,
  structure: 4.0,
  activity:  2.0,
  safety:    2.0,
} as const
const BAR_SATURATION = 3.0
const EQUALITY_THRESHOLD = 0.05

/**
 * How much to trust the material snapshot at this position.
 * An evalSwing of ±300 cp (3 pawns) fully dampens Material toward 0.5 (neutral).
 * Smaller swings leave material mostly intact. At zero swing, confidence = 1.
 */
const MATERIAL_SWING_SATURATION_CP = 200
const materialConfidence = computed(() => {
  const swing = props.evalSwingCp
  if (swing == null) return 1
  return Math.max(0, 1 - Math.abs(swing) / MATERIAL_SWING_SATURATION_CP)
})

function blend(
  mg: number | null | undefined,
  eg: number | null | undefined,
  axis: keyof typeof SATURATION,
): number {
  const mgVal = mg ?? 0
  const egVal = eg ?? mgVal
  const t = phaseWeight.value
  const interpolated = mgVal * t + egVal * (1 - t)
  return Math.max(0, Math.min(1, 0.5 + interpolated / SATURATION[axis]))
}

/** Axis order must match the radar indicator array below. */
const AXES = ['Material', 'Structure', 'Activity', 'Safety'] as const

const TERM_BREAKDOWN = [
  { label: 'Material',   key: 'material' },
  { label: 'Imbalance',  key: 'imbalance' },
  { label: 'Pawns',      key: 'pawns' },
  { label: 'Knights',    key: 'knights' },
  { label: 'Bishops',    key: 'bishops' },
  { label: 'Rooks',      key: 'rooks' },
  { label: 'Queens',     key: 'queens' },
  { label: 'Mobility',   key: 'mobility' },
  { label: 'King Safety',key: 'kingSafety' },
  { label: 'Threats',    key: 'threats' },
  { label: 'Passed',     key: 'passed' },
  { label: 'Space',      key: 'space' },
] as const

function blendRaw(mg: number | null | undefined, eg: number | null | undefined): number {
  const mgVal = mg ?? 0
  const egVal = eg ?? mgVal
  const t = phaseWeight.value
  return mgVal * t + egVal * (1 - t)
}

type BreakdownRow = {
  label: string
  value: number
  magnitudePercent: number
  endPercent: number
  side: 'white' | 'black' | 'equal'
}

const MATERIAL_TERM_KEYS = new Set<string>(['material', 'imbalance'])

const termBreakdownRows = computed<BreakdownRow[]>(() => {
  const f = props.features
  const conf = materialConfidence.value
  return TERM_BREAKDOWN.map((term) => {
    const mg = f?.[term.key].total?.mg ?? 0
    const eg = f?.[term.key].total?.eg ?? mg
    const raw = blendRaw(mg, eg)
    const value = MATERIAL_TERM_KEYS.has(term.key) ? raw * conf : raw
    const clamped = Math.min(1, Math.abs(value) / BAR_SATURATION)
    const magnitudePercent = clamped * 100
    const endPercent = 50 + (value >= 0 ? 1 : -1) * clamped * 50
    const side: BreakdownRow['side'] = Math.abs(value) <= EQUALITY_THRESHOLD
      ? 'equal'
      : value > 0
        ? 'white'
        : 'black'
    return {
      label: term.label,
      value,
      magnitudePercent,
      endPercent,
      side,
    }
  })
})

function formatSigned(value: number): string {
  if (value > 0) return `+${value.toFixed(2)}`
  return value.toFixed(2)
}

const radarOption = computed((): EChartsOption => {
  const f = props.features
  const textColor = isDark.value ? '#a2b1b8' : '#888'
  const splitLineColor = isDark.value ? '#374a57' : '#e8e8e8'
  const splitAreaColors = isDark.value
    ? ['rgba(255,255,255,0.03)', 'transparent', 'rgba(255,255,255,0.03)', 'transparent', 'rgba(255,255,255,0.03)']
    : ['rgba(0,0,0,0.02)', 'transparent', 'rgba(0,0,0,0.02)', 'transparent', 'rgba(0,0,0,0.02)']

  // Material uses total (white-minus-black), then offsets around neutral per side.
  // materialConfidence shrinks the offset toward 0.5 when evalSwing is large,
  // preventing a half-completed trade from showing a false material spike.
  const materialTotalMg = f ? (f.material.total?.mg ?? 0) + (f.imbalance.total?.mg ?? 0) : 0
  const materialTotalEg = f ? (f.material.total?.eg ?? 0) + (f.imbalance.total?.eg ?? 0) : 0
  const t = phaseWeight.value
  const materialInterpolated = materialTotalMg * t + materialTotalEg * (1 - t)
  const conf = materialConfidence.value
  const materialWhite = Math.max(0, Math.min(1, 0.5 + materialInterpolated * conf / SATURATION.material))
  const materialBlack = Math.max(0, Math.min(1, 0.5 - materialInterpolated * conf / SATURATION.material))

  const whiteValues = f
    ? [
        materialWhite,
        blend(
          (f.pawns.white?.mg ?? 0) + (f.passed.white?.mg ?? 0),
          (f.pawns.white?.eg ?? 0) + (f.passed.white?.eg ?? 0),
          'structure',
        ),
        blend(
          (f.knights.white?.mg ?? 0) + (f.bishops.white?.mg ?? 0) + (f.rooks.white?.mg ?? 0)
          + (f.queens.white?.mg ?? 0) + (f.mobility.white?.mg ?? 0),
          (f.knights.white?.eg ?? 0) + (f.bishops.white?.eg ?? 0) + (f.rooks.white?.eg ?? 0)
          + (f.queens.white?.eg ?? 0) + (f.mobility.white?.eg ?? 0),
          'activity',
        ),
        blend(
          (f.kingSafety.white?.mg ?? 0) + (f.threats.white?.mg ?? 0),
          (f.kingSafety.white?.eg ?? 0) + (f.threats.white?.eg ?? 0),
          'safety',
        ),
      ]
    : [0.5, 0.5, 0.5, 0.5]

  const blackValues = f
    ? [
        materialBlack,
        blend(
          (f.pawns.black?.mg ?? 0) + (f.passed.black?.mg ?? 0),
          (f.pawns.black?.eg ?? 0) + (f.passed.black?.eg ?? 0),
          'structure',
        ),
        blend(
          (f.knights.black?.mg ?? 0) + (f.bishops.black?.mg ?? 0) + (f.rooks.black?.mg ?? 0)
          + (f.queens.black?.mg ?? 0) + (f.mobility.black?.mg ?? 0),
          (f.knights.black?.eg ?? 0) + (f.bishops.black?.eg ?? 0) + (f.rooks.black?.eg ?? 0)
          + (f.queens.black?.eg ?? 0) + (f.mobility.black?.eg ?? 0),
          'activity',
        ),
        blend(
          (f.kingSafety.black?.mg ?? 0) + (f.threats.black?.mg ?? 0),
          (f.kingSafety.black?.eg ?? 0) + (f.threats.black?.eg ?? 0),
          'safety',
        ),
      ]
    : [0.5, 0.5, 0.5, 0.5]

  return {
    animation: false,
    backgroundColor: 'transparent',
    tooltip: {
      appendTo: 'body',
      extraCssText: 'z-index: 999999;',
      trigger: 'item',
      backgroundColor: isDark.value ? '#2c3b45' : '#fff',
      borderColor: isDark.value ? '#445969' : '#e0e0e0',
      textStyle: { color: isDark.value ? '#e8ebd4' : '#2e351a', fontSize: 10 },
      formatter: (params: unknown) => {
        const p = params as { value: number[]; seriesName?: string }
        const saturationValues = [
          SATURATION.material, SATURATION.structure, SATURATION.activity, SATURATION.safety,
        ]
        const rows = AXES.map((label, i) => {
          const raw = (p.value[i] - 0.5) * saturationValues[i]
          const sign = raw > 0 ? '+' : ''
          return `${label}: ${sign}${raw.toFixed(2)}`
        }).join('<br/>')
        const phase = phaseWeight.value
        const phaseLabel = phase > 0.8 ? 'MG' : phase < 0.2 ? 'EG' : `${Math.round(phase * 100)}% MG`
        const seriesLabel = p.seriesName ?? 'Profile'
        return `<b>${seriesLabel}</b> <span style="opacity:0.6">(${phaseLabel})</span><br/>${rows}`
      },
    },
    radar: {
      radius: '65%',
      center: ['50%', '50%'],
      indicator: [
        { name: 'Material',  max: 1, min: 0 },
        { name: 'Structure', max: 1, min: 0 },
        { name: 'Activity',  max: 1, min: 0 },
        { name: 'Safety',    max: 1, min: 0 },
      ],
      axisName: { color: textColor, fontSize: 9 },
      splitLine: { lineStyle: { color: splitLineColor } },
      splitArea: { areaStyle: { color: splitAreaColors } },
      axisLine: { lineStyle: { color: splitLineColor } },
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            name: 'White',
            value: whiteValues,
            lineStyle: { color: '#d4a84b', width: 1.5 },
            areaStyle: { color: 'rgba(212, 168, 75, 0.22)' },
            itemStyle: { color: '#d4a84b' },
          },
          {
            name: 'Black',
            value: blackValues,
            lineStyle: { color: '#5b8dd9', width: 1.5 },
            areaStyle: { color: 'rgba(91, 141, 217, 0.18)' },
            itemStyle: { color: '#5b8dd9' },
          },
        ],
      },
    ],
  }
})
</script>

<template>
  <div v-if="!hasFeatures" class="flex items-center justify-center h-full text-xs text-muted">
    No positional data yet.
  </div>
  <div v-else class="w-full flex flex-col gap-2">
    <VChart :option="radarOption" autoresize class="w-full" style="height: 200px;" />

    <div class="breakdown-chart">
      <div
        v-for="row in termBreakdownRows"
        :key="row.label"
        class="breakdown-row"
      >
        <div class="term-label">{{ row.label }}</div>
        <div class="bar-track">
          <div class="half half-left">
            <div
              v-if="row.value < -EQUALITY_THRESHOLD"
              class="bar bar-black"
              :style="{ width: `${row.magnitudePercent}%` }"
            />
          </div>
          <div class="center-line" />
          <div class="half half-right">
            <div
              v-if="row.value > EQUALITY_THRESHOLD"
              class="bar bar-white"
              :style="{ width: `${row.magnitudePercent}%` }"
            />
            <div
              v-else-if="Math.abs(row.value) <= EQUALITY_THRESHOLD"
              class="bar bar-equal"
              :style="{ width: `${Math.max(2, row.magnitudePercent)}%` }"
            />
          </div>
          <span
            class="bar-value"
            :class="{
              'value-left': row.value < -EQUALITY_THRESHOLD,
              'value-right': row.value >= -EQUALITY_THRESHOLD,
            }"
            :style="{ left: `${row.endPercent}%` }"
          >
            {{ formatSigned(row.value) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.breakdown-chart {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 10px;
}

.breakdown-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 16px;
}

.term-label {
  width: 70px;
  flex: 0 0 70px;
  text-align: right;
  opacity: 0.8;
  white-space: nowrap;
}

.bar-track {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
}

.half {
  width: 50%;
  height: 10px;
  display: flex;
  align-items: center;
}

.half-left {
  justify-content: flex-end;
}

.half-right {
  justify-content: flex-start;
}

.center-line {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  transform: translateX(-0.5px);
  background: color-mix(in srgb, currentColor 28%, transparent);
}

.bar {
  height: 8px;
  border-radius: 2px;
}

.bar-white {
  background: #d4a84b;
}

.bar-black {
  background: #445969;
}

.bar-equal {
  background: #7b8991;
}

.bar-value {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  line-height: 1;
  opacity: 0.9;
  pointer-events: none;
}

.value-right {
  margin-left: 4px;
}

.value-left {
  transform: translate(-100%, -50%);
  margin-left: -4px;
}
</style>
