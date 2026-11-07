import { expect, test } from 'claude-code/testing'
import { bash, world } from './shell-world'
import { F, times, longFile } from './work-cases'
import { checkWorkCases } from './work-world'

checkWorkCases(longFile)
const T = { timeoutMs: 120_000 }
test('the comparison: a date appended after a skipped fence on a short file is still judged', async ($, on) => {
  world(on, { 'notes.md': 'a\n' })
  expect((await bash($, `false && echo '${F}' >>notes.md; echo 2027-01-15 >>notes.md`)).deny ?? '').toContain('2027-01-15')
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

