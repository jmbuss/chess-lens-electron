export {}

declare module '../../events/channels' {
  interface EventChannels {
    'pgn:mutated': {
      gameId: string
      pgn: string
      currentFen: string
    }
  }
}
