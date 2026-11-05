import { expect, test } from 'claude-code/testing'
import { bash, world } from './shell-world'

const date = '2027-01-15'

test('an ANSI-C word in one call leaves the next call its printf escapes', async ($, on) => {
  world(on)
  await bash($, `echo $'abc'`)
  expect((await bash($, `printf '\\n${date}' >notes.md`)).deny ?? '').toContain(date)
})
test('40,000 hashes in a word read in under a second', async ($, on) => {
  world(on)
  const started = performance.now()
  await bash($, `echo a${'#'.repeat(40000)} >notes.md`)
  expect(performance.now() - started).toBeLessThan(1000)
})
