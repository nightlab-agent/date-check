import { expect, test } from 'claude-code/testing'
import { bash, world } from './shell-world'

const cmd = `echo '2027-01-15' >notes.md; false && echo ok >notes.md; :`
test('R1: a date dropped by a skipped overwrite, refused once, goes through written again with the note', async ($, on) => {
  world(on)
  const first = await bash($, cmd)
  expect(first.deny ?? '').toContain('2027-01-15')
  const second = (await bash($, cmd)) as { deny?: string; context?: string[] }
  expect(second.deny).toBeUndefined()
  expect((second.context ?? []).join('\n')).toContain('as written the second time')
})
test('R2: two of the same command at once are both refused', async ($, on) => {
  world(on)
  const [a, b] = await Promise.all([bash($, cmd), bash($, cmd)])
  expect(a.deny ?? '').toContain('2027-01-15')
  expect(b.deny ?? '').toContain('2027-01-15')
})
test('R3: the retry of a refused also-text keyed by the same line, spelled ./notes.md, goes through', async ($, on) => {
  world(on)
  expect((await bash($, cmd)).deny ?? '').toContain('2027-01-15')
  expect((await bash($, cmd.replace(/notes\.md/g, './notes.md'))).deny).toBeUndefined()
})
