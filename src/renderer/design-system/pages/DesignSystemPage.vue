<script setup lang="ts">
import { ref, computed } from 'vue'
import { Button as UIButton } from '@/components/ui/button'
import { ButtonGroup as UIButtonGroup } from '@/components/ui/button-group'
import { Card as UICard } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Settings } from 'lucide-vue-next'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input as UITextInput } from '@/components/ui/input'
import { Badge as UIChip } from '@/components/ui/badge'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent } from 'echarts/components'
import type { EChartsOption } from 'echarts'
import { NAG } from 'src/services/engine/types'
import { nagColor, nagSymbol, nagBgClass } from 'src/utils/chess/nag'
import { useDarkMode } from 'src/renderer/composables/darkMode/useDarkMode'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent])

const inputValue = ref('')
const isLoading = ref(false)
const { isDark } = useDarkMode()

function simulateLoad() {
  isLoading.value = true
  setTimeout(() => (isLoading.value = false), 2000)
}

const nagItems = [
  { nag: NAG.Brilliant, label: 'Brilliant', description: 'An exceptional move involving a piece sacrifice' },
  { nag: NAG.Great, label: 'Great', description: 'A move critical to the game outcome' },
  { nag: NAG.Best, label: 'Best', description: 'The engine\'s top choice with no EP loss' },
  { nag: NAG.Excellent, label: 'Excellent', description: 'A near-perfect move with minimal EP loss' },
  { nag: NAG.Good, label: 'Good', description: 'A strong move that keeps the position solid' },
  { nag: NAG.Interesting, label: 'Interesting', description: 'A speculative or surprising move' },
  { nag: NAG.Inaccuracy, label: 'Inaccuracy', description: 'A suboptimal move that slightly weakens the position' },
  { nag: NAG.Mistake, label: 'Mistake', description: 'A clear error that worsens the position' },
  { nag: NAG.Blunder, label: 'Blunder', description: 'A severe mistake that loses material or the game' },
  { nag: NAG.Miss, label: 'Miss', description: 'Failing to capitalize on the opponent\'s mistake' },
]

const engineItems = [
  { id: 1, name: 'Stockfish', description: 'Primary analysis engine', colorVar: '--color-engine-1', subtleVar: '--color-engine-1-subtle' },
  { id: 2, name: 'Maia', description: 'Human-like engine (floor & ceiling)', colorVar: '--color-engine-2', subtleVar: '--color-engine-2-subtle' },
  { id: 3, name: 'Engine 3', description: 'Reserved for future engines', colorVar: '--color-engine-3', subtleVar: '--color-engine-3-subtle' },
]

