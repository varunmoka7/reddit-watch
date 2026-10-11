export type Sub = { sub: string; flair?: string }
export type Post = { id: string; title: string; link: string }

// Reddit's JSON endpoint 403s non-browser clients; the Atom feed is open (no scores).
export const feedUrl = ({ sub, flair }: Sub) =>
  flair
    ? `https://www.reddit.com/r/${sub}/search.rss?q=${encodeURIComponent(`flair_name:"${flair}"`)}&restrict_sr=1&sort=new&limit=50`
    : `https://www.reddit.com/r/${sub}/new.rss?limit=50`

export const isYes = (reply: string) => /^\s*yes/i.test(reply)

// "Yes: persists memory across sessions" -> "persists memory across sessions"
export const reasonOf = (reply: string) => reply.replace(/^\s*yes\W*/i, '').trim().slice(0, 100)

// "add r/ClaudeAI Built with Claude" -> { sub: 'ClaudeAI', flair: 'Built with Claude' }; null when the name is not a subreddit
export function parseSub(args: string): Sub | null {
  const [name = '', ...flair] = args.trim().split(/\s+/)
  const sub = name.replace(/^\/?r\//i, '')
  return /^[A-Za-z0-9_]{2,21}$/.test(sub) ? { sub, ...(flair.length && { flair: flair.join(' ') }) } : null
}

export function parse(xml: string): (Post & { body: string })[] {
  const tag = (s: string, t: string) => s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? ''
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e = '']) => ({
    id: tag(e, 'id'),
    title: tag(e, 'title').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
    link: e.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? '',
    body: tag(e, 'content').replace(/&lt;[^]*?&gt;/g, ' ').replace(/\s+/g, ' ').slice(0, 600),
  }))
}
