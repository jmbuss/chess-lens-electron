<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from './components/AppSidebar.vue'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { useDarkMode } from './composables/darkMode/useDarkMode'
import { useChessGamesListInvalidation } from './composables/chessGames/useChessGamesListInvalidation'

import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.brown.css'
import 'chessground/assets/chessground.cburnett.css'

onMounted(() => useDarkMode().applyClass())
useChessGamesListInvalidation()

const route = useRoute()
const layout = computed(() => route.meta.layout ?? 'app')
</script>

<template>
  <SidebarProvider v-if="layout === 'app'" class="h-full" storage-key="chess-lens-sidebar">
    <AppSidebar />
    <SidebarInset class="flex-1 overflow-auto">
      <RouterView v-slot="{ Component }">
        <Transition name="page-fade" mode="out-in">
          <component :is="Component" :key="route.path" />
        </Transition>
      </RouterView>
    </SidebarInset>
  </SidebarProvider>

  <div v-else-if="layout === 'getting-started'" class="w-full h-full">
    <RouterView v-slot="{ Component }">
      <Transition name="page-fade" mode="out-in">
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>
  </div>
</template>

<style scoped>
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 150ms ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}
</style>
