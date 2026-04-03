export {}

declare module '../../events/channels' {
  interface EventChannels {
    'game:queue:updated': {
      reason: 'new_items' | 'priority_changed'
    }
    'position:queue:updated': {
      reason: 'new_items' | 'priority_changed'
    }
    'game:analysis:complete': {
      gameId: string
    }
  }
}
