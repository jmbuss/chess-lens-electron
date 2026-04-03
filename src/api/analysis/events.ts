declare module 'src/events/channels' {
  export interface EventChannels {
    'pgn:mutated': {
      gameId: string
      pgn: string
      currentFen: string
    }
  }
}
