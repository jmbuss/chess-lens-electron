<script setup lang="ts">
import { Button as UIButton } from '@/components/ui/button'
import { RouterView, useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const gameId = route.params.gameId
</script>

<template>
  <div class="flex flex-col h-full w-full">
    <RouterView />
  </div>
</template>
