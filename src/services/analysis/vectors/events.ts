export {}

declare module '../../../events/channels' {
  interface EventChannels {
    'positions:indexed': {
      gameId: string
      positionsIndexed: number
    }
  }
}
