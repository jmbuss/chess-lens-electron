import type { RouteRecordRaw } from 'vue-router'
import ProfilePage from './pages/ProfilePage.vue'

export const profileRoutes: RouteRecordRaw[] = [
  {
    path: '/profile',
    component: ProfilePage,
    meta: { breadcrumb: 'Profile' },
  },
]
