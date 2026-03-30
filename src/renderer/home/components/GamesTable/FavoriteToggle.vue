<script setup lang="ts">
import { Star } from 'lucide-vue-next'

defineProps<{
  isFavorite: boolean
}>()

defineEmits<{
  toggle: []
}>()
</script>

<template>
  <button
    class="inline-flex items-center justify-center size-6 rounded hover:bg-primary/10 transition-colors"
    @click.stop="$emit('toggle')"
  >
    <Star
      class="size-4"
      :class="isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'"
    />
  </button>
</template>
