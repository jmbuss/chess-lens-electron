# Icons System

This folder contains SVG icons from [Heroicons](https://heroicons.com/) implemented as Vue components.

## Usage

### Using UIIcon Component (Recommended)

```vue
<script setup lang="ts">
import UIIcon from '@/components/UIIcon.vue'
</script>

<template>
  <!-- Default size (size-6 = 24px) -->
  <UIIcon name="arrow-left" />
  
  <!-- Different sizes -->
  <UIIcon name="arrow-left" size="size-4" />  <!-- 16px -->
  <UIIcon name="arrow-left" size="size-5" />  <!-- 20px -->
  <UIIcon name="arrow-left" size="size-6" />  <!-- 24px - default -->
  <UIIcon name="arrow-left" size="size-8" />  <!-- 32px -->
  <UIIcon name="arrow-left" size="size-10" /> <!-- 40px -->
  
  <!-- Custom styling -->
  <UIIcon name="arrow-left" class="text-blue-500 size-5" />
  
  <!-- With custom color -->
  <UIIcon name="arrow-left" class="text-red-600" />
  
  <!-- In buttons or clickable areas -->
  <button class="p-2 hover:bg-gray-100 rounded">
    <UIIcon name="arrow-left" class="text-gray-700" />
  </button>
</template>
```

### Using UIButton with Icons

The `UIButton` component supports icons with positioning:

```vue
<template>
  <div class="flex gap-4">
    <!-- Icon on the left (default) -->
    <UIButton icon="arrow-left">
      Back
    </UIButton>
    
    <!-- Icon on the right -->
    <UIButton icon="arrow-left" icon-position="right">
      Next
    </UIButton>
    
    <!-- Icon only button (no text) -->
    <UIButton icon="arrow-left" />
  </div>
</template>

<script setup lang="ts">
import UIButton from '@/components/UIButton.vue'
</script>
```

### Using Icon Components Directly

```vue
<script setup lang="ts">
import { ArrowLeftIcon } from '@/components/icons'
</script>

<template>
  <div class="flex items-center gap-2">
    <ArrowLeftIcon class="size-6 text-blue-500" />
    <span>Go Back</span>
  </div>
</template>
```

### In Navigation

```vue
<template>
  <nav class="flex items-center gap-4">
    <button @click="goBack" class="flex items-center gap-2 hover:text-blue-600">
      <UIIcon name="arrow-left" class="size-5" />
      <span>Back</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import UIIcon from '@/components/UIIcon.vue'

const goBack = () => {
  // navigation logic
}
</script>
```

## Adding New Icons

Here's the complete workflow for adding new icons from Heroicons:

1. **Visit** https://heroicons.com/
2. **Find your icon** (e.g., "home")
3. **Copy the SVG code**
4. **Create** `HomeIcon.vue` in `src/renderer/components/icons/`
5. **Paste and adjust**:

```vue
<script setup lang="ts">
defineProps<{
  class?: string
}>()
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke-width="1.5"
    stroke="currentColor"
    :class="class"
  >
    <!-- Paste path here -->
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
    />
  </svg>
</template>
```

6. **Register the icon in `index.ts`**:

```typescript
import HomeIcon from './HomeIcon.vue'

export const iconRegistry: Record<string, Component> = {
  'arrow-left': ArrowLeftIcon,
  'home': HomeIcon, // Add this line
}

export { ArrowLeftIcon, HomeIcon } // Export it
```

7. **Use it**:

```vue
<UIIcon name="home" />
```

## Tips

- **Sizing**: Use Tailwind's `size-*` utilities (size-4, size-5, size-6, size-8, etc.)
- **Colors**: Icons inherit `currentColor`, so use `text-*` classes
- **Stroke Width**: Default is 1.5, matches Heroicons outline style
- **Type Safety**: The `UIIcon` component only accepts registered icon names

## TypeScript Benefits

The icon system is fully type-safe:

```vue
<script setup lang="ts">
import UIIcon from '@/components/UIIcon.vue'

// ✅ Valid - TypeScript knows this icon exists
const validIcon = 'arrow-left'

// ❌ Error - TypeScript will catch this at compile time
const invalidIcon = 'non-existent-icon'
</script>

<template>
  <UIIcon :name="validIcon" />
  <!-- TypeScript will error on the next line -->
  <UIIcon :name="invalidIcon" />
</template>
```

## Available Icons

- `arrow-left` - Left pointing arrow
