<script setup lang="ts">
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
</script>

<template>
  <div class="analysis-dashboard-root">
    <div class="dashboard-top">
      <slot name="topBar" />
    </div>

    <ResizablePanelGroup direction="horizontal" class="dashboard-main">
      <ResizablePanel :default-size="15" :min-size="12" collapsible :collapsed-size="0">
        <div class="panel-content border-t border-border">
          <slot name="left" />
        </div>
      </ResizablePanel>

      <ResizableHandle with-handle />

      <ResizablePanel :default-size="50" :min-size="25">
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel :default-size="75" :min-size="25" collapsible :collapsed-size="0">
            <div class="panel-content border-t border-border">
              <slot name="centerTop" />
            </div>
          </ResizablePanel>

          <ResizableHandle with-handle />

          <ResizablePanel :default-size="35" :min-size="15" collapsible :collapsed-size="0">
            <div class="panel-content">
              <slot name="centerBottom" />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>

      <ResizableHandle with-handle />

      <ResizablePanel :default-size="25" :min-size="12" collapsible :collapsed-size="0">
        <div class="panel-content border-t border-border">
          <slot name="right" />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
</template>

<style scoped>
.analysis-dashboard-root {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: max-content minmax(0, 1fr);
  gap: calc(var(--spacing) * 3);
}

.dashboard-main {
  min-height: 0;
}

.panel-content {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
