<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useInjectedGameNavigator } from '../composables/provideChessGame'
import { useInjectedGameAnalysis } from '../composables/provideGameAnalysis'
import ChessGameAnalysisTab from './ChessGameAnalysisTab.vue'
import ChessPositionAnalysisTab from './ChessPositionAnalysisTab.vue'

type ViewerTab = 'game' | 'position'

const activeTab = useLocalStorage<ViewerTab>('chess-lens.analysis.viewer-tab', 'game')

watchEffect(() => {
  const v = activeTab.value
  if (v !== 'game' && v !== 'position') {
    activeTab.value = 'game'
  }
})

const { currentFen } = useInjectedGameNavigator()
const { analysisByFen } = useInjectedGameAnalysis()

const currentNode = computed(() => analysisByFen.value.get(currentFen.value) ?? null)
const isAnalyzed = computed(() => currentNode.value?.fsmState === 'NAG_COMPLETE')
</script>

<template>
  <Tabs v-model="activeTab" class="flex flex-col h-full text-sm">
    <div class="px-3 pt-3 pb-1 shrink-0">
      <TabsList class="w-full">
        <TabsTrigger value="game" class="flex-1">Game Analysis</TabsTrigger>
        <TabsTrigger value="position" class="flex-1">Position Analysis</TabsTrigger>
      </TabsList>
    </div>

    <div v-if="!currentNode || !isAnalyzed" class="px-4 py-3 text-muted text-xs">
      This position has not been analyzed yet.
    </div>

    <template v-else>
      <TabsContent value="game" class="px-4 py-3">
        <ChessGameAnalysisTab />
      </TabsContent>

      <TabsContent value="position">
        <ChessPositionAnalysisTab />
      </TabsContent>
    </template>
  </Tabs>
</template>

<style scoped>
.progress-fade-enter-active,
.progress-fade-leave-active {
  transition: opacity 0.4s ease;
}
.progress-fade-enter-from,
.progress-fade-leave-to {
  opacity: 0;
}
</style>
