import { expect, test } from 'claude-code/testing'
import { bash, world } from './shell-world'
import { newStamps, stampReader } from '../hooks/stamps'
import { big, F, noEnd } from './work-cases'
import { checkWorkCases } from './work-world'

checkWorkCases(noEnd)
test('the fixture fits the engine read limit', () => expect(big(65000, false).length).toBeLessThan(4 * 1024 * 1024))
// A last line left open is read from where it starts, and it reads as a whole reading does.
test('an open fence on a file with no last line end still hides a date', async ($, on) => {
  world(on, { 'notes.md': `a\n${F}\ncode` })
  expect((await bash($, `printf x >>notes.md; echo ' 2027-01-15' >>notes.md`)).deny).toBeUndefined()
})
test('comparison: a fence closed by the joined line lets the next date be judged', async ($, on) => {
  world(on, { 'notes.md': `a\n${F}\ncode\n` })
  expect((await bash($, `printf '${F}' >>notes.md; printf '\\n' >>notes.md; echo 2027-01-15 >>notes.md`)).deny).toContain('2027-01-15')
})
test('a fence closed by a joined last line, then a date', async ($, on) => {
  world(on, { 'notes.md': `a\n${F}\ncode\n${F.slice(0, 2)}` })
  expect((await bash($, `printf '${F[0]}' >>notes.md; printf '\\n' >>notes.md; echo 2027-01-15 >>notes.md`)).deny).toContain('2027-01-15')
})

test('the fast reader agrees with a whole reading when the last line has no line end', () => {
  const F3 = F
  const table: [string, string][] = [
    ['x', 'x 2027-01-15\n'], ['x', 'x\n2027-01-15\n'], ['2027-01-15', '2027-01-15\n'], ['2027-01-15', '2027-01-15\n2027-01-15\n'],
    ['2027-01-15', '2027-01-15 and 2027-01-16\n'], [`${F3}\nx`, `${F3}\nx\n2027-01-15\n`], [`${F3}\nx`, `${F3}\nx\n${F3}\n2027-01-15\n`],
    [`a\n${F3}`, `a\n${F3}\n2027-01-15\n${F3}\n`], ['- item', '- item\n  2027-01-15\n'], ['a\r\nb', 'a\r\nb\r\n2027-01-15\r\n'], ['a\n', 'a\n2027-01-15\n'], ['', '2027-01-15\n'],
  ]
  for (const [before, after] of table) expect([before, stampReader(before)(after).map(s => s.text)]).toEqual([before, newStamps(before, after).map(s => s.text)])
})
