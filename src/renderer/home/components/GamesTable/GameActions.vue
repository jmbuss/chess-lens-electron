<script setup lang="ts">
import type { ChessGameWithMeta } from 'src/database/chess/types'
import { RouterLink } from 'vue-router'
import { ExternalLink, Play, Eye, RefreshCw, DatabaseZap } from 'lucide-vue-next'
import { ref } from 'vue'
import Button from '@/components/ui/button/Button.vue'
import { ipcService } from 'src/ipc/renderer'
import { queryClient } from 'src/renderer/query/queryClient'
import { analysisRoute } from 'src/renderer/utils/analysisRoute'

const props = defineProps<{
  game: ChessGameWithMeta
}>()

const isReanalyzing = ref(false)
const isReindexing = ref(false)

function openUrl() {
  if (props.game.url) {
    window.open(props.game.url, '_blank')
  }
}

async function handleReanalyze() {
  if (isReanalyzing.value) return
  isReanalyzing.value = true
  try {
    const res = await ipcService.send('game:reanalyze', { gameId: props.game.id })
    if (res.success) {
      queryClient.invalidateQueries({ queryKey: ['chess-games'] })
    }
  } finally {
    isReanalyzing.value = false
  }
}

async function handleReindex() {
  if (isReindexing.value) return
  isReindexing.value = true
  try {
    await ipcService.send('positions:reindexGame', { gameId: props.game.id })
    queryClient.invalidateQueries({ queryKey: ['position-index'] })
  } finally {
    isReindexing.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-1">
    <RouterLink :to="analysisRoute(game.id, game.fen)">
      <Button variant="ghost" size="icon" class="size-7" title="Open analysis">
        <Eye v-if="game.analysisStatus === 'COMPLETE'" class="size-3.5" />
        <Play v-else class="size-3.5" />
      </Button>
    </RouterLink>
    <Button
      variant="ghost"
      size="icon"
      class="size-7"
      title="Re-analyze game"
      :disabled="isReanalyzing"
      @click="handleReanalyze"
    >
      <RefreshCw class="size-3.5" :class="{ 'animate-spin': isReanalyzing }" />
    </Button>
    <Button
      v-if="game.analysisStatus === 'COMPLETE'"
      variant="ghost"
      size="icon"
      class="size-7"
      title="Re-index positions"
      :disabled="isReindexing"
      @click="handleReindex"
    >
      <DatabaseZap class="size-3.5" :class="{ 'animate-pulse': isReindexing }" />
    </Button>
    <Button
      v-if="game.url"
      variant="ghost"
      size="icon"
      class="size-7"
      title="Open on platform"
      @click="openUrl"
    >
      <ExternalLink class="size-3.5" />
    </Button>
  </div>
</template>
