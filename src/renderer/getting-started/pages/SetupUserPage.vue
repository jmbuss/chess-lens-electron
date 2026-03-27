<script setup lang="ts">
import { Button as UIButton } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import AppAlert from 'src/renderer/components/AppAlert.vue'
import { useSetupUserForm } from '../composables/useSetupUserForm'

const { form, handleCreateUser, isCreatingUser, userCreationError } = useSetupUserForm()
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1 class="font-display text-2xl font-semibold text-primary">Welcome to Chess Lens</h1>
      <p class="text-sm text-secondary mt-1">Let's set up your profile to get started.</p>
    </div>
    <form class="flex flex-col gap-4">
      <Field>
        <FieldLabel>First Name</FieldLabel>
        <Input v-model="form.firstName" />
      </Field>
      <Field>
        <FieldLabel>Last Name</FieldLabel>
        <Input v-model="form.lastName" />
      </Field>
      <Field>
        <FieldLabel>Email</FieldLabel>
        <Input v-model="form.email" />
      </Field>

      <AppAlert :error="userCreationError" />

      <UIButton @click="handleCreateUser" :disabled="isCreatingUser">Create Profile</UIButton>
    </form>
  </div>
</template>
