<script setup lang="ts">
import type { TabsListProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { TabsList, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<TabsListProps & { class?: HTMLAttributes['class'] }>()
const forwarded = useForwardProps(props)
</script>

<template>
  <TabsList
    data-slot="tabs-list"
    v-bind="forwarded"
    :class="cn(
      'inline-flex items-center justify-start rounded-lg bg-overlay p-0.5 gap-0.5 text-muted',
      props.class,
    )"
  >
    <slot />
  </TabsList>
</template>
