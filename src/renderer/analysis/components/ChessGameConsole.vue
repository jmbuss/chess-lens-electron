<script setup lang="ts">
import { watchEffect } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import ChessGameChart from './ChessGameChart.vue'
import ChessFeatureCurves from './ChessFeatureCurves.vue'
import ChessFeatureTimeline from './ChessFeatureTimeline.vue'
import ChessRelatedPositions from './ChessRelatedPositions.vue'
import SamePositionsGamesTable from './SamePositionsGamesTable.vue'

type ConsoleTab = 'chart' | 'features' | 'timeline' | 'same-positions' | 'positions'

const consoleTab = useLocalStorage<ConsoleTab>('chess-lens.analysis.console-tab', 'chart')

watchEffect(() => {
  const v = consoleTab.value
  if (v !== 'chart' && v !== 'features' && v !== 'timeline' && v !== 'same-positions' && v !== 'positions') {
    consoleTab.value = 'chart'
  }
})
</script>

<template>
  <Tabs v-model="consoleTab" class="flex flex-col h-full">
    <div class="shrink-0">
      <TabsList>
        <TabsTrigger value="chart">Eval Curve</TabsTrigger>
        <TabsTrigger value="features">Feature Curves</TabsTrigger>
        <TabsTrigger value="timeline">Feature Timeline</TabsTrigger>
        <TabsTrigger value="same-positions">Same Positions</TabsTrigger>
        <TabsTrigger value="positions">Related Positions</TabsTrigger>
      </TabsList>
    </div>
    <TabsContent value="chart" class="flex-1 min-h-0 mt-2 overflow-hidden">
      <ChessGameChart />
    </TabsContent>
    <TabsContent value="features" class="flex-1 min-h-0 mt-2 overflow-hidden">
      <ChessFeatureCurves />
    </TabsContent>
    <TabsContent value="timeline" class="flex-1 min-h-0 mt-2 overflow-hidden">
      <ChessFeatureTimeline />
    </TabsContent>
    <TabsContent value="same-positions" class="flex-1 min-h-0 mt-2 overflow-hidden flex flex-col">
      <SamePositionsGamesTable />
    </TabsContent>
    <TabsContent value="positions" class="flex-1 min-h-0 mt-2">
      <ChessRelatedPositions />
    </TabsContent>
  </Tabs>
</template>
