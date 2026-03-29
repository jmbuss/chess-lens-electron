import posthog from 'posthog-js'
import type { UserData } from 'src/database/user/types'

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com'

export function initAnalytics() {
  if (!key) return

  posthog.init(key, {
    api_host: host,
    // Electron apps don't have a meaningful URL - use app name instead
    capture_pageview: false,
    // Respect user privacy: disable session recording by default
    disable_session_recording: true,
    persistence: 'localStorage',
  })
}

export function captureEvent(event: string, properties?: Record<string, unknown>) {
  if (!key) return
  posthog.capture(event, properties)
}

/**
 * Identify the app's local user in PostHog using their email as the distinct ID.
 * Safe to call multiple times — PostHog deduplicates identify calls.
 */
export function identifyAppUser(user: Pick<UserData, 'email' | 'firstName' | 'lastName'>) {
  if (!key) return
  posthog.identify(user.email, {
    email: user.email,
    name: `${user.firstName} ${user.lastName}`.trim(),
    firstName: user.firstName,
    lastName: user.lastName,
  })
}

export function capturePageview(pageName: string) {
  if (!key) return
  posthog.capture('$pageview', { page: pageName })
}

export { posthog }
