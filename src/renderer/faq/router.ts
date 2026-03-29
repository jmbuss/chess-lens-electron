import type { RouteRecordRaw } from 'vue-router'
import NagClassificationPage from './pages/NagClassificationPage.vue'
import AccuracyPage from './pages/AccuracyPage.vue'
import PositionalFeaturesPage from './pages/PositionalFeaturesPage.vue'

export const faqRoutes: RouteRecordRaw[] = [
  {
    path: '/faq/nag-classification',
    component: NagClassificationPage,
    meta: { breadcrumb: 'Move Classifications' },
  },
  {
    path: '/faq/accuracy',
    component: AccuracyPage,
    meta: { breadcrumb: 'Accuracy' },
  },
  {
    path: '/faq/positional-features',
    component: PositionalFeaturesPage,
    meta: { breadcrumb: 'Positional Features' },
  },
]
