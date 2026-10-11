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

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©',
}

// "AT&amp;T", "&#39;", "&#x27;" -> the characters they stand for. One pass, so "&amp;lt;" becomes "&lt;", not "<".
export const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, c: string) => {
    if (c[0] !== '#') return NAMED[c.toLowerCase()] ?? m
    const n = c[1]?.toLowerCase() === 'x' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10)
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : m
  })

export function parse(xml: string): (Post & { body: string })[] {
  const tag = (s: string, t: string) => s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? ''
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e = '']) => ({
    id: tag(e, 'id'),
    title: decode(tag(e, 'title')),
    link: decode(e.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? ''),
    // The content is HTML written as XML text: decode it to real HTML, drop the tags, then decode the page's own entities.
    body: decode(decode(tag(e, 'content')).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 600),
  }))
}
