<script setup lang="ts">
import { computed } from 'vue'
import type { Key } from 'chessground/types'
import { useInjectedGameNavigator } from '../composables/provideChessGame'
import { useInjectedGameAnalysis } from '../composables/provideGameAnalysis'
import { useHumanMoveAnalysis } from '../composables/useHumanMoveAnalysis'
import type { HumanMovePrediction } from 'src/services/engine/types'
import type { GameChildNode } from '../composables/types'
import { nagSymbol, nagBgClass as getNagBgClass, nagName } from 'src/utils/chess/nag'
import { isGameOver as checkGameOver, uciToSan as toSan, applyUciMove } from 'src/utils/chess/GameTree'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ChevronDown, Info, BookOpen } from 'lucide-vue-next'
import EngineLineRow from './EngineLineRow.vue'

const { currentFen, hoveredEvalMove, currentNode: treeNode } = useInjectedGameNavigator()
const { analysisByFen } = useInjectedGameAnalysis()

// Analysis for the current (before-move) position
const analysisNode = computed(() => analysisByFen.value.get(currentFen.value) ?? null)

const engineResult = computed(() => analysisNode.value?.engineResult ?? null)
const maiaFloorResult = computed(() => analysisNode.value?.maiaFloorResult ?? null)
const maiaCeilingResult = computed(() => analysisNode.value?.maiaCeilingResult ?? null)
const augmentedMaiaFloor = computed(() => analysisNode.value?.augmentedMaiaFloor ?? null)
const augmentedMaiaCeiling = computed(() => analysisNode.value?.augmentedMaiaCeiling ?? null)
const floorMistakeProb = computed(() => analysisNode.value?.floorMistakeProb ?? null)
const ceilingMistakeProb = computed(() => analysisNode.value?.ceilingMistakeProb ?? null)

const isGameOver = computed(() => checkGameOver(currentFen.value))

// The move played FROM the current position (first mainline child)
const nextMoveNode = computed((): GameChildNode | null => {
  const node = treeNode.value
  if (!node || node.children.length === 0) return null
  return node.children[0] as GameChildNode
})

// Analysis for the resulting position after the played move
const nextAnalysisNode = computed(() => {
  const next = nextMoveNode.value
  if (!next) return null
  return analysisByFen.value.get(next.data.fen) ?? null
})

const moveSan = computed(() => nextMoveNode.value?.data.san ?? null)
const nag = computed(() => nextAnalysisNode.value?.nag ?? null)
const isBookMove = computed(() => nextAnalysisNode.value?.isBookMove ?? false)

const hasAugmentedMaia = computed(() => augmentedMaiaFloor.value !== null || augmentedMaiaCeiling.value !== null)

const {
  predictions: humanPredictions,
  isLoading: isHumanLoading,
  isError: isHumanError,
} = useHumanMoveAnalysis(currentFen)

const formatEval = (evalCp: number | null, evalMate: number | null): string => {
  if (evalMate !== null) {
    return evalMate > 0 ? `M${evalMate}` : `-M${Math.abs(evalMate)}`
  }
  if (evalCp === null) return '—'
  const pawns = evalCp / 100
  return pawns > 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2)
}

// Eval of the resulting position after the played move
const evalClass = computed((): string => {
  const cp = nextAnalysisNode.value?.engineResult?.evalCp
  const mate = nextAnalysisNode.value?.engineResult?.evalMate
  if (mate !== null && mate !== undefined) return mate > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
  if (cp === null || cp === undefined) return 'text-muted'
  if (cp > 50) return 'text-green-600 dark:text-green-400'
  if (cp < -50) return 'text-red-600 dark:text-red-400'
  return 'text-muted'
})

const nagLabel = computed((): string => nagSymbol(nag.value ?? null))
const nagBgClass = computed((): string => getNagBgClass(nag.value ?? null))

const formatPct = (v: number): string => `${(v * 100).toFixed(0)}%`

function uciToSan(fen: string, uci: string): string {
  return toSan(fen, uci)
}

function pvToSanAndUci(fen: string, pv: string[], maxMoves = 6): { san: string; uci: string }[] {
  const result: { san: string; uci: string }[] = []
  let currentFen = fen
  for (let i = 0; i < Math.min(pv.length, maxMoves); i++) {
    const uci = pv[i]
    if (!uci || uci.length < 4) break
    const san = toSan(currentFen, uci)
    if (san === uci) break
    const nextFen = applyUciMove(currentFen, uci)
    if (!nextFen) break
    result.push({ san, uci })
    currentFen = nextFen
  }
  return result
}

