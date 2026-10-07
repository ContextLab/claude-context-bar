export type Category = { name: string; tokens: number; color: string }

/** What the context window holds now: the values the bar settles on. */
export type Snapshot = {
  categories: Category[]
  used: number
  max: number
  free: number
  /** Tokens held back for autocompaction; 0 when it is off. */
  buffer: number
  isLight: boolean
}

/**
 * What the bar draws this frame, on its way to the snapshot. `dim` runs from 0
 * to 1 as the messages darken for a compaction.
 */
export type Frame = { tokens: Record<string, number>; used: number; dim: number }

declare module 'claude-code' {
  interface PluginState {
    'context-bar': { isShown: boolean; snapshot: Snapshot | null; frame: Frame | null }
  }
}
