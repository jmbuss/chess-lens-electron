declare module 'src/events/channels' {
  export interface EventChannels {
    'game:synced': {
      gameId: string
      playedAt: string
      platform: string
    }
  }
}
