export type Segment = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer'
}

export type Snapshot = { segments: Segment[]; used: number; max: number }

declare module 'claude-code' {
  interface PluginState {
    'context-bar': { isShown: boolean; snapshot: Snapshot | null }
  }
}
