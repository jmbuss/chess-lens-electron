<script setup lang="ts">
import { Loader2, CheckCircle2, Circle } from 'lucide-vue-next'

defineProps<{
  status: 'UNANALYZED' | 'ANALYZING' | 'COMPLETE' | null
}>()
</script>

<template>
  <div class="flex items-center gap-1.5 text-xs whitespace-nowrap">
    <template v-if="status === 'COMPLETE'">
      <CheckCircle2 class="size-3.5 text-green-500" />
      <span class="text-green-500">Complete</span>
    </template>
    <template v-else-if="status === 'ANALYZING'">
      <Loader2 class="size-3.5 text-yellow-500 animate-spin" />
      <span class="text-yellow-500">Analyzing</span>
    </template>
    <template v-else>
      <Circle class="size-3.5 text-muted-foreground" />
      <span class="text-muted-foreground">Not Analyzed</span>
    </template>
  </div>
</template>
