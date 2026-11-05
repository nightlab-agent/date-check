import { expect, test } from 'claude-code/testing'
import { bash, world } from './shell-world'

const T = { timeoutMs: 180_000 }
const MiB = 1024 * 1024
const notes = (n: number) => `ok\n${'z'.repeat(n - 4)}\n`
const script = (n: number) => Array.from({ length: n }, (_, i) => `s/^q${i}$/x/`).join(';')

// F1: the Known line says the false refusal takes the limit (a 4 MiB file, over 32 seds).
const revive = `sed -i 's/^UNUSED$/2027-01-15/' notes.md; sed -i '$a ok' notes.md`
test('F1 a small file, two seds, no limit near: an unmatched replacement stays allowed', T, async ($, on) => {
  world(on, { 'notes.md': 'ok\n' })
  expect((await bash($, revive)).deny).toBeUndefined()
})
test('F1 CMP unmatched replacement alone', T, async ($, on) => {
  world(on, { 'notes.md': 'ok\n' })
  expect((await bash($, `sed -i 's/^UNUSED$/2027-01-15/' notes.md`)).deny).toBeUndefined()
})

// F2: the limit is a product of size and commands.
const prefix = `${'z'.repeat(MiB - 7)}\nDate: `
const prefixSed = (n: number) => `sed -i '${script(n - 1)};s/^Date: $/Planned for /' notes.md; echo 2027-01-15 >>notes.md`
test('F2 the limit is size times commands: a 1 MiB file crosses at 129', T, async ($, on) => {
  world(on, { 'notes.md': prefix })
  expect((await bash($, prefixSed(129))).deny).toContain('2027-01-15')
})
test('F2 CMP 1 MiB and 128 commands', T, async ($, on) => {
  world(on, { 'notes.md': prefix })
  expect((await bash($, prefixSed(128))).deny).toBeUndefined()
})

// F3: a sed never run spends the limit, and a real date in the changelog goes unjudged.
const job = `sed -i 's/^TBD$/2027-01-15/' CHANGELOG.md`
const big = notes(4 * MiB)
const files = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${i}.md`, big]))
const runless = (n: number) => Array.from({ length: n }, (_, i) => `sed -i '$a ok' f${i}.md`).join('; ')
test('F3 33 seds that never run spend no limit: the date sed is judged', T, async ($, on) => {
  world(on, { ...files(33), 'CHANGELOG.md': 'TBD\n' })
  expect((await bash($, `${runless(33)}; ${job}`)).deny ?? '').toContain('2027-01-15')
})
test('F3 CMP 31 of them', T, async ($, on) => {
  world(on, { ...files(31), 'CHANGELOG.md': 'TBD\n' })
  expect((await bash($, `${runless(31)}; ${job}`)).deny ?? '').toContain('2027-01-15')
})

// F4: the limit counts one text, the steps run over more.
const lines = Array.from({ length: 19000 }, (_, i) => `- note ${i} about something that happened, fifty characters`).join('\n') + '\n'
const ms = async (f: () => Promise<unknown>) => { const t = performance.now(); await f(); return Math.round(performance.now() - t) }
const one = Array.from({ length: 110 }, (_, i) => `s/note ${i} /item ${i} /`).join(';')
const eight = Array.from({ length: 8 }, (_, i) => `echo a${i} >>CHANGELOG.md`).join('; ')
test('F4 eight appends then one sed inside the limit stay inside the hook time', T, async ($, on) => {
  world(on, { 'CHANGELOG.md': lines })
  const t = await ms(() => bash($, `${eight}; sed -i '${one}' CHANGELOG.md`))
  console.log('F4 ms', t, 'size', lines.length, 'counted', (lines.length + 64) * 110)
  expect(t).toBeLessThan(10000)
})
test('F4 CMP the same sed alone', T, async ($, on) => {
  world(on, { 'CHANGELOG.md': lines })
  const t = await ms(() => bash($, `sed -i '${one}' CHANGELOG.md`))
  console.log('F4 CMP ms', t)
  expect(t).toBeLessThan(10000)
})

// F5: a sed that needs no run throws away the date an earlier sed made.
const small = 'YEAR-01-15\n'
const early = `sed -i 's/YEAR/2027/' notes.md`
test('F5 a date made by an early sed stays judged past a later $a, small file', T, async ($, on) => {
  world(on, { 'notes.md': small })
  expect((await bash($, `${early}; sed -i '$a ok' notes.md`)).deny ?? '').toContain('2027-01-15')
})
test('F5 CMP the same sed with no $a after it', T, async ($, on) => {
  world(on, { 'notes.md': small })
  expect((await bash($, early)).deny ?? '').toContain('2027-01-15')
})
const nomatch = (n: number) => Array.from({ length: n }, (_, i) => `sed -i 's/^nothing${i}$/x/' notes.md`).join('; ')
const wide = `YEAR-01-15\n${'z'.repeat(4 * MiB - 12)}\n`
test('F5b past the limit: an early date stays judged when the step after the limit needs no run', T, async ($, on) => {
  world(on, { 'notes.md': wide })
  expect((await bash($, `${early}; ${nomatch(33)}; sed -i '$a ok' notes.md`)).deny ?? '').toContain('2027-01-15')
})
test('F5b CMP past the limit with a sed that does run', T, async ($, on) => {
  world(on, { 'notes.md': wide })
  expect((await bash($, `${early}; ${nomatch(33)}; sed -i 's/^q$/x/' notes.md`)).deny ?? '').toContain('2027-01-15')
})
