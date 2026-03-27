<script setup lang="ts">
import { computed } from 'vue'
import type { GameNode, GameChildNode } from '../composables/types'
import type { AnalysisNode } from 'src/database/analysis/types'
import { NAG } from 'src/services/engine/types'
import { nagColor, nagSymbol } from 'src/utils/chess/nag'
import { Button as UIButton } from '@/components/ui/button'

const props = defineProps<{
  /** The node whose mainline children we render */
  startNode: GameNode | GameChildNode
  /** The currently active node in the game tree */
  currentNode: GameNode | GameChildNode | null
  /** Optional analysis map (fen → AnalysisNode) for engine NAG lookup */
  analysisByFen?: Map<string, AnalysisNode>
  /** When true, renders moves inline (used for variations) */
  inline?: boolean
}>()

const emit = defineEmits<{
  selectNode: [node: GameChildNode]
}>()

// ─── NAG helpers ────────────────────────────────────────────────────────────

function getNag(node: GameChildNode): NAG | null {
  // Engine-computed NAG takes priority
  if (props.analysisByFen) {
    const a = props.analysisByFen.get(node.data.fen)
    if (a?.nag != null && a.nag !== NAG.Neutral) return a.nag
  }
  // Fall back to PGN-embedded NAG
  const raw = node.data.nags?.[0]
  if (raw != null && raw !== NAG.Neutral && (Object.values(NAG) as number[]).includes(raw)) {
    return raw as NAG
  }
  return null
}

// ─── Annotation helpers ─────────────────────────────────────────────────────

