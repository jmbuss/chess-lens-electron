<script setup lang="ts">
import { computed } from 'vue'
import { useInjectedGameNavigator } from '../composables/provideChessGame'
import { useInjectedGameAnalysis } from '../composables/provideGameAnalysis'

/** Mock criticality score shown when no real analysis data exists yet. */
const MOCK_CRITICALITY = 0.62

const { currentFen } = useInjectedGameNavigator()
const { analysisByFen } = useInjectedGameAnalysis()

const currentNode = computed(() => analysisByFen.value.get(currentFen.value) ?? null)

const criticalityScore = computed(() => currentNode.value?.criticalityScore ?? null)
const isMock = computed(() => criticalityScore.value === null)

/** Score to use — real data or mock fallback. */
const activeScore = computed(() => criticalityScore.value ?? MOCK_CRITICALITY)

/** 0–100 fill percentage (fills from the bottom up). */
const fillPercent = computed(() =>
  Math.round(Math.min(1, Math.max(0, activeScore.value)) * 100),
)

const emptyPercent = computed(() => 100 - fillPercent.value)

const fillColor = computed(() => {
  const s = activeScore.value
  if (s >= 0.75) return '#ef4444' // red-500
  if (s >= 0.5) return '#f97316'  // orange-500
  if (s >= 0.25) return '#eab308' // yellow-500
  return '#22c55e'                // green-500
})

const scoreLabel = computed(() => `${fillPercent.value}%`)
</script>

<template>
  <div class="criticality-bar-outer" :title="`Criticality: ${scoreLabel}`">
    <div class="criticality-track" :class="{ 'is-mock': isMock }">
      <!-- Spacer pushes fill to the bottom -->
      <div class="criticality-spacer" :style="{ flex: `${emptyPercent} 0 0%` }" />
      <div
        class="criticality-fill"
        :style="{ flex: `${fillPercent} 0 0%`, backgroundColor: fillColor }"
      >
        <span class="criticality-label">Critical Position</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.criticality-bar-outer {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  gap: 4px;
}

.criticality-track {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  overflow: hidden;
  background-color: var(--color-neutral-200);
  min-height: 48px;
  transition: opacity 0.2s;
}

:global(.dark) .criticality-track {
  background-color: var(--color-neutral-700);
}

.criticality-track.is-mock {
  opacity: 0.45;
}

.criticality-spacer {
  min-height: 0;
  transition: flex 0.35s ease;
}

.criticality-fill {
  min-height: 0;
  border-radius: 0 0 4px 4px;
  transition: flex 0.35s ease, background-color 0.35s ease;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 10px;
  overflow: hidden;
}

.criticality-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.85);
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  white-space: nowrap;
  line-height: 1;
  user-select: none;
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
