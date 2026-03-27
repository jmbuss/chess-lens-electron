<script setup lang="ts">
import { getOpeningsByEco } from '@chess-openings/eco.json'

import { ChessGame, GameResult } from 'src/database/chess/types'
import ChessPlayerIcon from 'src/renderer/components/Chess/ChessPlayerIcon.vue'
import ChessResult from 'src/renderer/components/Chess/ChessResult.vue'
import { formatDateTime, WEEKDAY_MONTH_DAY_YEAR } from 'src/renderer/utils/formatDateTime'
import { computed, toValue } from 'vue'
import { computedAsync } from '@vueuse/core'
import { useInjectedChessGame } from '../composables/provideChessGame'
import { useChessOpening } from 'src/renderer/composables/useChessOpening'

const { chessGame } = useInjectedChessGame()

const { opening } = useChessOpening({ pgn: chessGame?.value?.pgn })
</script>

<template>
  <div class="px-4 flex flex-col gap-2">
    <!-- <div>
      <p class="font-bold">{{ formatDateTime(chessGame?.startTime, WEEKDAY_MONTH_DAY_YEAR) }}</p>
    </div>

    <div class="flex gap-2 flex-wrap">
      <p class="font-bold">Time Control:</p>
      <p>
        {{ chessGame?.timeControl.base }} + {{ chessGame?.timeControl.increment }} ({{
          chessGame?.timeControl.timeClass
        }})
      </p>
    </div>

    <div>
      <p class="font-bold">{{ opening?.name }}</p>
      <p>{{ opening?.moves }}</p>
    </div> -->

    <div>
      <div class="flex items-center gap-2">
        <ChessPlayerIcon color="white" />
        <div class="flex gap-1 flex-1">
          <p class="font-bold">{{ chessGame?.white.username }}</p>
          <p>({{ chessGame?.white.rating ?? 'N/A' }})</p>
        </div>
        <ChessResult :result="chessGame?.white.result" class="w-3 text-center" />
      </div>
      <div class="flex items-center gap-2">
        <ChessPlayerIcon color="black" />
        <div class="flex gap-1 flex-1">
          <p class="font-bold">{{ chessGame?.black.username }}</p>
          <p>({{ chessGame?.black.rating ?? 'N/A' }})</p>
        </div>
        <ChessResult :result="chessGame?.black.result" class="w-3 text-center" />
      </div>
    </div>
  </div>
</template>
