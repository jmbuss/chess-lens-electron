import type { RouteRecordRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    layout?: 'app' | 'getting-started'
  }
}
import GettingStartedLayout from './pages/GettingStartedLayout.vue'
import SetupUserPage from './pages/SetupUserPage.vue'
import SetupPlatformIntegrationsPage from './pages/SetupPlatformIntegrationsPage.vue'
import { prefetchSingleAppUser } from '../composables/user/useUser'
import { prefetchPlatforms } from '../composables/platforms/usePlatforms'
import { identifyAppUser } from 'src/services/analytics'

/**
 * Getting Started routes configuration
 */
export const gettingStartedRoutes: RouteRecordRaw[] = [
  {
    path: '/getting-started',
    component: GettingStartedLayout,
    meta: { layout: 'getting-started' },
    children: [
      {
        path: 'setup-user',
        name: 'getting-started-step-1',
        component: SetupUserPage,
      },
      {
        path: 'setup-platform-integrations',
        name: 'getting-started-step-2',
        component: SetupPlatformIntegrationsPage,
      },
    ],
  },
]

/**
 * Navigation guard for getting-started routes
 * Allows navigation within the getting-started flow
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const gettingStartedGuard = async (to: any, from: any, next: any) => {
  console.log('gettingStartedGuard', to, from)
  // Allow all navigation within getting-started flow and dev-only routes
  if (to.path.startsWith('/getting-started') || to.path.startsWith('/design-system')) {
    next()
    return true
  }
  const user = await prefetchSingleAppUser()
  if (!user) {
    next('/getting-started/setup-user')
    return true
  }

  identifyAppUser(user)

  const platforms = await prefetchPlatforms(user.id)
  if (platforms.length === 0) {
    next('/getting-started/setup-platform-integrations')
    return true
  }

  return false
}
