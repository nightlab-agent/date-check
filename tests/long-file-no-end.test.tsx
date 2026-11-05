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
  ['C2: a fenced block then 20 appends, 3.9 MB file with no trailing newline', big(78000, false)],
  ['C2 comparison: the same file with a trailing newline', big(78000)],
] as const)
  test(name, T, async ($, on) => {
    world(on, { 'CHANGELOG.md': file })
    const r = await timed($, fenced)
    expect(r.deny).toBeUndefined()
    expect(r.ms).toBeLessThan(10000)
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
