import type { RouteRecordRaw } from 'vue-router'
import DesignSystemPage from './pages/DesignSystemPage.vue'

export const designSystemRoutes: RouteRecordRaw[] = [
  {
    path: '/design-system',
    component: DesignSystemPage,
    meta: { breadcrumb: 'Design System' },
  },
]
