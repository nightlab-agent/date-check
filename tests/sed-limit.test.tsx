import { expect, test } from 'claude-code/testing'
import { bash, world } from './shell-world'

const T = { timeoutMs: 120_000 }
const times = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join('; ')
const notes = (first: string) => `${first}\n${'z'.repeat(4 * 1024 * 1024 - first.length - 2)}\n`
const nomatch = (f: string, n = 33) => times(n, i => `sed -i 's/^nothing${i}$/x/' ${f}`)

// A file that is never judged spends none of the shared limit.
const job = 'sed -i "s/^TBD$/2027-01-15/" CHANGELOG.md'
test('a sed on a code file eats the budget: date sed on the changelog judged', T, async ($, on) => {
  world(on, { 'bundle.js': notes('ok'), 'CHANGELOG.md': 'TBD\n' })
  expect((await bash($, `${nomatch('bundle.js')}; ${job}`)).deny ?? '').toContain('2027-01-15')
})
test('CMP the same date sed alone is judged', T, async ($, on) => {
  world(on, { 'bundle.js': notes('ok'), 'CHANGELOG.md': 'TBD\n' })
  expect((await bash($, job)).deny ?? '').toContain('2027-01-15')
})
test('CMP changelog sed first, code seds after, judged', T, async ($, on) => {
  world(on, { 'bundle.js': notes('ok'), 'CHANGELOG.md': 'TBD\n' })
  expect((await bash($, `${job}; ${nomatch('bundle.js')}`)).deny ?? '').toContain('2027-01-15')
})
test('one 33-script sed on a code file, then the changelog', T, async ($, on) => {
  world(on, { 'bundle.js': notes('ok'), 'CHANGELOG.md': 'TBD\n' })
  const s = Array.from({ length: 33 }, (_, i) => `-e 's/^q${i}$/x/'`).join(' ')
  expect((await bash($, `sed -i ${s} bundle.js; ${job}`)).deny ?? '').toContain('2027-01-15')
})

// `$a` always writes and needs no run: past the limit it is judged on its own text, as below it.
const appendSed = `sed -i '$a 2027-01-15' notes.md`
test('a sed that cannot be applied is dropped past the limit', T, async ($, on) => {
  world(on, { 'notes.md': notes('ok') })
  expect((await bash($, `${nomatch('notes.md')}; ${appendSed}`)).deny ?? '').toContain('2027-01-15')
})
test('CMP the same below the limit', T, async ($, on) => {
  world(on, { 'notes.md': notes('ok') })
  expect((await bash($, `${nomatch('notes.md', 5)}; ${appendSed}`)).deny ?? '').toContain('2027-01-15')
})

// The limit counts sed commands, not -e flags.
const big = Array.from({ length: 65000 }, (_, i) => `- note ${i} about something that happened, fifty characters`).join('\n') + '\n'
const ms = async (f: () => Promise<unknown>) => { const t = performance.now(); await f(); return performance.now() - t }
test('33 seds of one script holding 40 s commands stay inside the hook time', T, async ($, on) => {
  world(on, { 'CHANGELOG.md': big })
  const one = Array.from({ length: 40 }, (_, i) => `s/note ${i} /item ${i} /`).join(';')
  const t = await ms(() => bash($, times(33, () => `sed -i '${one}' CHANGELOG.md`)))
  expect(t).toBeLessThan(10000)
})
test('a sed of 41 commands just inside the limit is run, and the date it makes is judged', T, async ($, on) => {
  world(on, { 'CHANGELOG.md': `TBD\n${big.slice(0, 2_900_000)}\n` })
  const one = Array.from({ length: 40 }, (_, i) => `s/note ${i} /item ${i} /`).join(';')
  const t = await ms(async () => {
    expect((await bash($, `sed -i '${one};s/^TBD$/2027-01-15/' CHANGELOG.md`)).deny ?? '').toContain('2027-01-15')
  })
  expect(t).toBeLessThan(10000)
})
