<script setup lang="ts">
import { useInjectedChessGame } from '../composables/provideChessGame'
import { useInjectedGameAnalysis } from '../composables/provideGameAnalysis'
import ChessGameSummaryRadar from './ChessGameSummaryRadar.vue'
import ChessPlayerStatsPanel from './ChessPlayerStatsPanel.vue'
import { usePlayerStats } from '../composables/usePlayerStats'
import { useGameSummaryRadar } from '../composables/useGameSummaryRadar'

const { analysisByFen } = useInjectedGameAnalysis()
const { chessGame } = useInjectedChessGame()
const { whiteStats, blackStats } = usePlayerStats(analysisByFen)
const summaryRadar = useGameSummaryRadar(analysisByFen)
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
      <h3 class="text-xs font-medium text-secondary uppercase tracking-wide">Positional Profile</h3>
      <ChessGameSummaryRadar
        :data="summaryRadar"
        :white-username="chessGame?.white.username"
        :black-username="chessGame?.black.username"
      />
    </div>

  </div>
</template>
