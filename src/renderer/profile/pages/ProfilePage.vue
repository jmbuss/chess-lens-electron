<script setup lang="ts">
import { useUser } from 'src/renderer/composables/user/useUser'

const { user } = useUser()
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-8">
    <div>
      <h1 class="text-2xl font-semibold font-display">Profile</h1>
      <p class="text-sm text-muted mt-1">View and manage your profile information.</p>
    </div>

    <div class="space-y-4">
      <div class="rounded-lg border border-border p-6 space-y-4">
        <h2 class="text-base font-semibold">Account</h2>
        <div v-if="user" class="space-y-2">
          <p class="text-sm"><span class="text-muted">Name:</span> {{ user.firstName }} {{ user.lastName }}</p>
        </div>
        <p v-else class="text-sm text-muted">No user profile found.</p>
      </div>

      <div class="rounded-lg border border-border p-6 space-y-4">
        <h2 class="text-base font-semibold">Platform Integrations</h2>
        <p class="text-sm text-muted">Connected platforms will appear here.</p>
      </div>

      <div class="rounded-lg border border-border p-6 space-y-4">
        <h2 class="text-base font-semibold">Statistics</h2>
        <p class="text-sm text-muted">Your gameplay statistics will appear here.</p>
      </div>
    </div>
  </div>
</template>
