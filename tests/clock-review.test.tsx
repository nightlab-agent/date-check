import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { clockText } from '../hooks/stamps'

// Review of cf223d7 (prompt clock). Each finding is a failing test beside a comparison case
// of the nearest normal case that passes.
type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]
type R = Promise<{ text?: string; context?: readonly string[]; drop?: string }>
const NOW = new Date(2026, 10, 1, 5, 58).getTime()
const MIN = 60000

const bottom = (on: On) => on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
const world = (on: On, now = NOW) => {
  const clock = mock.clock(on, { now })
  bottom(on)
  return clock
}
const submit = ($: $T, text: string, kind = 'composer', extra: Record<string, unknown> = {}) =>
  $.prompt.submit({ text, origin: { kind }, ...extra } as never) as R
const clockOf = (r: { context?: readonly string[] }) => (r.context ?? []).filter(c => c.startsWith('date-check: it is'))

const gapOf = (r: { context?: readonly string[] }) => /came (.*) ago\./.exec(clockOf(r)[0] ?? '')?.[1]

// Kind 4/3, engine origins: `slack-ping` is "The session's owner pinging it from Slack"
// (index.d.ts:9380-9382), the person's own message, but PERSON (register.tsx:104) leaves it out.
test('R1 (origin): the owner\'s Slack ping between two prompts counts as the person\'s previous message', async ($, on) => {
  const c = world(on)
  await submit($, 'start the release')
  await c.set(NOW + 50 * MIN)
  await submit($, 'status?', 'slack-ping')
  await c.set(NOW + 55 * MIN)
  expect(clockOf(await submit($, 'what failed?'))[0]).toContain('came 5 min ago')
})
test('R1 (origin, comparison): the same message through Remote Control (bridge) counts', async ($, on) => {
  const c = world(on)
  await submit($, 'start the release')
  await c.set(NOW + 50 * MIN)
  await submit($, 'status?', 'bridge')
  await c.set(NOW + 55 * MIN)
  expect(clockOf(await submit($, 'what failed?'))[0]).toContain('came 5 min ago')
})

// Kind 1/2, out of order through the hook: two prompts at once, the first one's clock read
// comes back after the second's. lastPerson is read after the await (register.tsx:131-133), so
// the first prompt is measured against the second, later one and says "under a minute" when
// the person's previous message to it came 3 h before.
const slowFirstRead = (on: On, reads: number[], slow: number) => {
  let i = 0
  let release: () => void = () => {}
  const gate = new Promise<void>(r => (release = r))
  on('clock.now', async () => {
    const n = i++
    if (n === slow) await gate
    return { value: reads[n] ?? reads[reads.length - 1]! }
  })
  bottom(on)
  return release
}
test('R2 (out of order): a prompt whose clock read comes back late still gets its own gap (3 h)', async ($, on) => {
  const release = slowFirstRead(on, [NOW, NOW + 180 * MIN, NOW + 180 * MIN + 1000], 1)
  await submit($, 'start the release')
  const a = submit($, 'first of two')
  const b = submit($, 'second of two', 'composer', { wait: true })
  const rb = await b
  release()
  const ra = await a
  // By the readings A came at +180 min and B 1 s later: A's gap is 3 h, B's under a minute.
  expect([gapOf(ra), gapOf(rb)]).toEqual(['3 h', 'under a minute'])
})
test('R2 (out of order, comparison): the same two prompts with reads in order', async ($, on) => {
  const release = slowFirstRead(on, [NOW, NOW + 180 * MIN, NOW + 180 * MIN + 1000], -1)
  release()
  await submit($, 'start the release')
  const [ra, rb] = await Promise.all([submit($, 'first of two'), submit($, 'second of two', 'composer', { wait: true })])
  expect([gapOf(ra), gapOf(rb)]).toEqual(['3 h', 'under a minute'])
})

// Kind 4, a prompt that never entered: the engine's `{ drop }` beneath ("a settings hook's
// block beneath, or the engine's own", index.d.ts:9600-9603) still moves lastPerson
// (register.tsx:133, before next). The model never read that prompt, yet the next one tells it
// the person's previous message came 1 min ago, when the last one it read came 3 h ago.
test('R3 (dropped): a prompt dropped beneath does not become the person\'s previous message', async ($, on) => {
  const c = mock.clock(on, { now: NOW })
  on('prompt.submit', (_, e) => (e.text === 'blocked' ? { drop: 'settings hook blocked it' } : { text: e.text, context: e.context }))
  await submit($, 'start the release')
  await c.set(NOW + 179 * MIN)
  expect((await submit($, 'blocked')).drop).toBeDefined()
  await c.set(NOW + 180 * MIN)
  expect(clockOf(await submit($, 'is it done?'))[0]).toContain('came 3 h ago')
})
test('R3 (dropped, comparison): with no prompt between, the gap is 3 h', async ($, on) => {
  const c = world(on)
  await submit($, 'start the release')
  await c.set(NOW + 180 * MIN)
  expect(clockOf(await submit($, 'is it done?'))[0]).toContain('came 3 h ago')
})

// Checked and fine (kept as passing evidence).
test('ok: a slash command keeps e.command and gets the clock in context', async ($, on) => {
  world(on)
  const r = await submit($, '/review', 'composer', { command: { name: 'review', args: '' } })
  expect(clockOf(r).length).toBe(1)
})
test('ok: the clock line is never an empty context entry and is short', async ($, on) => {
  world(on)
  const [line] = clockOf(await submit($, 'go'))
  expect(line!.length).toBeGreaterThan(20)
  expect(line!.length).toBeLessThan(300)
})
test('ok: clockText offset has minutes for half-hour zones (whatever TZ the run has)', () => {
  const o = -new Date(NOW).getTimezoneOffset()
  const m = String(Math.abs(o) % 60).padStart(2, '0')
  const h = String(Math.floor(Math.abs(o) / 60)).padStart(2, '0')
  expect(clockText(NOW)).toContain(`UTC${o < 0 ? '-' : '+'}${h}:${m}`)
})
test('ok: with Intl gone, clockText still gives weekday, date, time and offset', () => {
  const g = globalThis as { Intl?: unknown }
  const saved = g.Intl
  try {
    g.Intl = undefined
    expect(clockText(NOW)).toMatch(/^Sunday 2026-11-01 05:58 local time, UTC[+-]\d\d:\d\d$/)
  } finally {
    g.Intl = saved
  }
})
