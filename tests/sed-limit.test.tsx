import { expect, test } from 'claude-code/testing'
import { bash, world } from './shell-world'
import { sedCost } from './work-cases'
import { checkWorkCases } from './work-world'

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
checkWorkCases(sedCost)
