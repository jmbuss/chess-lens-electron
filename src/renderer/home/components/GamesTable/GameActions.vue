<script setup lang="ts">
import type { ChessGameWithMeta } from 'src/database/chess/types'
import { RouterLink } from 'vue-router'
import { ExternalLink, Play, Eye, RefreshCw } from 'lucide-vue-next'
import { ref } from 'vue'
import Button from '@/components/ui/button/Button.vue'
import { ipcService } from 'src/ipc/renderer'
import { queryClient } from 'src/renderer/query/queryClient'

const props = defineProps<{
  game: ChessGameWithMeta
}>()

const isReanalyzing = ref(false)

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
</script>

<template>
  <div class="flex items-center gap-1">
    <RouterLink :to="`/analysis/${game.id}`">
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
