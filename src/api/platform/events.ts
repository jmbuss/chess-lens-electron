import type { PlatformType } from 'src/database/platform-account'

export {}

declare module '../../events/channels' {
  interface EventChannels {
    'platform:account:created': {
      username: string
      platform: PlatformType
    }
  }
}
