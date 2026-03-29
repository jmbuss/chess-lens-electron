<script setup lang="ts">
import { computed } from 'vue'
import { Home, Palette, RefreshCw, Settings, User, HelpCircle, ChevronRight } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { useUser } from 'src/renderer/composables/user/useUser'
import { useDarkMode } from 'src/renderer/composables/darkMode/useDarkMode'
import { useSyncGames } from 'src/renderer/composables/syncGames/useSyncGames'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'

const route = useRoute()
const router = useRouter()
const { user } = useUser()
const { isDark, toggle: toggleDarkMode } = useDarkMode()
const { startSync, isLoading: isSyncing } = useSyncGames()

const navItems = [
  { title: 'Games', path: '/', icon: Home },
  { title: 'Design System', path: '/design-system', icon: Palette },
]

const faqItems = [
  { title: 'Move Classifications', path: '/faq/nag-classification' },
  { title: 'Accuracy', path: '/faq/accuracy' },
  { title: 'Positional Features', path: '/faq/positional-features' },
]

const isFaqActive = computed(() => route.path.startsWith('/faq'))

</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <div class="flex items-center justify-center group-data-[state=expanded]:justify-end px-1">
        <SidebarTrigger class="text-sidebar-foreground/60 hover:text-sidebar-foreground" />
      </div>

      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child>
            <Button variant="ghost" class="justify-start" @click="router.replace('/')">
              <div class="flex aspect-square size-8 items-center justify-center text-primary">
                ♞
              </div>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-semibold font-display">Chess Lens</span>
              </div>
            </Button>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Navigation</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in navItems" :key="item.path">
              <SidebarMenuButton
                :is-active="route.path === item.path || route.path.startsWith(item.path + '/')"
                :tooltip="item.title"
                as-child
              >
                <Button variant="ghost" class="justify-start" @click="router.replace(item.path)">
                  <component :is="item.icon" />
                  <span>{{ item.title }}</span>
                </Button>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>Help</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <Collapsible v-slot="{ open }" :default-open="isFaqActive" as-child>
              <SidebarMenuItem>
                <CollapsibleTrigger as-child>
                  <SidebarMenuButton :is-active="isFaqActive" tooltip="FAQ">
                    <HelpCircle />
                    <span>FAQ</span>
                    <ChevronRight
                      class="ml-auto size-4 transition-transform duration-200"
                      :class="open && 'rotate-90'"
                    />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem v-for="item in faqItems" :key="item.path">
                      <SidebarMenuSubButton
                        :is-active="route.path === item.path"
                        as-child
                      >
                        <Button variant="ghost" class="justify-start" @click="router.replace(item.path)">
                          <span>{{ item.title }}</span>
                        </Button>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <SidebarFooter>
      <SidebarSeparator />
      <SidebarMenu class="p-2">
        <SidebarMenuItem>
          <SidebarMenuButton tooltip="Sync" as-child>
            <Button variant="ghost" class="w-full justify-start" :disabled="isSyncing" @click="startSync">
              <RefreshCw :class="['size-4', isSyncing && 'animate-spin']" />
              <span>Sync</span>
            </Button>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton :tooltip="isDark ? 'Light Mode' : 'Dark Mode'" as-child>
            <Button variant="ghost" class="w-full justify-start" @click="toggleDarkMode">
              <span class="size-4 flex items-center justify-center text-base leading-none">{{ isDark ? '☀️' : '🌙' }}</span>
              <span>{{ isDark ? 'Light Mode' : 'Dark Mode' }}</span>
            </Button>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton :is-active="route.path === '/settings'" tooltip="Settings" as-child>
            <Button variant="ghost" class="w-full justify-start" @click="router.replace('/settings')">
              <Settings class="size-4" />
              <span>Settings</span>
            </Button>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem v-if="user">
          <SidebarMenuButton
            :is-active="route.path === '/profile'"
            :tooltip="`${user.firstName} ${user.lastName}`"
            as-child
          >
            <Button variant="ghost" class="w-full justify-start" @click="router.replace('/profile')">
              <User class="size-4" />
              <span>{{ user.firstName }} {{ user.lastName }}</span>
            </Button>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  </Sidebar>
</template>
