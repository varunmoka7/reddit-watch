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
const host = (on: On, o: { ids: string[]; status?: number; answer?: (n: number) => boolean; throwOn?: number }) => {
  const seen = { fetches: 0, judged: 0 }
  mock.clock(on)
  mock.store(on, { enabled: true })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }) as never)
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: undefined }) as never)
  on('http.fetch', async () => {
    seen.fetches++
    const status = o.status ?? 200
    return { value: { status, ok: status === 200, headers: {}, text: status === 200 ? feed(o.ids) : '' } }
  })
  on('model.complete', async () => {
    const n = ++seen.judged
    await new Promise(r => setTimeout(r, 5))
    if (n === o.throwOn) throw new Error('boom')
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
