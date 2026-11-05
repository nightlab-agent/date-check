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

const seds = (n: number) => times(n, i => `sed -i 's/note ${i} /item ${i} /' ${C}`)
for (const [name, cmd] of [
  ['a fence step then 100 seds', () => `false && ${e(F)}; ${seds(100)}`],
  ['a plain append then 100 seds', () => `${e('x')}; ${seds(100)}`],
  ['180 seds', () => seds(180)],
] as const)
  test(`${name} on a 3.9 MB file stay inside the hook time`, T, async ($, on) => {
    world(on, { [C]: big })
    expect((await timed($, cmd())).ms).toBeLessThan(10000)
  })

// Past the limit a sed is left out: what was worked out stays, and an unmatched sed is never read as a write.
const notes = (first: string) => `${first}\n${'z'.repeat(4 * 1024 * 1024 - first.length - 2)}\n`
test('33 seds that match nothing on a 4 MiB file are not refused', T, async ($, on) => {
  world(on, { 'notes.md': notes('ok') })
  expect((await bash($, times(33, () => `sed -i 's/^UNUSED$/2027-01-15/' notes.md`))).deny).toBeUndefined()
})
test('a date an early sed makes is judged when later seds pass the limit', T, async ($, on) => {
  world(on, { 'notes.md': notes('YEAR-01-15') })
  const c = `sed -i 's/^YEAR/2027/' notes.md; ${times(32, i => `sed -i 's/^nothing${i}$/x/' notes.md`)}`
  expect((await bash($, c)).deny ?? '').toContain('2027-01-15')
})
test('a line appended after the limit is still judged', T, async ($, on) => {
  world(on, { 'notes.md': notes('ok') })
  expect((await bash($, `${times(33, i => `sed -i 's/^nothing${i}$/x/' notes.md`)}; echo 2027-01-15 >>notes.md`)).deny ?? '').toContain('2027-01-15')
})

const files = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`f${i}.md`, big]))
test('33 seds on each of six 3.9 MB files stay inside the hook time', T, async ($, on) => {
  world(on, files)
  const c = Object.keys(files).map(f => times(33, i => `sed -i 's/note ${i} /item ${i} /' ${f}`)).join('; ')
  expect((await timed($, c)).ms).toBeLessThan(10000)
})
test('33 seds of 40 scripts each on a 3.9 MB file stay inside the hook time', T, async ($, on) => {
  world(on, { [C]: big })
  const scripts = Array.from({ length: 40 }, (_, i) => `-e 's/note ${i} /item ${i} /'`).join(' ')
  expect((await timed($, times(33, () => `sed -i ${scripts} ${C}`))).ms).toBeLessThan(10000)
})
