<script setup lang="ts">
import ChessEvalBar from './ChessEvalBar.vue'
</script>

<template>
  <div class="metric-bars-container">
    <ChessEvalBar class="metric-bar" />
  </div>
</template>

<style scoped>
.metric-bars-container {
  display: flex;
  flex-direction: row;
  gap: calc(var(--spacing) * 1.5);
  height: 100%;
  width: max-content;
}

.metric-bar {
  flex: 0 0 18px;
  width: 18px;
}
</style>
