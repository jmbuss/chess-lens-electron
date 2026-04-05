<script setup lang="ts">
import { watchEffect } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import ChessGameChart from './ChessGameChart.vue'
import ChessRelatedPositions from './ChessRelatedPositions.vue'
import SamePositionsGamesTable from './SamePositionsGamesTable.vue'

type ConsoleTab = 'chart' | 'same-positions' | 'positions'

const consoleTab = useLocalStorage<ConsoleTab>('chess-lens.analysis.console-tab', 'chart')

watchEffect(() => {
  const v = consoleTab.value
  if (v !== 'chart' && v !== 'same-positions' && v !== 'positions') {
    consoleTab.value = 'chart'
  }
})
</script>

<template>
  <Tabs v-model="consoleTab" class="flex flex-col h-full">
    <div class="shrink-0">
      <TabsList>
        <TabsTrigger value="chart">Eval Curve</TabsTrigger>
        <TabsTrigger value="same-positions">Same Positions</TabsTrigger>
        <TabsTrigger value="positions">Related Positions</TabsTrigger>
      </TabsList>
    </div>
    <TabsContent value="chart" class="flex-1 min-h-0 mt-2 overflow-hidden">
      <ChessGameChart />
    </TabsContent>
    <TabsContent value="same-positions" class="flex-1 min-h-0 mt-2 overflow-hidden flex flex-col">
      <SamePositionsGamesTable />
    </TabsContent>
    <TabsContent value="positions" class="flex-1 min-h-0 mt-2">
      <ChessRelatedPositions />
    </TabsContent>
  </Tabs>
</template>
