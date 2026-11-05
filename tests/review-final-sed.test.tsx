import { expect, test } from 'claude-code/testing'
import { bash, world } from './shell-world'

// Each regression passes at the supplied base. Real Bash exits 0 for every command here.
const date = '2027-01-15'

// Bash leaves "```\n```\n2027-01-15\n": the appended date is outside the fence.
test('R1 unsupported sed closes the existing fence before an appended date', async ($, on) => {
  world(on, { 'notes.md': '```\n' })
  expect((await bash($, "sed -i '$a ```' notes.md; echo 2027-01-15 >>notes.md")).deny ?? '').toContain(date)
})
test('R1 comparison an already closed fence before an appended date', async ($, on) => {
  world(on, { 'notes.md': '```\n```\n' })
  expect((await bash($, "sed -i '$a ok' notes.md; echo 2027-01-15 >>notes.md")).deny ?? '').toContain(date)
})

// Bash adds a second date line. The old copy must not consume the new copy's verdict.
test('R2 unsupported sed appends a second copy of an existing future date', async ($, on) => {
  world(on, { 'notes.md': `${date}\n` })
  expect((await bash($, "sed -i '$a 2027-01-15' notes.md")).deny ?? '').toContain(date)
})
test('R2 comparison unsupported sed appends a new future date', async ($, on) => {
  world(on, { 'notes.md': 'ok\n' })
  expect((await bash($, "sed -i '$a 2027-01-15' notes.md")).deny ?? '').toContain(date)
})

// Bash leaves "Planned for 2027-01-15\n"; neither step writes a standalone date.
test('R3 unsupported prefix rewrite keeps a later partial date in its sentence', async ($, on) => {
  world(on, { 'notes.md': 'YEAR-01-15\n' })
  expect((await bash($, "sed -i '1,1s/^/Planned for /' notes.md; sed -i 's/YEAR/2027/' notes.md")).deny).toBeUndefined()
})
test('R3 comparison the same sentence made by one supported sed', async ($, on) => {
  world(on, { 'notes.md': 'YEAR-01-15\n' })
  expect((await bash($, "sed -i 's/^/Planned for /;s/YEAR/2027/' notes.md")).deny).toBeUndefined()
})

// What each later step reads once a sed cannot be worked out: alone, so these two stand as Known limits.
test('a date a step after an unworked sed makes from earlier text passes (Known)', async ($, on) => {
  world(on, { 'notes.md': 'YEAR-01-15\n' })
  expect((await bash($, "sed -i '$a ok' notes.md; sed -i 's/YEAR/2027/' notes.md")).deny).toBeUndefined()
})
test('a replacement after an unworked sed that matches nothing is refused once (Known)', async ($, on) => {
  world(on, { 'notes.md': 'ok\n' })
  const c = "sed -i '$a ok' notes.md; sed -i 's/nothing/2027-01-15/' notes.md"
  expect((await bash($, c)).deny ?? '').toContain(date)
  expect((await bash($, c)).deny).toBeUndefined()
})
