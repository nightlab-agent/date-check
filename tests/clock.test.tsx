import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { clockLine } from '../hooks/register'
import { clockText, gapText } from '../hooks/stamps'

// The prompt clock: each prompt carries the local time and zone, and how long ago the person's
// previous message came. The clock here: 2026-11-01 05:58 local time, wherever the tests run.
type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]
type R = Promise<{ text?: string; context?: readonly string[]; drop?: string }>
const NOW = new Date(2026, 10, 1, 5, 58).getTime()
const MIN = 60000

// The prompt as it reaches the bottom: the text and what was attached beside it.
const world = (on: On, now = NOW) => {
  const clock = mock.clock(on, { now })
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  return clock
}
const submit = ($: $T, text: string, kind = 'composer', extra: Record<string, unknown> = {}) =>
  $.prompt.submit({ text, origin: { kind }, ...extra } as never) as R
const clockOf = (r: { context?: readonly string[] }) => (r.context ?? []).filter(c => c.startsWith('date-check: it is'))

test('the first prompt carries the weekday, date, local time and offset, and no gap', async ($, on) => {
  world(on)
  const r = await submit($, 'write the changelog entry')
  expect(r.text).toBe('write the changelog entry')
  const [line] = clockOf(r)
  expect(line).toContain('Sunday 2026-11-01 05:58 local time, UTC')
  expect(line).not.toContain('previous message')
})

test('a second prompt three hours later says how long ago the previous one came', async ($, on) => {
  const c = world(on)
  await submit($, 'start the release')
  await c.set(NOW + 3 * 60 * MIN + 12 * MIN)
  const [line] = clockOf(await submit($, 'is it done?'))
  expect(line).toContain('09:10 local time')
  expect(line).toContain("The person's previous message came 3 h 12 min ago.")
})

test('prompts in quick series: under a minute', async ($, on) => {
  const c = world(on)
  await submit($, 'one')
  await c.set(NOW + 20000)
  expect(clockOf(await submit($, 'two'))[0]).toContain('came under a minute ago')
})

test('context another hook attached stays, and the clock is added after it', async ($, on) => {
  world(on)
  const r = await submit($, 'go', 'composer', { context: ['from another mod'] })
  expect(r.context?.[0]).toBe('from another mod')
  expect(clockOf(r).length).toBe(1)
})

// Look-alikes: a prompt that is not the person's (a background task's notification, another
// plugin's) gets the clock but does not count as the person's previous message.
test('look-alikes: a notification between two prompts gets the time and leaves the gap to the person\'s prompt', async ($, on) => {
  const c = world(on)
  await submit($, 'run the tests in the background')
  await c.set(NOW + 50 * MIN)
  const n = clockOf(await submit($, 'task finished', 'task-notification'))[0]
  expect(n).toContain('06:48 local time')
  expect(n).not.toContain('previous message')
  await c.set(NOW + 55 * MIN)
  expect(clockOf(await submit($, 'what failed?'))[0]).toContain('came 55 min ago')
})

test('look-alikes (comparison): two of the person\'s prompts with nothing between them, the same gap', async ($, on) => {
  const c = world(on)
  await submit($, 'run the tests in the background')
  await c.set(NOW + 55 * MIN)
  expect(clockOf(await submit($, 'what failed?'))[0]).toContain('came 55 min ago')
})

// Two at once: two prompts entering together each get their own line, and the next prompt's
// gap is measured from the later of them.
test('two at once: two prompts submitted together both carry the clock', async ($, on) => {
  const c = world(on)
  const [a, b] = await Promise.all([submit($, 'first'), submit($, 'second', 'composer', { wait: true })])
  expect(clockOf(a).length).toBe(1)
  expect(clockOf(b).length).toBe(1)
  await c.set(NOW + 10 * MIN)
  expect(clockOf(await submit($, 'third'))[0]).toContain('came 10 min ago')
})

// Out of order: a clock reading that comes back late never moves the person's last message back.
test('out of order: an earlier clock reading arriving after a later one reads as under a minute, not negative', () => {
  expect(clockLine(NOW, NOW + 5 * MIN)).toContain('came under a minute ago')
})
test('out of order (comparison): in order, the same two readings give the real gap', () => {
  expect(clockLine(NOW + 5 * MIN, NOW)).toContain('came 5 min ago')
})

test('promptClock false: the prompt goes through with nothing attached', { options: { promptClock: false } }, async ($, on) => {
  world(on)
  const r = await submit($, 'go')
  expect(clockOf(r).length).toBe(0)
})

test('gapText reads like a person says it', () => {
  expect(gapText(0)).toBe('under a minute')
  expect(gapText(12 * MIN)).toBe('12 min')
  expect(gapText(3 * 60 * MIN)).toBe('3 h')
  expect(gapText(26 * 60 * MIN)).toBe('1 day 2 h')
  expect(gapText(48 * 60 * MIN)).toBe('2 days')
})

test('clockText names the weekday on both sides of the clocks going back', () => {
  expect(clockText(new Date(2026, 10, 1, 1, 30).getTime())).toMatch(/^Sunday 2026-11-01 01:30 local time, UTC[+-]\d\d:\d\d/)
  expect(clockText(new Date(2026, 9, 31, 23, 59).getTime())).toMatch(/^Saturday 2026-10-31 23:59/)
})
