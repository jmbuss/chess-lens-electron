<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import PageHero from 'src/renderer/components/PageHero.vue'
import heroSetupUser from 'src/assets/hero-setup-user.png'
import heroSetupIntegrations from 'src/assets/hero-setup-integrations.png'

const route = useRoute()

const TOTAL_STEPS = 2

const stepMap: Record<string, { step: number; image: string; reverse: boolean }> = {
  'getting-started-step-1': { step: 1, image: heroSetupUser, reverse: true },
  'getting-started-step-2': { step: 2, image: heroSetupIntegrations, reverse: false },
}

const current = computed(() => stepMap[route.name as string] ?? { step: 1, image: heroSetupUser })
</script>

<template>
  <PageHero :current-step="current.step" :total-steps="TOTAL_STEPS" :reverse="current.reverse">
    <template #image>
      <img :src="current.image" class="w-full h-full object-cover" alt="" />
    </template>
    <template #content>
      <RouterView />
    </template>
  </PageHero>
</template>
