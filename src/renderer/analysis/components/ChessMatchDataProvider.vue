<script setup lang="ts">
import { provideChessGame } from '../composables/provideChessGame'

const props = defineProps<{
  gameId: string
}>()

provideChessGame({ gameId: props.gameId })
</script>

<template>
  <slot />
</template>