function formatClock(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function getEval(node: GameChildNode | null): string | null {
  if (!node || !props.analysisByFen) return null
  const a = props.analysisByFen.get(node.data.fen)
  if (!a?.engineResult) return null
  if (a.engineResult.evalMate != null) {
    const m = a.engineResult.evalMate
    return m > 0 ? `M${m}` : `-M${Math.abs(m)}`
  }
  if (a.engineResult.evalCp != null) {
    const p = a.engineResult.evalCp / 100
    return p >= 0 ? `+${p.toFixed(1)}` : p.toFixed(1)
  }
  return null
}

function getAnnotation(node: GameChildNode | null): string | null {
  if (!node) return null
  if (node.data.clock != null) return formatClock(node.data.clock)
  return getEval(node)
}

// True when at least the first mainline move has clock or eval data — used to
// decide whether to reserve space for the trailing annotation columns.
const hasAnyAnnotation = computed(() => {
  const first = props.startNode.children[0] as GameChildNode | undefined
  if (first?.data.clock != null) return true
  if (props.analysisByFen && props.analysisByFen.size > 0) return true
  return false
})

// ─── Mainline pair-row building ─────────────────────────────────────────────

interface PairRow {
  moveNumber: number
  white: GameChildNode | null
  variationsAfterWhite: GameChildNode[]
  black: GameChildNode | null
  variationsAfterBlack: GameChildNode[]
}

function buildPairRows(startNode: GameNode | GameChildNode): PairRow[] {
  const result: PairRow[] = []
  let current: GameNode | GameChildNode = startNode

  while (current.children.length > 0) {
    const first = current.children[0] as GameChildNode
    const sibs  = current.children.slice(1) as GameChildNode[]

    if (first.data.color === 'w') {
      const row: PairRow = {
        moveNumber: first.data.moveNumber,
        white: first,
        variationsAfterWhite: sibs,
        black: null,
        variationsAfterBlack: [],
      }

      // Pair white with the next black move if it's mainline
      if (first.children.length > 0) {
        const next = first.children[0] as GameChildNode
        if (next.data.color === 'b') {
          row.black = next
          row.variationsAfterBlack = first.children.slice(1) as GameChildNode[]
          current = next
        } else {
          current = first
        }
      } else {
        current = first
      }

      result.push(row)
    } else {
      // Black-first (variation starting mid-move, or position with black to move)
      result.push({
        moveNumber: first.data.moveNumber,
        white: null,
        variationsAfterWhite: [],
        black: first,
        variationsAfterBlack: sibs,
      })
      current = first
    }
  }

  return result
}

// ─── Inline token building (for variation lines) ────────────────────────────

interface MoveToken {
  type: 'move'
  node: GameChildNode
  showMoveNumber: boolean
  showDots: boolean
}

interface VariationToken {
  type: 'variation'
  variations: GameChildNode[]
}

type InlineToken = MoveToken | VariationToken

function buildInlineTokens(startNode: GameNode | GameChildNode): InlineToken[] {
  const tokens: InlineToken[] = []
  let cur: GameNode | GameChildNode = startNode
  let first = true

  while (cur.children.length > 0) {
    const main = cur.children[0] as GameChildNode
    tokens.push({
      type: 'move',
      node: main,
      showMoveNumber: main.data.color === 'w' || first,
      showDots: main.data.color === 'b' && first,
    })
    if (cur.children.length > 1) {
      tokens.push({
        type: 'variation',
        variations: cur.children.slice(1) as GameChildNode[],
      })
    }
    cur = main
    first = false
  }

  return tokens
}
</script>

<template>
  <!-- ── INLINE mode (used for variations) ─────────────────────────────── -->
  <template v-if="inline">
    <template v-for="(token, idx) in buildInlineTokens(startNode)" :key="idx">
      <template v-if="token.type === 'move'">
        <span v-if="token.showMoveNumber" class="text-muted select-none text-[11px]">
          {{ token.node.data.moveNumber }}.{{ token.showDots ? '..' : '' }}
        </span>
        <UIButton
          variant="ghost"
          class="px-0.5 h-auto py-0 rounded font-medium"
          :class="{ 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50': currentNode === token.node }"
          :style="currentNode !== token.node ? { color: nagColor(getNag(token.node)) } : {}"
          @click="emit('selectNode', token.node)"
        >{{ token.node.data.san }}{{ nagSymbol(getNag(token.node)) }}</UIButton>
      </template>

      <template v-if="token.type === 'variation'">
        <span
          v-for="(variation, vIdx) in token.variations"
          :key="vIdx"
          class="inline text-[11px] text-muted ml-0.5"
        >
          <span class="text-muted italic">(</span>
          <span class="text-muted select-none">
            {{ variation.data.moveNumber }}.{{ variation.data.color === 'b' ? '..' : '' }}
          </span>
          <UIButton
            variant="ghost"
            class="px-0.5 h-auto py-0 rounded"
            :class="{ 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50': currentNode === variation }"
            :style="currentNode !== variation ? { color: nagColor(getNag(variation)) } : {}"
            @click="emit('selectNode', variation)"
          >{{ variation.data.san }}{{ nagSymbol(getNag(variation)) }}</UIButton>
          <MoveTree
            :start-node="(variation as GameChildNode)"
            :current-node="currentNode"
            :analysis-by-fen="analysisByFen"
            :inline="true"
            @select-node="emit('selectNode', $event)"
          />
          <span class="text-muted italic">)</span>
        </span>
      </template>
    </template>
  </template>

  <!-- ── MAINLINE mode: pair rows ──────────────────────────────────────── -->
  <template v-else>
    <div
      v-for="(row, rowIdx) in buildPairRows(startNode)"
      :key="rowIdx"
      class="contents"
    >
      <!-- Main pair row -->
      <div
        class="flex items-center px-1 py-[3px] rounded-sm"
        :class="rowIdx % 2 === 1 ? 'bg-neutral-100/60 dark:bg-neutral-700/25' : ''"
      >
        <!-- Move number -->
        <span class="text-muted text-[11px] font-mono w-7 shrink-0 select-none text-right pr-1">
          {{ row.moveNumber }}.
        </span>

        <!-- White move + annotation -->
        <div class="flex-1 flex items-center justify-between ml-0.5 gap-1 min-w-0">
          <template v-if="row.white">
            <UIButton
              variant="ghost"
              class="flex-1 min-w-0 justify-start px-1 py-0.5 h-auto rounded text-[13px] font-medium truncate"
              :class="{ 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50': currentNode === row.white }"
              :style="currentNode !== row.white ? { color: nagColor(getNag(row.white)) } : {}"
              @click="emit('selectNode', row.white)"
            >{{ row.white.data.san }}{{ nagSymbol(getNag(row.white)) }}</UIButton>
            <span v-if="hasAnyAnnotation" class="ml-1 shrink-0 text-[10px] font-mono text-muted tabular-nums">
              {{ getAnnotation(row.white) }}
            </span>
          </template>
        </div>

        <!-- Black move + annotation -->
        <div class="flex-1 flex items-center justify-between ml-2 mr-2 gap-1 min-w-0">
          <template v-if="row.black">
            <UIButton
              variant="ghost"
              class="flex-1 min-w-0 justify-start px-1 py-0.5 h-auto rounded text-[13px] font-medium truncate"
              :class="{ 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50': currentNode === row.black }"
              :style="currentNode !== row.black ? { color: nagColor(getNag(row.black)) } : {}"
              @click="emit('selectNode', row.black)"
            >{{ row.black.data.san }}{{ nagSymbol(getNag(row.black)) }}</UIButton>
            <span v-if="hasAnyAnnotation" class="ml-1 shrink-0 text-[10px] font-mono text-muted tabular-nums">
              {{ getAnnotation(row.black) }}
            </span>
          </template>
        </div>
      </div>

      <!-- Variations branching from white's move (alternative white moves) -->
      <div
        v-for="(variation, vIdx) in row.variationsAfterWhite"
        :key="`vw-${vIdx}`"
        class="flex items-start ml-2 pl-2 border-l-2 border-border/50 py-0.5 my-px"
      >
        <div class="flex flex-wrap gap-x-0.5 items-baseline text-[12px] text-secondary leading-5">
          <span class="text-muted select-none text-[11px]">
            {{ variation.data.moveNumber }}.{{ variation.data.color === 'b' ? '..' : '' }}
          </span>
          <UIButton
            variant="ghost"
            class="px-0.5 h-auto py-0 rounded font-medium"
            :class="{ 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50': currentNode === variation }"
            :style="currentNode !== variation ? { color: nagColor(getNag(variation)) } : {}"
            @click="emit('selectNode', variation)"
          >{{ variation.data.san }}{{ nagSymbol(getNag(variation)) }}</UIButton>
          <MoveTree
            :start-node="(variation as GameChildNode)"
            :current-node="currentNode"
            :analysis-by-fen="analysisByFen"
            :inline="true"
            @select-node="emit('selectNode', $event)"
          />
        </div>
      </div>

      <!-- Variations branching from black's move (alternative black responses) -->
      <div
        v-for="(variation, vIdx) in row.variationsAfterBlack"
        :key="`vb-${vIdx}`"
        class="flex items-start ml-2 pl-2 border-l-2 border-border/50 py-0.5 my-px"
      >
        <div class="flex flex-wrap gap-x-0.5 items-baseline text-[12px] text-secondary leading-5">
          <span class="text-muted select-none text-[11px]">
            {{ variation.data.moveNumber }}.{{ variation.data.color === 'b' ? '..' : '' }}
          </span>
          <UIButton
            variant="ghost"
            class="px-0.5 h-auto py-0 rounded font-medium"
            :class="{ 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50': currentNode === variation }"
            :style="currentNode !== variation ? { color: nagColor(getNag(variation)) } : {}"
            @click="emit('selectNode', variation)"
          >{{ variation.data.san }}{{ nagSymbol(getNag(variation)) }}</UIButton>
          <MoveTree
            :start-node="(variation as GameChildNode)"
            :current-node="currentNode"
            :analysis-by-fen="analysisByFen"
            :inline="true"
            @select-node="emit('selectNode', $event)"
          />
        </div>
      </div>
    </div>
  </template>
</template>
