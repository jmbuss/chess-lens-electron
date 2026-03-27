<script setup lang="ts">
import { computed } from 'vue'
import { useInjectedGameNavigator } from '../composables/provideChessGame'
import { useInjectedGameAnalysis } from '../composables/provideGameAnalysis'

/** Mock centipawn value shown when no real analysis data exists yet. */
const MOCK_EVAL_CP = 120

const { currentFen } = useInjectedGameNavigator()
const { analysisByFen } = useInjectedGameAnalysis()

const currentNode = computed(() => analysisByFen.value.get(currentFen.value) ?? null)
const engineResult = computed(() => currentNode.value?.engineResult ?? null)
const isMock = computed(() => !engineResult.value)

/** Centipawn value to use — real data or mock fallback. */
const evalCp = computed(() => engineResult.value?.evalCp ?? MOCK_EVAL_CP)
const evalMate = computed(() => engineResult.value?.evalMate ?? null)

/** White winning percentage 0–100 using flex proportions. 50 = equal. */
const whitePercent = computed(() => {
  if (evalMate.value !== null) return evalMate.value > 0 ? 100 : 0
  return 100 / (1 + Math.exp(-evalCp.value / 400))
})

const blackPercent = computed(() => 100 - whitePercent.value)

const scoreLabel = computed(() => {
  if (evalMate.value !== null) {
    return evalMate.value > 0 ? `M${evalMate.value}` : `-M${Math.abs(evalMate.value)}`
  }
  const pawns = evalCp.value / 100
  return pawns > 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1)
})

const labelInWhite = computed(() => whitePercent.value >= 50)
</script>

<template>
  <div class="eval-bar-outer" :title="`Eval: ${scoreLabel}`">
    <div class="eval-bar" :class="{ 'is-mock': isMock }">
      <!-- White section on top -->
      <div
        class="eval-white"
        :style="{ flex: `${whitePercent} 0 0%` }"
      >
        <span v-if="labelInWhite" class="eval-label eval-label--dark">
          {{ scoreLabel }}
        </span>
      </div>
      <!-- Black section on bottom -->
      <div
        class="eval-black"
        :style="{ flex: `${blackPercent} 0 0%` }"
      >
        <span v-if="!labelInWhite" class="eval-label eval-label--light">
          {{ scoreLabel }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.eval-bar-outer {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  gap: 4px;
}

.eval-bar {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  overflow: hidden;
  min-height: 48px;
  transition: opacity 0.2s;
}

.eval-bar.is-mock {
  opacity: 0.45;
}

.eval-white {
  background-color: #ffffff;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10px;
  min-height: 0;
  transition: flex 0.35s ease;
}

.eval-black {
  background-color: #111111;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 10px;
  min-height: 0;
  transition: flex 0.35s ease;
}

.eval-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.03em;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  white-space: nowrap;
  line-height: 1;
  user-select: none;
}

.eval-label--dark {
  color: #111111;
}

.eval-label--light {
  color: #ffffff;
}

.bar-title {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-neutral-400, #a3a3a3);
  user-select: none;
}

.bar-title.is-mock-label {
  opacity: 0.5;
}
</style>
