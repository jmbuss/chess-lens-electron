export {}

declare module 'src/ipc/handlers' {
  export interface IpcChannels {
    'chess-games:invalidate': {
      push: Record<string, never>
    }
  }
}
