import type { RouteRecordRaw } from 'vue-router'
import SettingsPage from './pages/SettingsPage.vue'

export const settingsRoutes: RouteRecordRaw[] = [
  {
    path: '/settings',
    component: SettingsPage,
    meta: { breadcrumb: 'Settings' },
  },
]
