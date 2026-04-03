export {}

declare module '../../events/channels' {
  interface EventChannels {
    'game:synced': {
      gameId: string
      playedAt: string
      platform: string
    }
  }
}
