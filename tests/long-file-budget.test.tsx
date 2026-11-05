import { expect, test } from 'claude-code/testing'
import { bash, world } from './shell-world'

// A long file, a sed, then many appends: a text a sed changed is read whole for each way it ends,
// so those reads count against the same limit as the sed's own. The hook has 10 s (HookBudget.ms).
const F = '```'
const C = 'CHANGELOG.md'
const big = Array.from({ length: 65000 }, (_, i) => `- note ${i} about something that happened, fifty characters`).join('\n') + '\n'
const T = { timeoutMs: 120_000 }
const e = (s: string) => `echo '${s}' >>${C}`
const times = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join('; ')
const sed = `sed -i 's/note 5 /item 5 /' ${C}`
const timed = async ($: Parameters<typeof bash>[0], command: string) => {
  const t = performance.now()
  const r = await bash($, command)
  return { ms: performance.now() - t, deny: r.deny }
}

test('a sed, a fence pair and 20 appends on a 3.9 MB file stay inside the hook time', T, async ($, on) => {
  world(on, { [C]: big })
  const r = await timed($, `${sed}; ${e(F)}; ${e('code')}; ${e(F)}; ${times(20, i => e(`- item ${i}`))}`)
  expect(r.ms).toBeLessThan(10000)
})

test('a sed then 40 nested list appends on a 3.9 MB file stay inside the hook time', T, async ($, on) => {
  world(on, { [C]: big })
  const r = await timed($, `${sed}; ${times(40, i => e(`${' '.repeat((i % 4) * 2)}- item ${i}`))}`)
  expect(r.ms).toBeLessThan(10000)
})

test('a hundred seds on a 3.9 MB file stay inside the hook time', T, async ($, on) => {
  world(on, { [C]: big })
  const r = await timed($, times(100, i => `sed -i 's/note ${i} /item ${i} /' ${C}`))
  expect(r.ms).toBeLessThan(10000)
})

test('the comparison: a date appended after a skipped fence on a short file is still judged', async ($, on) => {
  world(on, { 'notes.md': 'a\n' })
  expect((await bash($, `false && echo '${F}' >>notes.md; echo 2027-01-15 >>notes.md`)).deny ?? '').toContain('2027-01-15')
})
