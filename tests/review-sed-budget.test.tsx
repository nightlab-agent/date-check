import { expect, test } from 'claude-code/testing'
import { bash, world } from './shell-world'

const T = { timeoutMs: 120_000 }
const size = 4 * 1024 * 1024
const notes = `ok\n${'z'.repeat(size - 4)}\n`
const unmatched = `sed -i ${Array(32).fill("-e 's/^UNUSED$/2027-01-15/'").join(' ')} notes.md`

test('a run-less sed past the limit does not revive unmatched replacements', T, async ($, on) => {
  world(on, { 'notes.md': notes })
  expect((await bash($, `${unmatched}; sed -i '$a ok' notes.md`)).deny).toBeUndefined()
})
test('comparison: unmatched replacements alone stay allowed at the limit', T, async ($, on) => {
  world(on, { 'notes.md': notes })
  expect((await bash($, unmatched)).deny).toBeUndefined()
})

const prefixFile = `${'z'.repeat(size - 7)}\nDate: `
const prefixSed = (n: number) => `sed -i '${Array(n - 1).fill('s/^UNUSED$/x/').join(';')};s/^Date: $/Planned for /' notes.md; echo 2027-01-15 >>notes.md`
// A false refusal past the sed limit, a Known line (CHANGELOG 0.1.7): the same command goes through when written again.
test('past the limit a left-out sed leaves the old last line, refused once', T, async ($, on) => {
  world(on, { 'notes.md': prefixFile })
  expect((await bash($, prefixSed(33))).deny).toContain('2027-01-15')
  expect((await bash($, prefixSed(33))).deny).toBeUndefined()
})
test('comparison: the same sentence below the command limit', T, async ($, on) => {
  world(on, { 'notes.md': prefixFile })
  expect((await bash($, prefixSed(32))).deny).toBeUndefined()
})
