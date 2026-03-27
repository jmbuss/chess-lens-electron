import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router'

import AnalysisLayout from './pages/AnalysisLayout.vue'
import AnalysisPage from './pages/AnalysisPage.vue'

export const analysisRoutes: RouteRecordRaw[] = [
  {
    path: '/analysis',
    component: AnalysisLayout,
    meta: { breadcrumb: 'Analysis', linkable: false },
    children: [
      {
        path: ':gameId',
        component: AnalysisPage,
        meta: {
          breadcrumb: (route: RouteLocationNormalized) => `Game ${route.params.gameId as string}`,
        },
      },
    ],
  },
]