const evalChartOption = computed((): EChartsOption => {
  const moves = Array.from({ length: 40 }, (_, i) => {
    const num = Math.floor(i / 2) + 1
    return i % 2 === 0 ? `${num}.` : `${num}...`
  })

  // Stockfish eval: a realistic-looking game curve
  const stockfishData = [
    0.2, 0.15, 0.3, 0.25, 0.4, 0.35, 0.5, 0.3, 0.8, 0.6,
    1.2, 0.4, 0.5, 0.6, 1.5, 1.3, 2.0, 1.8, 1.5, 1.9,
    2.5, 2.2, 1.8, 2.4, 3.0, 2.8, 2.5, 3.2, 3.5, 3.0,
    2.0, 2.5, 3.8, 4.2, 4.5, 4.0, 5.0, 5.5, 6.0, 7.0,
  ]

  // Maia floor: slightly below stockfish (human lower bound)
  const maiaFloorData = stockfishData.map((v, i) => {
    const offset = 0.3 + Math.sin(i * 0.4) * 0.2
    return Math.max(-10, Math.round((v - offset) * 100) / 100)
  })

  // Maia ceiling: slightly above stockfish (human upper bound)
  const maiaCeilingData = stockfishData.map((v, i) => {
    const offset = 0.4 + Math.cos(i * 0.3) * 0.15
    return Math.min(10, Math.round((v + offset) * 100) / 100)
  })

  const axisLabelColor = isDark.value ? 'oklch(72% 0.026 210)' : 'oklch(44% 0.036 210)'
  const axisLineColor = isDark.value ? 'oklch(32% 0.030 210)' : 'oklch(90% 0.014 210)'
  const splitLineColor = isDark.value ? 'oklch(28% 0.028 210)' : 'oklch(93% 0.010 210)'

  return {
    animation: true,
    backgroundColor: 'transparent',
    grid: { top: 36, right: 16, bottom: 48, left: 42 },
    legend: {
      data: ['Stockfish', 'Maia Floor', 'Maia Ceiling'],
      top: 4,
      right: 16,
      textStyle: { color: axisLabelColor, fontSize: 10 },
      itemWidth: 16,
      itemHeight: 6,
      icon: 'rect',
    },
    tooltip: {
      appendTo: 'body',
      extraCssText: 'z-index: 999999;',
      trigger: 'axis',
      axisPointer: { type: 'line' },
      backgroundColor: isDark.value ? 'oklch(23% 0.024 210)' : 'oklch(100% 0 0)',
      borderColor: isDark.value ? 'oklch(32% 0.030 210)' : 'oklch(90% 0.014 210)',
      textStyle: { color: isDark.value ? 'oklch(95% 0.006 210)' : 'oklch(20% 0.020 210)' },
    },
    xAxis: {
      type: 'category',
      data: moves,
      axisLabel: { rotate: 40, interval: 3, fontSize: 9, color: axisLabelColor },
      axisLine: { lineStyle: { color: axisLineColor } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: -2,
      max: 8,
      splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } },
      axisLabel: {
        fontSize: 9,
        color: axisLabelColor,
        formatter: (v: number) => (v > 0 ? `+${v}` : `${v}`),
      },
    },
    series: [
      {
        name: 'Maia Floor',
        type: 'line',
        data: maiaFloorData,
        smooth: 0.3,
        symbol: 'none',
        lineStyle: { color: 'var(--color-engine-2)', width: 1.5, type: 'dashed' },
        itemStyle: { color: 'var(--color-engine-2)' },
        z: 2,
      },
      {
        name: 'Maia Ceiling',
        type: 'line',
        data: maiaCeilingData,
        smooth: 0.3,
        symbol: 'none',
        lineStyle: { color: 'var(--color-engine-3)', width: 1.5, type: 'dashed' },
        itemStyle: { color: 'var(--color-engine-3)' },
        z: 2,
      },
      {
        name: 'Stockfish',
        type: 'line',
        data: stockfishData,
        smooth: 0.3,
        symbol: 'none',
        lineStyle: { color: 'var(--color-engine-1)', width: 2.5 },
        itemStyle: { color: 'var(--color-engine-1)' },
        z: 3,
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            { yAxis: 0, lineStyle: { color: axisLineColor, type: 'solid', width: 1 } },
          ],
          label: { show: false },
        },
      },
    ],
  }
})
</script>

