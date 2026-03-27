<script setup lang="ts">
import { computed } from 'vue'
import type { AnalysisLine } from 'src/services/engine/types'

const props = defineProps<{
  variant: 'stockfish' | 'maia'

  // stockfish
  line?: AnalysisLine
  moves?: { san: string; uci: string }[]
  startingColor?: 'w' | 'b'
  startingMoveNumber?: number

  // maia
  san?: string
  uci?: string
  probability?: number
  evalCp?: number | null
}>()

const emit = defineEmits<{
  hoverMove: [uci: string | null]
}>()

// ── Stockfish helpers ──────────────────────────────────────────────────────

interface AnnotatedMove {
  san: string
  uci: string
  moveNumber: number | null
  showDots: boolean
}

const annotatedMoves = computed((): AnnotatedMove[] => {
  if (props.variant !== 'stockfish' || !props.moves) return []
  const result: AnnotatedMove[] = []
  let moveNumber = props.startingMoveNumber ?? 1
  let color = props.startingColor ?? 'w'

  for (let i = 0; i < props.moves.length; i++) {
    const m = props.moves[i]
    const showMoveNumber = color === 'w' || i === 0
    const showDots = color === 'b' && i === 0

    result.push({
      san: m.san,
      uci: m.uci,
      moveNumber: showMoveNumber ? moveNumber : null,
      showDots,
    })

    if (color === 'b') moveNumber++
    color = color === 'w' ? 'b' : 'w'
  }

  return result
})

const stockfishScore = computed((): string => {
  if (!props.line) return '—'
  const { type, value } = props.line.score
  if (type === 'mate') return value > 0 ? `M${value}` : `-M${Math.abs(value)}`
  const pawns = value / 100
  return pawns > 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2)
})

const stockfishScoreClass = computed((): string => {
  if (!props.line) return 'text-muted'
  const { type, value } = props.line.score
  if (type === 'mate') return value > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
  if (value > 50) return 'text-green-600 dark:text-green-400'
  if (value < -50) return 'text-red-600 dark:text-red-400'
  return 'text-muted'
})

// ── Maia helpers ───────────────────────────────────────────────────────────

const maiaEvalLabel = computed((): string => {
  if (props.evalCp === null || props.evalCp === undefined) return '—'
  const pawns = props.evalCp / 100
  return pawns > 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2)
})

const maiaEvalClass = computed((): string => {
  if (props.evalCp === null || props.evalCp === undefined) return 'text-muted'
  if (props.evalCp > 50) return 'text-green-600 dark:text-green-400'
  if (props.evalCp < -50) return 'text-red-600 dark:text-red-400'
  return 'text-muted'
})

const maiaProbLabel = computed((): string => {
  if (props.probability === undefined) return '—'
  return `${(props.probability * 100).toFixed(0)}%`
})
</script>

<template>
  <div class="flex items-baseline gap-2 rounded-md bg-overlay px-3 py-2">

    <!-- Left: score (stockfish) or stockfish eval (maia) -->
    <span
      class="font-mono text-sm font-semibold min-w-14 text-right shrink-0"
      :class="variant === 'stockfish' ? stockfishScoreClass : maiaEvalClass"
    >
      {{ variant === 'stockfish' ? stockfishScore : maiaEvalLabel }}
    </span>

    <!-- Middle: numbered PV (stockfish) or single move no number (maia) -->
    <span class="flex-1 min-w-0 overflow-hidden">
      <span class="block truncate text-xs font-mono leading-relaxed">

        <!-- Stockfish: full PV with move numbers -->
        <template v-if="variant === 'stockfish'">
          <template v-for="(m, idx) in annotatedMoves" :key="idx">
            <span
              v-if="m.moveNumber !== null"
              class="text-muted select-none"
            >{{ m.moveNumber }}.{{ m.showDots ? '..' : '' }}</span><span
              class="text-secondary cursor-default rounded px-0.5 hover:bg-primary/20 transition-colors"
              :title="`Move ${idx + 1} in line`"
              @mouseenter="emit('hoverMove', m.uci)"
              @mouseleave="emit('hoverMove', null)"
            >{{ m.san }}</span>{{ ' ' }}
          </template>
        </template>

        <!-- Maia: single move, no move number -->
        <template v-else>
          <span
            class="text-secondary cursor-default rounded px-0.5 hover:bg-primary/20 transition-colors"
            title="Predicted human move"
            @mouseenter="emit('hoverMove', uci ?? null)"
            @mouseleave="emit('hoverMove', null)"
          >{{ san }}</span>
        </template>

      </span>
    </span>

    <!-- Right: depth (stockfish) or probability (maia) -->
    <span class="text-xs text-muted ml-auto whitespace-nowrap shrink-0 text-right tabular-nums">
      {{ variant === 'stockfish' ? `d${line?.depth}` : maiaProbLabel }}
    </span>

  </div>
</template>