const engineLinesWithMoves = computed(() => {
  const fen = currentFen.value
  const lines = engineResult.value?.lines ?? []
  if (!fen) return []
  return lines.map((line) => ({
    line,
    moves: pvToSanAndUci(fen, line.pv),
  }))
})

const startingColor = computed((): 'w' | 'b' => {
  const parts = currentFen.value.split(' ')
  return parts[1] === 'b' ? 'b' : 'w'
})

const startingMoveNumber = computed((): number => {
  const parts = currentFen.value.split(' ')
  return parseInt(parts[5] ?? '1', 10) || 1
})

function setHoveredMove(uci: string | null): void {
  if (!uci || uci.length < 4) {
    hoveredEvalMove.value = null
    return
  }
  hoveredEvalMove.value = {
    from: uci.slice(0, 2) as Key,
    to: uci.slice(2, 4) as Key,
  }
}

function maiaProbs(predictions: HumanMovePrediction[]): number[] {
  if (!predictions.length) return []

  if (predictions.every(p => p.policyProb !== undefined)) {
    return predictions.map(p => p.policyProb!)
  }

  const scores = predictions.map(p => p.score)
  const hasScores = scores.some(s => s !== undefined)
  if (!hasScores) {
    const u = 1 / predictions.length
    return predictions.map(() => u)
  }
  const logits = scores.map(s => (s ?? -Infinity) / 100)
  const maxL = Math.max(...logits.filter(l => isFinite(l)))
  const exps = logits.map(l => Math.exp(l - maxL))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map(e => (sum > 0 ? e / sum : 0))
}

const augmentedFloorProbs = computed((): number[] =>
  maiaProbs(augmentedMaiaFloor.value?.predictions ?? [])
)
const augmentedCeilingProbs = computed((): number[] =>
  maiaProbs(augmentedMaiaCeiling.value?.predictions ?? [])
)
const plainFloorProbs = computed((): number[] =>
  maiaProbs(maiaFloorResult.value?.predictions ?? [])
)
const plainCeilingProbs = computed((): number[] =>
  maiaProbs(maiaCeilingResult.value?.predictions ?? [])
)
</script>

