<script setup lang="ts">
import { toRef, watchEffect } from 'vue'
import { useChessOpening } from 'src/renderer/composables/useChessOpening'

const props = defineProps<{
  ecoCode?: string | null
  pgn?: string | null
}>()

const ecoCodeRef = toRef(() => props.ecoCode ?? '')
const pgnRef = toRef(() => props.pgn ?? '')
const { opening } = useChessOpening({ ecoCode: ecoCodeRef, pgn: pgnRef })
</script>

<template>
  <div v-if="opening" class="flex flex-col min-w-64">
    <!-- <div class="text-xs text-gray-500">{{ opening.eco }}</div> -->
    <div class="text-xs">{{ opening.name }}</div>
    <div class="text-xs text-muted">{{ opening.moves }}</div>
  </div>
  <span v-else>-</span>
</template>
