<script setup lang="ts">
import { computed } from 'vue'
import { iconRegistry, type IconName } from './icons'

const props = defineProps<{
  name: IconName
  size?: string | number
  class?: string
}>()

const IconComponent = computed(() => iconRegistry[props.name])

const sizeClass = computed(() => {
  if (!props.size) return 'size-6'
  const n = Number(props.size)
  if (!isNaN(n)) return `size-${n}`
  return props.size
})
</script>

<template>
  <component :is="IconComponent" :class="[sizeClass, props.class]" />
</template>