<template>
  <div class="flex flex-col">
    <!-- Sticky top: Move Played + Mistake Probability -->
    <div class="sticky top-0 z-10 bg-background border-b border-border flex flex-col">
      <!-- Move Played collapsible -->
      <Collapsible v-if="moveSan" default-open>
        <CollapsibleTrigger class="flex w-full items-center justify-between px-4 py-3 text-left group">
          <span class="text-xs font-medium text-secondary uppercase tracking-wide">Move Played</span>
          <ChevronDown class="h-3.5 w-3.5 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent class="px-4 pb-3">
          <div class="flex items-center gap-3">
            <span class="font-mono text-[1rem] font-bold">{{ moveSan }}</span>
            <TooltipProvider v-if="isBookMove">
              <Tooltip>
                <TooltipTrigger as-child>
                  <BookOpen class="h-4 w-4 shrink-0 text-secondary" />
                </TooltipTrigger>
                <TooltipContent side="right">Opening book move</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider v-if="nagLabel">
              <Tooltip>
                <TooltipTrigger as-child>
                  <span
                    class="text-sm font-bold px-2 py-0.5 rounded cursor-default"
                    :class="nagBgClass"
                  >
                    {{ nagLabel }}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right">{{ nagName(nag) }}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          <span class="ml-auto font-mono text-sm font-semibold" :class="evalClass">
            {{ formatEval(nextAnalysisNode?.engineResult?.evalCp ?? null, nextAnalysisNode?.engineResult?.evalMate ?? null) }}
          </span>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <!-- Mistake Probability collapsible -->
      <Collapsible v-if="floorMistakeProb || ceilingMistakeProb || isGameOver" default-open>
        <CollapsibleTrigger class="flex w-full items-center justify-between px-4 py-3 text-left group">
          <span class="text-xs font-medium text-secondary uppercase tracking-wide">Mistake Probability</span>
          <ChevronDown class="h-3.5 w-3.5 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent class="px-4 pb-3 flex flex-col gap-3">
          <span v-if="isGameOver && !floorMistakeProb && !ceilingMistakeProb" class="text-sm text-muted font-mono">—</span>
          <!-- Floor model -->
          <div v-if="floorMistakeProb" class="flex flex-col gap-1.5">
            <span class="text-xs text-muted">
              {{ augmentedMaiaFloor?.rating ?? maiaFloorResult?.rating }} Elo (your level)
            </span>
            <div class="flex h-3 rounded-full overflow-hidden">
              <div
                v-if="floorMistakeProb.goodMoveProb > 0"
                class="bg-green-500"
                :style="{ width: formatPct(floorMistakeProb.goodMoveProb) }"
                :title="`Good: ${formatPct(floorMistakeProb.goodMoveProb)}`"
              />
              <div
                v-if="floorMistakeProb.inaccuracyProb > 0"
                class="bg-yellow-400"
                :style="{ width: formatPct(floorMistakeProb.inaccuracyProb) }"
                :title="`Inaccuracy: ${formatPct(floorMistakeProb.inaccuracyProb)}`"
              />
              <div
                v-if="floorMistakeProb.mistakeProb > 0"
                class="bg-orange-500"
                :style="{ width: formatPct(floorMistakeProb.mistakeProb) }"
                :title="`Mistake: ${formatPct(floorMistakeProb.mistakeProb)}`"
              />
              <div
                v-if="floorMistakeProb.blunderProb > 0"
                class="bg-red-500"
                :style="{ width: formatPct(floorMistakeProb.blunderProb) }"
                :title="`Blunder: ${formatPct(floorMistakeProb.blunderProb)}`"
              />
            </div>
            <div class="flex gap-3 text-[10px] text-muted">
              <span v-if="floorMistakeProb.goodMoveProb > 0">
                <span class="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-0.5" />
                {{ formatPct(floorMistakeProb.goodMoveProb) }}
              </span>
              <span v-if="floorMistakeProb.inaccuracyProb > 0">
                <span class="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 mr-0.5" />
                {{ formatPct(floorMistakeProb.inaccuracyProb) }}
              </span>
              <span v-if="floorMistakeProb.mistakeProb > 0">
                <span class="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 mr-0.5" />
                {{ formatPct(floorMistakeProb.mistakeProb) }}
              </span>
              <span v-if="floorMistakeProb.blunderProb > 0">
                <span class="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-0.5" />
                {{ formatPct(floorMistakeProb.blunderProb) }}
              </span>
            </div>
          </div>

          <!-- Ceiling model -->
          <div
            v-if="ceilingMistakeProb && augmentedMaiaCeiling?.rating !== augmentedMaiaFloor?.rating"
            class="flex flex-col gap-1.5"
          >
            <span class="text-xs text-muted">
              {{ augmentedMaiaCeiling?.rating ?? maiaCeilingResult?.rating }} Elo (next level)
            </span>
            <div class="flex h-3 rounded-full overflow-hidden">
              <div
                v-if="ceilingMistakeProb.goodMoveProb > 0"
                class="bg-green-500"
                :style="{ width: formatPct(ceilingMistakeProb.goodMoveProb) }"
                :title="`Good: ${formatPct(ceilingMistakeProb.goodMoveProb)}`"
              />
              <div
                v-if="ceilingMistakeProb.inaccuracyProb > 0"
                class="bg-yellow-400"
                :style="{ width: formatPct(ceilingMistakeProb.inaccuracyProb) }"
                :title="`Inaccuracy: ${formatPct(ceilingMistakeProb.inaccuracyProb)}`"
              />
              <div
                v-if="ceilingMistakeProb.mistakeProb > 0"
                class="bg-orange-500"
                :style="{ width: formatPct(ceilingMistakeProb.mistakeProb) }"
                :title="`Mistake: ${formatPct(ceilingMistakeProb.mistakeProb)}`"
              />
              <div
                v-if="ceilingMistakeProb.blunderProb > 0"
                class="bg-red-500"
                :style="{ width: formatPct(ceilingMistakeProb.blunderProb) }"
                :title="`Blunder: ${formatPct(ceilingMistakeProb.blunderProb)}`"
              />
            </div>
            <div class="flex gap-3 text-[10px] text-muted">
              <span v-if="ceilingMistakeProb.goodMoveProb > 0">
                <span class="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-0.5" />
                {{ formatPct(ceilingMistakeProb.goodMoveProb) }}
              </span>
              <span v-if="ceilingMistakeProb.inaccuracyProb > 0">
                <span class="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 mr-0.5" />
                {{ formatPct(ceilingMistakeProb.inaccuracyProb) }}
              </span>
              <span v-if="ceilingMistakeProb.mistakeProb > 0">
                <span class="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 mr-0.5" />
                {{ formatPct(ceilingMistakeProb.mistakeProb) }}
              </span>
              <span v-if="ceilingMistakeProb.blunderProb > 0">
                <span class="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-0.5" />
                {{ formatPct(ceilingMistakeProb.blunderProb) }}
              </span>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>

    <!-- Scrollable rest -->
    <div class="flex flex-col gap-2 py-2">
    <!-- Engine lines collapsible -->
    <Collapsible default-open>
      <CollapsibleTrigger class="flex w-full items-center justify-between px-4 py-3 text-left group">
        <div class="flex items-center gap-2">
          <span class="shrink-0 w-1.5 h-1.5 rounded-full bg-green-500" />
          <span class="text-xs font-medium text-secondary uppercase tracking-wide">Stockfish</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Info class="h-3 w-3 text-muted hover:text-secondary transition-colors shrink-0" @click.stop />
              </TooltipTrigger>
              <TooltipContent side="right" class="max-w-48">
                Computer lines — the source of truth for position evaluation
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <ChevronDown class="h-3.5 w-3.5 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180 shrink-0" />
      </CollapsibleTrigger>
      <CollapsibleContent class="px-4 pb-3 flex flex-col gap-2">
        <EngineLineRow
          v-for="{ line, moves } in engineLinesWithMoves"
          :key="line.multipv"
          variant="stockfish"
          :line="line"
          :moves="moves"
          :starting-color="startingColor"
          :starting-move-number="startingMoveNumber"
          @hover-move="setHoveredMove"
        />
        <div v-if="!engineResult?.lines?.length" class="text-xs text-muted">
          No engine lines available.
        </div>
      </CollapsibleContent>
    </Collapsible>

    <!-- Augmented Maia floor collapsible -->
    <Collapsible v-if="augmentedMaiaFloor" default-open>
      <CollapsibleTrigger class="flex w-full items-center justify-between px-4 py-3 text-left group">
        <div class="flex items-center gap-2">
          <span class="shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-500" />
          <span class="text-xs font-medium text-secondary uppercase tracking-wide">Maia {{ augmentedMaiaFloor.rating }}</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Info class="h-3 w-3 text-muted hover:text-secondary transition-colors shrink-0" @click.stop />
              </TooltipTrigger>
              <TooltipContent side="right" class="max-w-52">
                Human move probabilities for a player at {{ augmentedMaiaFloor.rating }} Elo rating strength
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <ChevronDown class="h-3.5 w-3.5 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180 shrink-0" />
      </CollapsibleTrigger>
      <CollapsibleContent class="px-4 pb-3 flex flex-col gap-2">
        <EngineLineRow
          v-for="(pred, idx) in augmentedMaiaFloor.predictions"
          :key="pred.move"
          variant="maia"
          :san="uciToSan(currentFen, pred.move)"
          :uci="pred.move"
          :probability="augmentedFloorProbs[idx]"
          :eval-cp="pred.stockfishEval ?? null"
          :eval-score="pred.stockfishScore ?? null"
          @hover-move="setHoveredMove"
        />
      </CollapsibleContent>
    </Collapsible>

    <!-- Augmented Maia ceiling collapsible -->
    <Collapsible
      v-if="augmentedMaiaCeiling && augmentedMaiaCeiling.rating !== augmentedMaiaFloor?.rating"
      default-open
    >
      <CollapsibleTrigger class="flex w-full items-center justify-between px-4 py-3 text-left group">
        <div class="flex items-center gap-2">
          <span class="shrink-0 w-1.5 h-1.5 rounded-full bg-orange-500" />
          <span class="text-xs font-medium text-secondary uppercase tracking-wide">Maia {{ augmentedMaiaCeiling.rating }}</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Info class="h-3 w-3 text-muted hover:text-secondary transition-colors shrink-0" @click.stop />
              </TooltipTrigger>
              <TooltipContent side="right" class="max-w-52">
                Human move probabilities for a player at {{ augmentedMaiaCeiling.rating }} Elo rating strength
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <ChevronDown class="h-3.5 w-3.5 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180 shrink-0" />
      </CollapsibleTrigger>
      <CollapsibleContent class="px-4 pb-3 flex flex-col gap-2">
        <EngineLineRow
          v-for="(pred, idx) in augmentedMaiaCeiling.predictions"
          :key="pred.move"
          variant="maia"
          :san="uciToSan(currentFen, pred.move)"
          :uci="pred.move"
          :probability="augmentedCeilingProbs[idx]"
          :eval-cp="pred.stockfishEval ?? null"
          :eval-score="pred.stockfishScore ?? null"
          @hover-move="setHoveredMove"
        />
      </CollapsibleContent>
    </Collapsible>

    <!-- Fallback: plain Maia floor collapsible -->
    <Collapsible v-if="!hasAugmentedMaia && maiaFloorResult" default-open>
      <CollapsibleTrigger class="flex w-full items-center justify-between px-4 py-3 text-left group">
        <div class="flex items-center gap-2">
          <span class="shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-500" />
          <span class="text-xs font-medium text-secondary uppercase tracking-wide">Maia {{ maiaFloorResult.rating }}</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Info class="h-3 w-3 text-muted hover:text-secondary transition-colors shrink-0" @click.stop />
              </TooltipTrigger>
              <TooltipContent side="right" class="max-w-52">
                Human move probabilities for a player at {{ maiaFloorResult.rating }} Elo rating strength
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <ChevronDown class="h-3.5 w-3.5 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180 shrink-0" />
      </CollapsibleTrigger>
      <CollapsibleContent class="px-4 pb-3 flex flex-col gap-2">
        <EngineLineRow
          v-for="(pred, idx) in maiaFloorResult.predictions"
          :key="pred.move"
          variant="maia"
          :san="uciToSan(currentFen, pred.move)"
          :uci="pred.move"
          :probability="plainFloorProbs[idx]"
          @hover-move="setHoveredMove"
        />
      </CollapsibleContent>
    </Collapsible>

    <!-- Fallback: plain Maia ceiling collapsible -->
    <Collapsible
      v-if="!hasAugmentedMaia && maiaCeilingResult && maiaCeilingResult.rating !== maiaFloorResult?.rating"
      default-open
    >
      <CollapsibleTrigger class="flex w-full items-center justify-between px-4 py-3 text-left group">
        <div class="flex items-center gap-2">
          <span class="shrink-0 w-1.5 h-1.5 rounded-full bg-orange-500" />
          <span class="text-xs font-medium text-secondary uppercase tracking-wide">Maia {{ maiaCeilingResult.rating }}</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Info class="h-3 w-3 text-muted hover:text-secondary transition-colors shrink-0" @click.stop />
              </TooltipTrigger>
              <TooltipContent side="right" class="max-w-52">
                Human move probabilities for a player at {{ maiaCeilingResult.rating }} Elo rating strength
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <ChevronDown class="h-3.5 w-3.5 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180 shrink-0" />
      </CollapsibleTrigger>
      <CollapsibleContent class="px-4 pb-3 flex flex-col gap-2">
        <EngineLineRow
          v-for="(pred, idx) in maiaCeilingResult.predictions"
          :key="pred.move"
          variant="maia"
          :san="uciToSan(currentFen, pred.move)"
          :uci="pred.move"
          :probability="plainCeilingProbs[idx]"
          @hover-move="setHoveredMove"
        />
      </CollapsibleContent>
    </Collapsible>

    <!-- Fallback live Maia collapsible -->
    <Collapsible
      v-if="!hasAugmentedMaia && !maiaFloorResult && !maiaCeilingResult"
      default-open
    >
      <CollapsibleTrigger class="flex w-full items-center justify-between px-4 py-3 text-left group">
        <div class="flex items-center gap-2">
          <span class="shrink-0 w-1.5 h-1.5 rounded-full bg-violet-500" />
          <span class="text-xs font-medium text-secondary uppercase tracking-wide">Maia</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Info class="h-3 w-3 text-muted hover:text-secondary transition-colors shrink-0" @click.stop />
              </TooltipTrigger>
              <TooltipContent side="right" class="max-w-52">
                Human move probabilities based on how players typically respond in this position
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <ChevronDown class="h-3.5 w-3.5 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180 shrink-0" />
      </CollapsibleTrigger>
      <CollapsibleContent class="px-4 pb-3 flex flex-col gap-2">
        <div v-if="isHumanLoading" class="flex items-center gap-2 text-xs text-muted py-2">
          <svg class="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Predicting…
        </div>
        <div v-else-if="isHumanError" class="text-xs text-red-500 dark:text-red-400 py-2">
          Failed to load human move predictions.
        </div>
        <template v-else>
          <EngineLineRow
            v-for="prediction in humanPredictions"
            :key="prediction.move"
            variant="maia"
            :san="uciToSan(currentFen, prediction.move)"
            :uci="prediction.move"
            :probability="prediction.policyProb"
            @hover-move="setHoveredMove"
          />
        </template>
      </CollapsibleContent>
    </Collapsible>

    </div>
  </div>
</template>
