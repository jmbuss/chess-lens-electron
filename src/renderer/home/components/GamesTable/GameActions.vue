<script setup lang="ts">
import type { ChessGameWithMeta } from 'src/database/chess/types'
import { RouterLink } from 'vue-router'
import { ExternalLink, Play, Eye } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'

const props = defineProps<{
  game: ChessGameWithMeta
}>()

function openUrl() {
  if (props.game.url) {
    window.open(props.game.url, '_blank')
  }
}
</script>

<template>
  <div class="flex items-center gap-1">
    <RouterLink :to="`/analysis/${game.id}`">
      <Button variant="ghost" size="icon" class="size-7">
        <Eye v-if="game.analysisStatus === 'COMPLETE'" class="size-3.5" />
        <Play v-else class="size-3.5" />
      </Button>
    </RouterLink>
    <Button
      v-if="game.url"
      variant="ghost"
      size="icon"
      class="size-7"
      @click="openUrl"
    >
      <ExternalLink class="size-3.5" />
    </Button>
  </div>
</template>
