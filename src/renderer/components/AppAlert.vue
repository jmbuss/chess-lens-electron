<script setup lang="ts">
import { computed } from 'vue'
import { AlertCircle } from 'lucide-vue-next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

const props = defineProps<{
  error: Error | string | null | undefined
}>()

const errorMessage = computed(() => {
  if (props.error == null) return null
  if (typeof props.error === 'string') return props.error
  return props.error.message
})
</script>

<template>
  <Alert v-if="errorMessage != null" variant="destructive">
    <AlertCircle class="size-4" />
    <AlertTitle>Error</AlertTitle>
    <AlertDescription>{{ errorMessage }}</AlertDescription>
  </Alert>
</template>
