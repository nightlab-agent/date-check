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

// A path the shell works out names no one file and any step may be skipped, so each write is read
// alone: a sentence built by two printfs there is refused once, and no date hides behind a join.
test('a date before a skipped printf on a path the shell works out is judged', async ($, on) => {
  world(on, {})
  expect((await bash($, `printf 2027-01-15 >>"$D/notes.md"; false && printf 0 >>"$D/notes.md"`)).deny ?? '').toContain('2027-01-15')
})
test('a cd between two printfs makes two files, so the second is read alone', async ($, on) => {
  world(on, { 'notes.md': 'a\n' })
  expect((await bash($, `printf 'Due ' >>notes.md; cd sub; printf '2027-01-15\\n' >>notes.md`)).deny ?? '').toContain('2027-01-15')
})
test('a path variable set again between two printfs is read as two files', async ($, on) => {
  world(on, {})
  expect((await bash($, `printf x >>"$D/notes.md"; D=sub; echo 2027-01-15 >>"$D/notes.md"`)).deny ?? '').toContain('2027-01-15')
})
test('the known limit: a sentence built by two printfs on such a path is refused once, then goes through', async ($, on) => {
  world(on, {})
  const c = `printf 'Planned for ' >>"$D/notes.md"; printf '2027-01-15\\n' >>"$D/notes.md"`
  expect((await bash($, c)).deny ?? '').toContain('2027-01-15')
  expect((await bash($, c)).deny).toBeUndefined()
})
