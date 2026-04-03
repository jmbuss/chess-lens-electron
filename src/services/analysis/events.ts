declare module 'src/events/channels' {
  export interface EventChannels {
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
