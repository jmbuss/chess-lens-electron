# Vue Component Structure Guidelines

## Component Structure Order

All Vue components must follow this strict order:

1. **`<script>`** - Script section (top)
2. **`<template>`** - Template section (middle)
3. **`<style>`** - Style section (bottom)

## Example Structure

```vue
<script setup lang="ts">
// Component logic, imports, and setup code
</script>

<template>
  <!-- Template markup -->
</template>

<style scoped>
/* Component styles */
</style>
```

## Auto-complete Guidelines

When generating or suggesting Vue components, always follow this structure:
- Script section comes first
- Template section comes second
- Style section comes last

This ensures consistency across all components in the codebase.
