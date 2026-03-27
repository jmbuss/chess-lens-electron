<script setup lang="ts">
import SolidCircleIcon from 'src/renderer/components/icons/SolidCircleIcon.vue'
import { computed } from 'vue'

const props = defineProps<{
  color?: 'white' | 'black'
}>()

const whiteClass = 'text-white border border-black rounded-full'
const blackClass = 'text-black border border-white rounded-full'

const noColorClass = 'text-secondary border border-secondary rounded-full'

const colorClass = computed(() => {
  if (props.color === 'white') {
    return whiteClass
  } else if (props.color === 'black') {
    return blackClass
  } else {
    return noColorClass
  }
})
</script>

<template>
  <SolidCircleIcon class="size-3" :class="colorClass" />
</template>
