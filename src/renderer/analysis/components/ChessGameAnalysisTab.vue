<script setup lang="ts">
import { useInjectedChessGame } from '../composables/provideChessGame'
import { useInjectedGameAnalysis } from '../composables/provideGameAnalysis'
import ChessGameSummaryRadar from './ChessGameSummaryRadar.vue'
import ChessPlayerStatsPanel from './ChessPlayerStatsPanel.vue'
import { usePlayerStats } from '../composables/usePlayerStats'
import { useGameSummaryRadar } from '../composables/useGameSummaryRadar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Info } from 'lucide-vue-next'

const { analysisTree } = useInjectedGameAnalysis()
const { chessGame } = useInjectedChessGame()
const { whiteStats, blackStats } = usePlayerStats(analysisTree)
const summaryRadar = useGameSummaryRadar(analysisTree)
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Player stats -->
    <ChessPlayerStatsPanel
      :white-username="chessGame?.white.username"
      :black-username="chessGame?.black.username"
      :white-stats="whiteStats"
      :black-stats="blackStats"
    />

    <div class="border-t border-border" />

    <!-- Game summary radar -->
    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-1.5">
        <h3 class="text-xs font-medium text-secondary uppercase tracking-wide">Positional Profile</h3>
        <TooltipProvider :delay-duration="200">
          <Tooltip>
            <TooltipTrigger as-child>
              <Info class="w-3 h-3 text-muted cursor-default" />
            </TooltipTrigger>
            <TooltipContent side="right" class="max-w-64 text-xs leading-relaxed bg-overlay text-primary border border-border shadow-md" arrow-class="bg-overlay fill-overlay">
              <p class="font-medium mb-1">How to read this chart</p>
              <p class="text-muted-foreground">Shows the <span class="text-foreground">character</span> of each player's advantages — not how well they played.</p>
              <p class="mt-1.5 text-muted-foreground">Each axis reflects how strongly that positional dimension contributed when a player was winning. The player with the stronger presence scores 1.0; the other is shown relative to that.</p>
              <p class="mt-1.5 text-muted-foreground">Positions around quiet trades are down-weighted. Strategically contested moments count more.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <ChessGameSummaryRadar
        :data="summaryRadar"
        :white-username="chessGame?.white.username"
        :black-username="chessGame?.black.username"
      />
    </div>

  </div>
</template>
