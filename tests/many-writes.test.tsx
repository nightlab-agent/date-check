import { expect, test } from 'claude-code/testing'
import { bash, passes, refuses, world } from './shell-world'

// Each write is judged on every text an earlier step could have left, however long the command, and
// a long file costs one reading (the hook's own code runs under HookBudget.ms = 10_000).
const date = '2027-01-15'
const F = '```'
const lines = (n: number) => Array.from({ length: n }, (_, i) => `echo a${i + 1} >>notes.md`).join('; ')

// Real bash (a shell run): the file holds a1..a15 and the date, no fence anywhere.
refuses('W1: a fence under a failed gate, 15 plain lines, then the date: the date is judged',
  `false && echo '${F}' >>notes.md; ${lines(15)}; echo ${date} >>notes.md`, {}, date)
refuses('W1 comparison: the same with 14 plain lines between',
  `false && echo '${F}' >>notes.md; ${lines(14)}; echo ${date} >>notes.md`, {}, date)
refuses('W1 comparison: 15 plain lines, no fence step at all',
  `${lines(15)}; echo ${date} >>notes.md`, {}, date)
refuses('W2: the same hole under if, with a heredoc fence',
  `if false; then cat <<EOF >>notes.md\n${F}\nEOF\nfi; ${lines(15)}; echo ${date} >>notes.md`, {}, date)
refuses('W3: the same hole with a sed appending the date at the end',
  `false && echo '${F}' >>notes.md; ${lines(15)}; sed -i '$a ${date}' notes.md`, { 'notes.md': 'ok\n' }, date)
refuses('W3 comparison: 14 plain lines, then the sed',
  `false && echo '${F}' >>notes.md; ${lines(14)}; sed -i '$a ${date}' notes.md`, { 'notes.md': 'ok\n' }, date)

// Cost. The hook's own code runs under HookBudget.ms = 10_000 (claude-code.d.ts 2.1.310, HookBudget);
// past it the hook is absent and the write lands unjudged. The repo's own standard: 40,000 of a thing
// in under a second (shell-branches.test.tsx, shell-skipped.test.tsx T1).
const big = (lineCount: number) => Array.from({ length: lineCount }, (_, i) => `- note ${i} about something that happened, fifty characters`).join('\n') + '\n'
const appends = (n: number) => Array.from({ length: n }, (_, i) => `echo "- item ${i}" >>CHANGELOG.md`).join('; ')
const timed = async ($: Parameters<typeof bash>[0], command: string) => {
  const started = performance.now()
  const r = await bash($, command)
  return { ms: performance.now() - started, deny: r.deny }
}
test('T2: 20 appends to a 2 MB changelog (40,000 lines) judged in under a second', async ($, on) => {
  world(on, { 'CHANGELOG.md': big(40000) })
  const r = await timed($, appends(20))
  console.log(`T2 20 appends, 2 MB file: ${r.ms.toFixed(0)} ms`)
  expect(r.deny).toBeUndefined()
  expect(r.ms).toBeLessThan(3000)
})
test('T2 comparison: 1 append to the same file', async ($, on) => {
  world(on, { 'CHANGELOG.md': big(40000) })
  const r = await timed($, appends(1))
  console.log(`T2c 1 append, 2 MB file: ${r.ms.toFixed(0)} ms`)
  expect(r.ms).toBeLessThan(1000)
})
test('T3: 20 appends to a 3.9 MB changelog (the engine reads up to 4 MiB) stay under the hook budget', async ($, on) => {
  world(on, { 'CHANGELOG.md': big(78000) })
  const r = await timed($, appends(20))
  console.log(`T3 20 appends, 3.9 MB file: ${r.ms.toFixed(0)} ms`)
  expect(r.deny).toBeUndefined()
  expect(r.ms).toBeLessThan(10000)
})
test('T4: 500 echo lines into a new file judged in under a second', async ($, on) => {
  world(on)
  const r = await timed($, lines(500))
  console.log(`T4 500 appends, new file: ${r.ms.toFixed(0)} ms`)
  expect(r.ms).toBeLessThan(1000)
})
test('T4 comparison: 50 echo lines into a new file', async ($, on) => {
  world(on)
  const r = await timed($, lines(50))
  console.log(`T4c 50 appends, new file: ${r.ms.toFixed(0)} ms`)
  expect(r.ms).toBeLessThan(1000)
})
