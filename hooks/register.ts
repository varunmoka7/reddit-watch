import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { RedditHit } from '../types'
import { feedUrl, isYes, parse, parseSub, reasonOf, type Sub } from './lib'

const PANE = 'reddit-watch'
const HOUR = 3600_000
const DEFAULT_SUBS: Sub[] = [{ sub: 'ClaudeCode', flair: 'Built with Claude' }]
const items = atom({ plugin: 'reddit-watch', key: 'hits' } as const, [])

const JUDGE =
  'You filter subreddit posts for a Claude Code user who wants techniques or tools to adopt. ' +
  'Answer yes only if the post gives a reusable, specific idea for how to use Claude Code ' +
  'better: a hook, skill, MCP server, plugin or mod, a memory or context method, orchestration or multi-agent setup, ' +
  'cost or token saving, account or session management, a review or testing workflow. Answer no for games, toys, ' +
  'unrelated apps, jokes, UI cosmetics, questions without answers, and self-promotion with no reusable idea. ' +
  'Reply "yes: <what to learn, max 12 words>" or "no".'

async function subsOf($: any) {
  return ((await $.store.get('subs')) ?? DEFAULT_SUBS) as Sub[]
}

type Refreshed = { added: RedditHit[]; errors: string[] }
let running: Promise<Refreshed> | null = null

// The hourly poll and a typed command can start together; they share one run so no post is judged twice.
const refresh = ($: any): Promise<Refreshed> => (running ??= scan($).finally(() => (running = null)))

const MAX_TRIES = 3

// One Haiku call per post never judged before; steady-state a poll only pays for new posts.
async function scan($: any): Promise<Refreshed> {
  const judged = new Set(((await $.store.get('judged')) ?? []) as string[])
  const hits = ((await $.store.get('hits')) ?? []) as RedditHit[]
  const fails = ((await $.store.get('fails')) ?? {}) as Record<string, number>
  let tokens = ((await $.store.get('tokens')) ?? { in: 0, out: 0 }) as { in: number; out: number }
  const added: RedditHit[] = []
  const errors: string[] = []
  for (const s of await subsOf($)) {
    try {
      const res = await $.http.fetch(feedUrl(s), { headers: { 'User-Agent': 'Mozilla/5.0 reddit-watch/0.2' } })
      if (!res.ok) {
        errors.push(`r/${s.sub}: reddit returned ${res.status}${res.status === 429 ? ' (too many requests, will retry later)' : ''}`)
        continue
      }
      for (const p of parse(res.text).filter(p => p.id && !judged.has(p.id))) {
        const r = await $.model.complete({
          model: 'haiku',
          system: JUDGE,
          prompt: `Title: ${p.title}\n\n${p.body}`,
          maxTokens: 40,
          effort: 'low',
        })
        if (!r.isAnswered) {
          // Retried on later polls, but not forever: a post the model never answers is given up on.
          fails[p.id] = (fails[p.id] ?? 0) + 1
          if (fails[p.id]! >= MAX_TRIES) judged.add(p.id)
          continue
        }
        delete fails[p.id]
        tokens = { in: tokens.in + (r.usage.input_tokens ?? 0), out: tokens.out + (r.usage.output_tokens ?? 0) }
        judged.add(p.id)
        if (isYes(r.text)) added.push({ id: p.id, sub: s.sub, title: p.title, link: p.link, reason: reasonOf(r.text) })
      }
    } catch (err) {
      errors.push(`r/${s.sub}: ${(err as Error).message}`) // keep what earlier posts already cost
    }
  }
  const all = [...added, ...hits].slice(0, 200)
  await $.store.set('judged', [...judged].slice(-1500))
  await $.store.set('fails', fails)
  await $.store.set('hits', all)
  await $.store.set('tokens', tokens)
  await update($, items, () => all)
  return { added, errors }
}

