import { test, expect } from 'claude-code/testing'
import { feedUrl, isYes, parse, parseSub, reasonOf } from './lib'

test('parse atom entries', () => {
  const x = `<feed><entry><id>t3_a</id><title>I built a hooks manager &amp; more</title><link href="https://r/a"/><content type="html">&lt;p&gt;hi&lt;/p&gt;</content></entry>
  <entry><id>t3_b</id><title>My recipe app</title><link href="https://r/b"/><content type="html">pasta</content></entry></feed>`
  const posts = parse(x)
  expect(posts.map(p => p.id)).toEqual(['t3_a', 't3_b'])
  expect(posts[0]?.title).toBe('I built a hooks manager & more')
})

test('verdict reading', () => {
  expect(isYes('Yes')).toBe(true)
  expect(isYes(' yes.')).toBe(true)
  expect(isYes('No')).toBe(false)
  expect(isYes('')).toBe(false)
  expect(reasonOf('Yes: persists memory across sessions')).toBe('persists memory across sessions')
  expect(reasonOf('yes')).toBe('')
})

test('subreddit args and feed urls', () => {
  expect(parseSub('r/ClaudeAI Built with Claude')).toEqual({ sub: 'ClaudeAI', flair: 'Built with Claude' })
  expect(parseSub('/r/LocalLLaMA')).toEqual({ sub: 'LocalLLaMA' })
  expect(parseSub('x/../etc')).toBeNull()
  expect(parseSub('')).toBeNull()
  expect(feedUrl({ sub: 'LocalLLaMA' })).toBe('https://www.reddit.com/r/LocalLLaMA/new.rss?limit=50')
  expect(feedUrl({ sub: 'a1', flair: 'Built with Claude' })).toContain('flair_name%3A%22Built%20with%20Claude%22')
})

import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const feed = (ids: string[]) =>
  `<feed>${ids.map(i => `<entry><id>${i}</id><title>${i}</title><link href="https://r/${i}"/><content>x</content></entry>`).join('')}</feed>`

