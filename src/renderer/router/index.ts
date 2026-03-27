import { createMemoryHistory, createRouter } from 'vue-router'

import { homeRoutes } from '../home/router'
import { gettingStartedGuard, gettingStartedRoutes } from '../getting-started/router'
import { analysisRoutes } from '../analysis/router'
import { designSystemRoutes } from '../design-system/router'
import { settingsRoutes } from '../settings/router'
import { profileRoutes } from '../profile/router'

const routes = [...homeRoutes, ...gettingStartedRoutes, ...analysisRoutes, ...designSystemRoutes, ...settingsRoutes, ...profileRoutes]

const router = createRouter({
  history: createMemoryHistory(),
  routes,
})

router.beforeEach(async (to, from, next) => {
  if (await gettingStartedGuard(to, from, next)) {
    return
  }

  next()
})

export default router