async function openPane($: any) {
  await $.ui.open({ id: PANE, title: 'Reddit watch' })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'reddit',
      description: 'Subreddit watch',
      argumentHint: '[reset | scan | on | off | add <sub> [flair] | remove <sub> | list | clear]',
    })
    const stored = ((await $.store.get('hits')) ?? []) as RedditHit[]
    await update($, items, () => stored)
    const poll = async () => {
      if (!(await $.store.get('enabled'))) return
      try {
        const { added } = await refresh($)
        if (!added.length) return
        $.ui.toast(`Reddit: ${added.length} new post(s) may help your Claude Code use`)
        void openPane($) // seats only on a wide terminal; the toast covers the rest
      } catch {}
    }
    void poll() // on at session start: scan the latest posts now
    $.clock.every(HOUR, poll)
    return next(e)
  })

  on('command.run', { command: 'reddit' }, async ($, e) => {
    const [verb, ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ')
    try {
      if (verb === 'on' || verb === 'off') {
        await $.store.set('enabled', verb === 'on')
        if (verb === 'off') return { text: 'Reddit watch off. No polling, no Haiku calls.' }
        const { added, errors } = await refresh($)
        await openPane($)
        return { text: `Reddit watch on. Scanned the latest posts: ${added.length} relevant.${errors.length ? `\n${errors.join('\n')}` : ''}` }
      }
      if (verb === 'add' || verb === 'remove') {
        const s = parseSub(arg)
        if (!s) return { text: `Usage: /reddit ${verb} <subreddit> ${verb === 'add' ? '[flair]' : ''}`.trim() }
        const subs = (await subsOf($)).filter(x => x.sub.toLowerCase() !== s.sub.toLowerCase())
        await $.store.set('subs', verb === 'add' ? [...subs, s] : subs)
        return { text: `${verb === 'add' ? 'Watching' : 'Stopped watching'} r/${s.sub}${s.flair ? ` (flair: ${s.flair})` : ''}. Next /reddit picks it up.` }
      }
      if (verb === 'list') {
        const status = (await $.store.get('enabled')) ? 'on' : 'off'
        const t = ((await $.store.get('tokens')) ?? { in: 0, out: 0 }) as { in: number; out: number }
        return {
          text:
            `Watch is ${status}\n` +
            (await subsOf($)).map(s => `r/${s.sub}${s.flair ? ` (flair: ${s.flair})` : ''}`).join('\n') +
            `\n\nHaiku so far: ${t.in} in / ${t.out} out tokens`,
        }
      }
      if (verb === 'reset') {
        await $.store.set('judged', [])
        await $.store.set('fails', {})
        await $.store.set('hits', [])
        await update($, items, () => [])
        if (!(await $.store.get('enabled'))) return { text: 'Judged posts cleared. /reddit on to rescan.' }
        const { added, errors } = await refresh($)
        return { text: `Re-judged everything: ${added.length} relevant.${errors.length ? `\n${errors.join('\n')}` : ''}` }
      }
      if (verb === 'clear') {
        await $.store.set('hits', [])
        await update($, items, () => [])
        return { text: 'Cleared.' }
      }
      await openPane($)
      if (verb !== 'scan') return { text: 'Pane opened. /reddit scan fetches new posts.' }
      if (!(await $.store.get('enabled'))) return { text: 'Reddit watch is off. /reddit on to start.' }
      const { added, errors } = await refresh($)
      return { text: `${added.length} new relevant post(s).${errors.length ? `\n${errors.join('\n')}` : ''}` }
    } catch (err) {
      return { text: `reddit-watch failed: ${(err as Error).message}` }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Link } = $.ui.resolve(e)
    const hits = await read($, items)

    // Plain element calls, no JSX: the JSX factory `h` is not in scope in a module that imports ./lib.
    const ORANGE = '#FF4500' // Reddit orange-red
    const BLUE = '#5f99cf'
    const header = Text({ bold: true, color: ORANGE, children: `● reddit watch  ${hits.length} post${hits.length === 1 ? '' : 's'}` })
    if (hits.length === 0)
      return Box({
        flexDirection: 'column',
        children: [header, Text({ dimColor: true, children: '/reddit scan fetches, /reddit add <sub> adds one.' })],
      })

    return Box({
      flexDirection: 'column',
      children: [
        header,
        ...hits.map(hit =>
          Box({
            flexDirection: 'column',
            borderStyle: 'round',
            borderColor: '#3a3a3c',
            paddingX: 1,
            children: [
              Text({ children: [Text({ bold: true, color: BLUE, children: `r/${hit.sub}` }), Text({ dimColor: true, children: '  ▲ worth a look' })] }),
              Text({ bold: true, children: hit.title }),
              hit.reason ? Text({ dimColor: true, italic: true, children: hit.reason }) : null,
              Text({ children: Link({ href: hit.link, children: '↗ open thread' }) }),
            ],
          }),
        ),
      ],
    })
  })
}
