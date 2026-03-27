<script setup lang="ts">
import { Card as UICard } from '@/components/ui/card'

withDefaults(
  defineProps<{
    reverse?: boolean
    currentStep?: number
    totalSteps?: number
  }>(),
  {
    reverse: false,
  }
)
</script>

<template>
  <div class="w-full h-full flex" :class="{ 'flex-row-reverse': reverse }">
    <!-- Image panel -->
    <div class="flex-1 relative overflow-hidden">
      <slot name="image" />
    </div>

    <!-- Content panel -->
    <div class="flex-1 flex flex-col items-center justify-center gap-6 p-12 bg-base">
      <!-- Card -->
      <UICard class="w-full max-w-sm p-8">
        <slot name="content" />
      </UICard>

      <!-- Step indicator -->
      <div
        v-if="currentStep !== undefined && totalSteps !== undefined"
        class="flex flex-col items-center gap-2"
      >
        <div class="flex items-center gap-2">
          <div
            v-for="n in totalSteps"
            :key="n"
            class="w-2.5 h-2.5 rounded-full transition-colors duration-200"
            :class="
              n === currentStep
                ? 'bg-accent'
                : n < currentStep
                  ? 'bg-accent/40'
                  : 'bg-border'
            "
          />
        </div>
        <p class="text-xs text-muted font-medium tracking-wide uppercase">
          Step {{ currentStep }} of {{ totalSteps }}
        </p>
      </div>
    </div>
  </div>
</template>