<template>
  <div class="bg-base min-h-screen px-8 py-10 overflow-y-auto">
    <div class="max-w-3xl mx-auto flex flex-col gap-12">

      <!-- Header -->
      <div class="border-b border-border pb-6">
        <h1 class="font-display text-3xl font-bold text-primary">Design System</h1>
        <p class="text-secondary text-sm mt-1 font-mono">Component reference · Chess Lens</p>
      </div>

      <!-- ── Typography ── -->
      <section>
        <h2 class="section-title">Typography</h2>
        <UICard>
          <div class="p-5 flex flex-col gap-3">
            <p class="font-display text-2xl font-bold text-primary">Sicilian Defense — Playfair Display</p>
            <p class="text-primary leading-relaxed">
              Body text in DM Sans. Your opponent has 4 minutes remaining on the clock.
            </p>
            <p class="text-sm text-secondary">Secondary — ELO 1842 · Blitz · Rated</p>
            <p class="text-sm text-muted">Muted — Last active 3 minutes ago</p>
            <p class="text-sm text-accent font-medium">Accent — → View analysis</p>
            <p class="text-sm text-danger font-medium">Danger — ⚠ Connection lost</p>
            <p class="font-mono text-xs text-secondary">Mono — 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6</p>
          </div>
        </UICard>
      </section>

      <!-- ── Surface & Ink Tokens ── -->
      <section>
        <h2 class="section-title">Surface & Ink Tokens</h2>
        <div class="grid grid-cols-2 gap-3">
          <div class="swatch-row bg-base border border-border text-primary">
            <span class="font-mono text-xs opacity-60">bg-base</span>
            <span class="text-sm font-medium">Primary text</span>
          </div>
          <div class="swatch-row bg-raised border border-border text-primary">
            <span class="font-mono text-xs opacity-60">bg-raised</span>
            <span class="text-sm font-medium">Primary text</span>
          </div>
          <div class="swatch-row bg-overlay border border-border text-secondary">
            <span class="font-mono text-xs opacity-60">bg-overlay</span>
            <span class="text-sm font-medium">Secondary text</span>
          </div>
          <div class="swatch-row bg-sunken border border-border text-muted">
            <span class="font-mono text-xs opacity-60">bg-sunken</span>
            <span class="text-sm font-medium">Muted text</span>
          </div>
          <div class="swatch-row bg-accent-subtle border border-border text-accent">
            <span class="font-mono text-xs opacity-60">bg-accent-subtle</span>
            <span class="text-sm font-medium">Accent text</span>
          </div>
          <div class="swatch-row bg-accent text-inverse">
            <span class="font-mono text-xs opacity-70">bg-accent</span>
            <span class="text-sm font-medium">Inverse text</span>
          </div>
          <div class="swatch-row bg-danger text-inverse">
            <span class="font-mono text-xs opacity-70">bg-danger</span>
            <span class="text-sm font-medium">Inverse text</span>
          </div>
          <div class="swatch-row bg-danger-subtle border border-border text-danger">
            <span class="font-mono text-xs opacity-70">bg-danger-subtle</span>
            <span class="text-sm font-medium">Danger text</span>
          </div>
        </div>
      </section>

      <!-- ── Brand Scales ── -->
      <section>
        <h2 class="section-title">Brand Scales</h2>
        <div class="flex flex-col gap-4">
          <div>
            <p class="text-xs text-secondary font-mono mb-2">Olive (Primary Brand · hue 120)</p>
            <div class="flex rounded-lg overflow-hidden h-10">
              <div class="flex-1 bg-olive-50" />
              <div class="flex-1 bg-olive-100" />
              <div class="flex-1 bg-olive-200" />
              <div class="flex-1 bg-olive-300" />
              <div class="flex-1 bg-olive-400" />
              <div class="flex-1 bg-olive-500" />
              <div class="flex-1 bg-olive-600" />
              <div class="flex-1 bg-olive-700" />
              <div class="flex-1 bg-olive-800" />
              <div class="flex-1 bg-olive-900" />
              <div class="flex-1 bg-olive-950" />
            </div>
          </div>
          <div>
            <p class="text-xs text-secondary font-mono mb-2">Teal (Secondary / Accent · hue 178)</p>
            <div class="flex rounded-lg overflow-hidden h-10">
              <div class="flex-1 bg-teal-50" />
              <div class="flex-1 bg-teal-100" />
              <div class="flex-1 bg-teal-200" />
              <div class="flex-1 bg-teal-300" />
              <div class="flex-1 bg-teal-400" />
              <div class="flex-1 bg-teal-500" />
              <div class="flex-1 bg-teal-600" />
              <div class="flex-1 bg-teal-700" />
              <div class="flex-1 bg-teal-800" />
              <div class="flex-1 bg-teal-900" />
              <div class="flex-1 bg-teal-950" />
            </div>
          </div>
          <div>
            <p class="text-xs text-secondary font-mono mb-2">Slate (Neutral · hue 210)</p>
            <div class="flex rounded-lg overflow-hidden h-10">
              <div class="flex-1 bg-slate-50" />
              <div class="flex-1 bg-slate-100" />
              <div class="flex-1 bg-slate-200" />
              <div class="flex-1 bg-slate-300" />
              <div class="flex-1 bg-slate-400" />
              <div class="flex-1 bg-slate-500" />
              <div class="flex-1 bg-slate-600" />
              <div class="flex-1 bg-slate-700" />
              <div class="flex-1 bg-slate-800" />
              <div class="flex-1 bg-slate-900" />
              <div class="flex-1 bg-slate-950" />
            </div>
          </div>
          <div>
            <p class="text-xs text-secondary font-mono mb-2">Danger (hue 25)</p>
            <div class="flex rounded-lg overflow-hidden h-10">
              <div class="flex-1 bg-danger-50" />
              <div class="flex-1 bg-danger-100" />
              <div class="flex-1 bg-danger-200" />
              <div class="flex-1 bg-danger-300" />
              <div class="flex-1 bg-danger-400" />
              <div class="flex-1 bg-danger-500" />
              <div class="flex-1 bg-danger-600" />
              <div class="flex-1 bg-danger-700" />
              <div class="flex-1 bg-danger-800" />
              <div class="flex-1 bg-danger-900" />
              <div class="flex-1 bg-danger-950" />
            </div>
          </div>
        </div>
      </section>

      <!-- ── NAG Annotation Colors ── -->
      <section>
        <h2 class="section-title">NAG Annotations</h2>
        <UICard>
          <div class="p-5 flex flex-col gap-1">
            <div class="grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-3 items-center">
              <template v-for="item in nagItems" :key="item.nag">
                <span
                  class="font-mono text-lg font-bold w-8 text-right"
                  :style="{ color: nagColor(item.nag) }"
                >
                  {{ nagSymbol(item.nag) }}
                </span>
                <div class="flex flex-col">
                  <span class="text-sm font-medium text-primary">{{ item.label }}</span>
                  <span class="text-xs text-muted">{{ item.description }}</span>
                </div>
                <span
                  class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                  :class="nagBgClass(item.nag)"
                >
                  {{ item.label }}
                </span>
              </template>
            </div>
          </div>
        </UICard>

        <div class="mt-4">
          <p class="text-xs text-secondary font-mono mb-2">NAG colors as move text</p>
          <UICard>
            <div class="p-5">
              <p class="font-mono text-sm leading-relaxed">
                <span class="text-primary">1. e4 e5 2. Nf3 Nc6 3. Bb5 </span>
                <span :style="{ color: nagColor(NAG.Interesting) }">a6!? </span>
                <span class="text-primary">4. Ba4 Nf6 5. O-O </span>
                <span :style="{ color: nagColor(NAG.Good) }">Be7! </span>
                <span class="text-primary">6. Re1 b5 7. Bb3 d6 8. c3 </span>
                <span :style="{ color: nagColor(NAG.Inaccuracy) }">Na5?! </span>
                <span class="text-primary">9. Bc2 c5 10. d4 </span>
                <span :style="{ color: nagColor(NAG.Mistake) }">Bg4? </span>
                <span class="text-primary">11. d5 </span>
                <span :style="{ color: nagColor(NAG.Brilliant) }">Nd4!! </span>
                <span class="text-primary">12. Nxd4 </span>
                <span :style="{ color: nagColor(NAG.Blunder) }">cxd4?? </span>
              </p>
            </div>
          </UICard>
        </div>
      </section>

      <!-- ── Engine Identity Colors ── -->
      <section>
        <h2 class="section-title">Engine Identity</h2>
        <UICard>
          <div class="p-5 flex flex-col gap-4">
            <div
              v-for="engine in engineItems"
              :key="engine.id"
              class="flex items-center gap-4"
            >
              <div
                class="w-3 h-3 rounded-full shrink-0"
                :style="{ backgroundColor: `var(${engine.colorVar})` }"
              />
              <div class="flex-1 flex flex-col">
                <span class="text-sm font-medium" :style="{ color: `var(${engine.colorVar})` }">
                  {{ engine.name }}
                </span>
                <span class="text-xs text-muted">{{ engine.description }}</span>
              </div>
              <span
                class="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
                :style="{
                  backgroundColor: `var(${engine.subtleVar})`,
                  color: `var(${engine.colorVar})`,
                }"
              >
                Engine {{ engine.id }}
              </span>
            </div>
          </div>
        </UICard>
      </section>

      <!-- ── Eval Curve (Static Demo) ── -->
      <section>
        <h2 class="section-title">Eval Curve (Engine Colors)</h2>
        <UICard>
          <div class="p-4">
            <p class="text-xs text-muted mb-3">
              Static demo showing how engine identity colors appear on an eval chart.
            </p>
            <div class="h-64 w-full">
              <VChart :option="evalChartOption" autoresize class="w-full h-full" />
            </div>
          </div>
        </UICard>
      </section>

      <!-- ── Semantic Status ── -->
      <section>
        <h2 class="section-title">Semantic Status</h2>
        <div class="grid grid-cols-3 gap-3">
          <div class="swatch-row bg-success-subtle border border-border">
            <span class="font-mono text-xs text-success">success</span>
            <span class="text-sm font-medium text-success">Synced</span>
          </div>
          <div class="swatch-row bg-warning-subtle border border-border">
            <span class="font-mono text-xs text-warning">warning</span>
            <span class="text-sm font-medium text-warning">Low time</span>
          </div>
          <div class="swatch-row bg-info-subtle border border-border">
            <span class="font-mono text-xs text-info">info</span>
            <span class="text-sm font-medium text-info">Analyzing</span>
          </div>
        </div>
      </section>

      <!-- ── Chess Colors ── -->
      <section>
        <h2 class="section-title">Chess Colors</h2>
        <div class="grid grid-cols-3 gap-3">
          <div class="swatch-row border border-border bg-chess-white">
            <span class="font-mono text-xs" style="color: oklch(22% 0.005 0)">chess-white</span>
            <span class="text-sm font-medium" style="color: oklch(22% 0.005 0)">White</span>
          </div>
          <div class="swatch-row border border-border bg-chess-black">
            <span class="font-mono text-xs text-chess-white opacity-70">chess-black</span>
            <span class="text-sm font-medium text-chess-white">Black</span>
          </div>
          <div class="swatch-row border border-border bg-base">
            <span class="font-mono text-xs text-chess-draw">chess-draw</span>
            <span class="text-sm font-medium text-chess-draw">Draw</span>
          </div>
        </div>
      </section>

      <!-- ── Buttons ── -->
      <section>
        <h2 class="section-title">Buttons</h2>
        <UICard>
          <div class="p-5 flex flex-col gap-5">
            <div class="flex flex-col gap-2">
              <p class="text-xs text-muted font-mono">Variants</p>
              <div class="flex flex-wrap gap-2 items-center">
                <UIButton>Default</UIButton>
                <UIButton variant="secondary">Secondary</UIButton>
                <UIButton variant="outline">Outline</UIButton>
                <UIButton variant="ghost">Ghost</UIButton>
                <UIButton variant="link">Link</UIButton>
                <UIButton variant="destructive">Destructive</UIButton>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <p class="text-xs text-muted font-mono">Sizes</p>
              <div class="flex flex-wrap gap-2 items-center">
                <UIButton size="sm">Small</UIButton>
                <UIButton>Default</UIButton>
                <UIButton size="lg">Large</UIButton>
                <UIButton size="icon"><Settings class="size-4" /></UIButton>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <p class="text-xs text-muted font-mono">States</p>
              <div class="flex flex-wrap gap-2 items-center">
                <UIButton :disabled="isLoading" @click="simulateLoad">
                  {{ isLoading ? 'Loading…' : 'Click to Load' }}
                </UIButton>
                <UIButton disabled>Disabled</UIButton>
                <UIButton variant="outline" disabled>Disabled Outline</UIButton>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <p class="text-xs text-muted font-mono">With Icons</p>
              <div class="flex flex-wrap gap-2 items-center">
                <UIButton>
                  <Settings class="size-4" />Settings
                </UIButton>
                <UIButton variant="outline">
                  <ChevronLeft class="size-4" />Back
                </UIButton>
                <UIButton variant="link">
                  <ChevronLeft class="size-4" />Games
                </UIButton>
              </div>
            </div>
          </div>
        </UICard>
      </section>

      <!-- ── Button Groups ── -->
      <section>
        <h2 class="section-title">Button Groups</h2>
        <UICard>
          <div class="p-5 flex flex-col gap-6">
            <div class="flex flex-col gap-2">
              <p class="text-xs text-muted font-mono">Horizontal (default)</p>
              <div class="flex flex-col gap-3">
                <UIButtonGroup>
                  <UIButton>All</UIButton>
                  <UIButton variant="secondary">Wins</UIButton>
                  <UIButton variant="secondary">Losses</UIButton>
                  <UIButton variant="secondary">Draws</UIButton>
                </UIButtonGroup>
                <UIButtonGroup>
                  <UIButton variant="outline" size="icon"><ChevronsLeft class="size-4" /></UIButton>
                  <UIButton variant="outline" size="icon"><ChevronLeft class="size-4" /></UIButton>
                  <UIButton variant="outline" size="icon"><ChevronRight class="size-4" /></UIButton>
                  <UIButton variant="outline" size="icon"><ChevronsRight class="size-4" /></UIButton>
                </UIButtonGroup>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <p class="text-xs text-muted font-mono">Vertical</p>
              <div class="w-40">
                <UIButtonGroup orientation="vertical">
                  <UIButton variant="ghost">Analysis</UIButton>
                  <UIButton variant="ghost">Games</UIButton>
                  <UIButton variant="ghost">Settings</UIButton>
                </UIButtonGroup>
              </div>
            </div>
          </div>
        </UICard>
      </section>

      <!-- ── Inputs ── -->
      <section>
        <h2 class="section-title">Inputs</h2>
        <UICard>
          <div class="p-5 flex flex-col gap-5">
            <Field>
              <FieldLabel>Player name</FieldLabel>
              <UITextInput v-model="inputValue" placeholder="Search player…" />
            </Field>
            <Field>
              <FieldLabel>Username</FieldLabel>
              <UITextInput placeholder="e.g. magnus_c" />
            </Field>
            <Field>
              <FieldLabel>Email</FieldLabel>
              <UITextInput placeholder="you@example.com" />
            </Field>
            <p v-if="inputValue" class="font-mono text-xs text-secondary">
              Bound value: "{{ inputValue }}"
            </p>
          </div>
        </UICard>
      </section>

      <!-- ── Badges ── -->
      <section>
        <h2 class="section-title">Badges</h2>
        <UICard>
          <div class="p-5 flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              <p class="text-xs text-muted font-mono">Variants</p>
              <div class="flex flex-wrap gap-2 items-center">
                <UIChip>Default</UIChip>
                <UIChip variant="secondary">Secondary</UIChip>
                <UIChip variant="destructive">Destructive</UIChip>
                <UIChip variant="outline">Outline</UIChip>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <p class="text-xs text-muted font-mono">In context</p>
              <div class="flex flex-wrap gap-2 items-center">
                <UIChip>Blitz</UIChip>
                <UIChip variant="secondary">Rapid</UIChip>
                <UIChip variant="outline">Classical</UIChip>
                <UIChip>Win</UIChip>
                <UIChip variant="destructive">Loss</UIChip>
                <UIChip variant="secondary">Draw</UIChip>
              </div>
            </div>
          </div>
        </UICard>
      </section>

      <!-- ── Alert ── -->
      <section>
        <h2 class="section-title">Alert</h2>
        <div class="flex flex-col gap-3">
          <Alert variant="destructive">
            <AlertCircle class="size-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Could not connect to the chess engine. Please check your settings.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertCircle class="size-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Failed to sync games from Chess.com — request timed out.</AlertDescription>
          </Alert>
        </div>
      </section>

      <!-- ── Cards ── -->
      <section>
        <h2 class="section-title">Cards</h2>
        <UICard>
          <div class="p-5">
            <p class="text-sm text-secondary">Standard card — bordered surface with subtle shadow.</p>
          </div>
        </UICard>
      </section>

    </div>
  </div>
</template>

<style scoped>
.section-title {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-muted);
  margin-bottom: 12px;
}

.swatch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-radius: 8px;
}
</style>
