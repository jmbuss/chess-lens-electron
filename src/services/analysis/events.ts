export {}

declare module '../../events/channels' {
  interface EventChannels {
    'game:queue:updated': {
      reason: 'new_items' | 'priority_changed'
      /** Set when a specific game was bumped to high priority (analyze / user prioritize). */
      gameId?: string
    }
    'position:queue:updated': {
      reason: 'new_items' | 'priority_changed'
    }
    'game:analysis:complete': {
      gameId: string
    }
  }
}
