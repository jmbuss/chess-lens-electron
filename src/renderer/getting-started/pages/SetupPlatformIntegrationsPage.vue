<script setup>
import { Button as UIButton } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import AppAlert from 'src/renderer/components/AppAlert.vue'

import { useSetupPlatformIntegrations } from '../composables/useSetupPlatformIntegrations'

const {
  form,
  handleCreateChesscomPlatform,
  isCreatingPlatform,
  isPlatformCreated,
  isPlatformCreationError,
  platformCreationError,
} = useSetupPlatformIntegrations()
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1 class="font-display text-2xl font-semibold text-primary">Connect Your Accounts</h1>
      <p class="text-sm text-secondary mt-1">Link your chess platforms to start syncing games.</p>
    </div>
    <form class="flex flex-col gap-4">
      <Field>
        <FieldLabel>Chess.com Username</FieldLabel>
        <Input v-model="form.chesscomUsername" />
      </Field>
      <AppAlert :error="platformCreationError" />
      <UIButton @click="handleCreateChesscomPlatform" :disabled="isCreatingPlatform">
        Add Chess.com
      </UIButton>
    </form>
  </div>
</template>
