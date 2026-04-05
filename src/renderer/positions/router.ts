import type { RouteRecordRaw } from 'vue-router'
import PositionsPage from './pages/PositionsPage.vue'

export const positionsRoutes: RouteRecordRaw[] = [
  {
    path: '/positions',
    component: PositionsPage,
  },
]