// Stands for Reddit and the model: `status` and `answer` decide each reply; counts what was asked.
const host = (
  on: On,
  o: { ids: string[]; status?: number; answer?: (n: number) => boolean; throwOn?: number; throwFor?: string; delay?: number; store?: Record<string, unknown>; openFails?: boolean; getFails?: string },
) => {
  const seen = { fetches: 0, judged: 0, opens: 0, toasts: [] as string[], state: {} as Record<string, unknown>, store: {} as Record<string, unknown> }
  const saved = { ...{ enabled: true }, ...o.store }
  mock.clock(on)
  on('store.get', (_, e) => {
    if (o.getFails === e.key) throw new Error('disk gone')
    return { value: saved[e.key] } as never
  })
  on('store.set', (_, e) => {
    saved[e.key] = e.value
    return { value: undefined } as never
  })
  seen.store = saved
  on('state.get', (_, e) => ({ value: { value: seen.state[e.key], version: 1 } }) as never)
  on('state.set', (_, e) => {
    seen.state[e.key] = e.value
    return { value: { isSet: true, version: 1 } } as never
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }) as never)
  on('ui.toast', (_, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.open', () => {
    seen.opens++
    if (o.openFails) throw new Error('no pane')
    return { value: undefined } as never
  })
  on('http.fetch', async () => {
    seen.fetches++
    const status = o.status ?? 200
    return { value: { status, ok: status === 200, headers: {}, text: status === 200 ? feed(o.ids) : '' } }
  })
  on('model.complete', async (_, e) => {
    const n = ++seen.judged
    await new Promise(r => setTimeout(r, o.delay ?? 5))
    if (n === o.throwOn || (o.throwFor && e.prompt.includes(o.throwFor))) throw new Error('boom')
    return o.answer?.(n) === false
      ? ({ value: { isAnswered: false, reason: 'api-error', usage: {} } } as never)
      : ({ value: { isAnswered: true, text: 'yes: a thing', usage: { input_tokens: 10, output_tokens: 2 } } } as never)
  })
  return seen
}
const reddit = ($: any, args: string) =>
  $.command.run({ command: 'reddit', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

test('a scan and the poll at the same time judge each post once', async ($, on) => {
  const seen = host(on, { ids: ['t3_a', 't3_b'] })
  await $.session.start(START) // starts the poll, because the watch is on
  await Promise.all([reddit($, 'scan'), reddit($, 'scan')])
  expect(seen.judged).toBe(2)
  expect(seen.fetches).toBe(1)
})

test('a 429 is reported plainly and judges nothing', async ($, on) => {
  const seen = host(on, { ids: ['t3_a'], status: 429 })
  const out = await reddit($, 'scan')
  expect(out.text).toContain('429')
  expect(out.text).toContain('retry')
  expect(seen.judged).toBe(0)
})

test('a post the model never answers is given up on after three tries', async ($, on) => {
  const seen = host(on, { ids: ['t3_a'], answer: () => false })
  for (let i = 0; i < 5; i++) await reddit($, 'scan')
  expect(seen.judged).toBe(3)
})

test('a failure partway keeps the posts already judged', async ($, on) => {
  const seen = host(on, { ids: ['t3_a', 't3_b'], throwOn: 2 })
  const first = await reddit($, 'scan')
  expect(first.text).toContain('r/ClaudeCode:')
  const judgedBefore = seen.judged
  await reddit($, 'scan')
  expect(seen.judged - judgedBefore).toBe(1) // only the post that failed is judged again
})

const until = async (f: () => boolean) => {
  for (let i = 0; i < 500 && !f(); i++) await new Promise(r => setTimeout(r, 1))
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

test('/reddit off stops a running scan', async ($, on) => {
  const seen = host(on, { ids: ['t3_a', 't3_b', 't3_c'], delay: 30 })
  const scan = reddit($, 'scan')
  await until(() => seen.judged === 1)
  await reddit($, 'off')
  const out = await scan
  expect(seen.judged).toBe(1)
  expect(out.text).toContain('stopped')
})

test('/reddit clear during a scan is not undone by it', async ($, on) => {
  const seen = host(on, { ids: ['t3_a', 't3_b'], delay: 30 })
  const scan = reddit($, 'scan')
  await until(() => seen.judged === 1)
  await reddit($, 'clear')
  await scan
  expect(seen.store.hits).toEqual([])
})

test('/reddit reset during a scan really judges everything again', async ($, on) => {
  const seen = host(on, { ids: ['t3_a', 't3_b'], delay: 30 })
  const scan = reddit($, 'scan')
  await until(() => seen.judged === 1)
  const reset = reddit($, 'reset')
  await Promise.all([scan, reset])
  expect(seen.judged).toBe(3) // one before the reset, then both again
  expect((seen.store.hits as unknown[]).length).toBe(2)
})

test('saved hits come back after /clear, /resume and /branch', async ($, on) => {
  const hit = { id: 't3_a', sub: 'ClaudeCode', title: 'a', link: 'https://r/a', reason: 'x' }
  const seen = host(on, { ids: [], store: { enabled: false, hits: [hit] } })
  on('classic.SessionStart', () => ({}))
  await $.session.start(START)
  for (const source of ['clear', 'resume', 'fork'] as const) {
    seen.state.hits = [] // what Claude does to the pane's list on these
    await $.classic.SessionStart({ source })
    expect(seen.state.hits).toEqual([hit])
  }
})

test('a startup poll that cannot read its settings tells the user', async ($, on) => {
  const seen = host(on, { ids: ['t3_a'], getFails: 'enabled' })
  await $.session.start(START)
  await wait(30)
  expect(seen.toasts.join()).toContain('Reddit watch failed')
})

test('a pane that cannot open tells the user', async ($, on) => {
  const seen = host(on, { ids: ['t3_a'], openFails: true })
  await $.session.start(START)
  await wait(60)
  expect(seen.toasts.join()).toContain('Reddit watch failed')
})

test('an error found by the automatic poll reaches the user', async ($, on) => {
  const seen = host(on, { ids: ['t3_a'], status: 429 })
  await $.session.start(START)
  await wait(30)
  expect(seen.toasts.join()).toContain('429')
})

test('a model error counts toward the three tries and the rest of the feed is still read', async ($, on) => {
  const seen = host(on, { ids: ['t3_a', 't3_b'], throwFor: 'Title: t3_a' })
  for (let i = 0; i < 5; i++) await reddit($, 'scan')
  expect(seen.judged).toBe(4) // a three times, b once
  expect((seen.store.hits as { id: string }[]).map(h => h.id)).toEqual(['t3_b'])
})

test('abandoned posts leave the failure record, and the record has a size cap', async ($, on) => {
  const seen = host(on, { ids: ['t3_a'], answer: () => false })
  for (let i = 0; i < 3; i++) await reddit($, 'scan')
  expect(seen.store.fails).toEqual({})
})

test('the failure record stays small however many posts fail', async ($, on) => {
  const ids = Array.from({ length: 300 }, (_, i) => `t3_${i}`)
  const seen = host(on, { ids, answer: () => false, delay: 0 })
  await reddit($, 'scan')
  expect(Object.keys(seen.store.fails as object).length).toBeLessThanOrEqual(200)
})

test('character references in titles and bodies are decoded', () => {
  const x = `<feed><entry><id>t3_a</id><title>A &lt; B &#8212; &#x41; &amp;amp; &apos;q&apos;</title><link href="https://r/a?x=1&amp;y=2"/><content type="html">&lt;p&gt;AT&amp;amp;T &amp;#39;ok&amp;#39; &amp;lt;3&lt;/p&gt;</content></entry></feed>`
  const [p] = parse(x)
  expect(p?.title).toBe("A < B \u2014 A &amp; 'q'")
  expect(p?.link).toBe('https://r/a?x=1&y=2')
  expect(p?.body).toBe("AT&T 'ok' <3")
})
