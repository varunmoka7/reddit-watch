export type RedditHit = { id: string; sub: string; title: string; link: string; reason: string }

declare module 'claude-code' {
  interface PluginState {
    'reddit-watch': { hits: RedditHit[] }
  }
}
