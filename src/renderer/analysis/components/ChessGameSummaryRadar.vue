<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { RadarChart } from 'echarts/charts'
import { RadarComponent, TooltipComponent } from 'echarts/components'
import type { EChartsOption } from 'echarts'
import type { GameSummaryRadarData } from '../composables/useGameSummaryRadar'
import { useDarkMode } from 'src/renderer/composables/darkMode/useDarkMode'

use([CanvasRenderer, RadarChart, RadarComponent, TooltipComponent])

const props = defineProps<{
  data: GameSummaryRadarData
  whiteUsername?: string | null
  blackUsername?: string | null
}>()

const { isDark } = useDarkMode()

function formatMaterial(v: number): string {
  if (Math.abs(v) < 0.005) return '='
  return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)
}

const radarOption = computed((): EChartsOption => {
  const { white, black, labels } = props.data

  const textColor = isDark.value ? '#a2b1b8' : '#888'
  const splitLineColor = isDark.value ? '#374a57' : '#e8e8e8'
  const splitAreaColors = isDark.value
    ? ['rgba(255,255,255,0.03)', 'transparent', 'rgba(255,255,255,0.03)', 'transparent', 'rgba(255,255,255,0.03)']
    : ['rgba(0,0,0,0.02)', 'transparent', 'rgba(0,0,0,0.02)', 'transparent', 'rgba(0,0,0,0.02)']

  return {
    animation: false,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: isDark.value ? '#2c3b45' : '#fff',
      borderColor: isDark.value ? '#445969' : '#e0e0e0',
      textStyle: { color: isDark.value ? '#e8ebd4' : '#2e351a', fontSize: 10 },
      formatter: (params: unknown) => {
        const p = params as { value: number[]; seriesName?: string }
        const rows = labels.map((label, i) =>
          `${label}: ${(p.value[i] * 100).toFixed(0)}%`,
        ).join('<br/>')
        return `<b>${p.seriesName ?? 'Player'}</b><br/>${rows}`
      },
    },
    radar: {
      radius: '65%',
      center: ['50%', '50%'],
      indicator: labels.map(name => ({ name, max: 1, min: 0 })),
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
            name: props.whiteUsername ?? 'White',
            value: white,
            lineStyle: { color: '#d4a84b', width: 1.5 },
            areaStyle: { color: 'rgba(212, 168, 75, 0.22)' },
            itemStyle: { color: '#d4a84b' },
          },
          {
            name: props.blackUsername ?? 'Black',
            value: black,
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
  <div v-if="!data.hasData" class="flex items-center justify-center h-full text-xs text-muted">
    No positional data yet.
  </div>
  <div v-else class="w-full flex flex-col gap-2">
    <VChart :option="radarOption" autoresize class="w-full" style="height: 220px;" />

    <!-- Material scalar -->
    <div class="flex items-center justify-center gap-4 text-xs">
      <div class="flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-[#d4a84b]" />
        <span class="text-secondary">{{ whiteUsername ?? 'White' }}</span>
        <span class="font-mono font-semibold text-primary">{{ formatMaterial(data.whiteMaterial) }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-[#5b8dd9]" />
        <span class="text-secondary">{{ blackUsername ?? 'Black' }}</span>
        <span class="font-mono font-semibold text-primary">{{ formatMaterial(data.blackMaterial) }}</span>
      </div>
    </div>
  </div>
</template>
