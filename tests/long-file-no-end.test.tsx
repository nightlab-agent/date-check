import { expect, test } from 'claude-code/testing'
import { bash, world } from './shell-world'
import { newStamps, stampReader } from '../hooks/stamps'
// Healthy work at the engine's read limit stays under HookBudget.ms, on a file with no last line end too.
const F = '```'
const big = (n: number, nl = true) => Array.from({ length: n }, (_, i) => `- note ${i} about something that happened, fifty characters`).join('\n') + (nl ? '\n' : '')
const timed = async ($: Parameters<typeof bash>[0], command: string) => {
  const started = performance.now()
  const r = await bash($, command)
  return { ms: performance.now() - started, deny: r.deny }
}
const appends = (n: number) => Array.from({ length: n }, (_, i) => `echo "- item ${i}" >>CHANGELOG.md`).join('; ')
const fenced = `echo '${F}' >>CHANGELOG.md; echo code >>CHANGELOG.md; echo '${F}' >>CHANGELOG.md; ${appends(20)}`
const T = { timeoutMs: 120_000 }
for (const [name, file] of [
  ['C2: a fenced block then 20 appends, 3.9 MB file with no trailing newline', big(65000, false)],
  ['C2 comparison: the same file with a trailing newline', big(65000)],
] as const)
  test(name, T, async ($, on) => {
    world(on, { 'CHANGELOG.md': file })
    const r = await timed($, fenced)
    expect(r.deny).toBeUndefined()
    expect(r.ms).toBeLessThan(10000)
  })
const printfs = (n: number) => Array.from({ length: n }, () => 'printf x >>CHANGELOG.md').join('; ')
test('the fixture fits the engine\'s read limit', () => expect(big(65000, false).length).toBeLessThan(4 * 1024 * 1024))
test('80 appends with no line end to a 3.9 MB file with no last line end', T, async ($, on) => {
  world(on, { 'CHANGELOG.md': big(65000, false) })
  const r = await timed($, printfs(80))
  expect(r.deny).toBeUndefined()
  expect(r.ms).toBeLessThan(5000)
})
test('80 such appends, an echo between each ten', T, async ($, on) => {
  world(on, { 'CHANGELOG.md': big(65000, false) })
  const r = await timed($, Array.from({ length: 8 }, () => `${printfs(10)}; echo x >>CHANGELOG.md`).join('; '))
  expect(r.deny).toBeUndefined()
  expect(r.ms).toBeLessThan(5000)
})
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
