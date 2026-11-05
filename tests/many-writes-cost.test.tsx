import { expect, test } from 'claude-code/testing'
import { bash, refuses, world } from './shell-world'
const date = '2027-01-15'
const F = '```'
const lines = (n: number) => Array.from({ length: n }, (_, i) => `echo a${i + 1} >>notes.md`).join('; ')
// W4: the window hole through a sed `s` that applies (not the `$a` form, which falls back to each text alone).
refuses('W4: a skipped fence, 15 plain lines, then a sed that turns the last line into the date',
  `false && echo '${F}' >>notes.md; ${lines(15)}; sed -i 's/^a15$/${date}/' notes.md`, { 'notes.md': 'ok\n' }, date)
refuses('W4 comparison: 14 plain lines, the sed turns a14 into the date',
  `false && echo '${F}' >>notes.md; ${lines(14)}; sed -i 's/^a14$/${date}/' notes.md`, { 'notes.md': 'ok\n' }, date)
const big = (n: number) => Array.from({ length: n }, (_, i) => `- note ${i} about something that happened, fifty characters`).join('\n') + '\n'
const appends = (n: number) => Array.from({ length: n }, (_, i) => `echo "- item ${i}" >>CHANGELOG.md`).join('; ')
const timed = async ($: Parameters<typeof bash>[0], command: string) => {
  const started = performance.now()
  const r = await bash($, command)
  return { ms: performance.now() - started, deny: r.deny }
}
for (const [lineCount, n] of [[2000, 10], [4000, 20], [10000, 10], [10000, 30]] as const)
  test(`T5: ${n} appends to a ${lineCount}-line file (${Math.round(lineCount * 60 / 1024)} KB)`, async ($, on) => {
    world(on, { 'CHANGELOG.md': big(lineCount) })
    const r = await timed($, appends(n))
    console.log(`T5 ${n} appends, ${lineCount} lines: ${r.ms.toFixed(0)} ms`)
    expect(r.ms).toBeLessThan(1000)
  })

const seds = (n: number) => Array.from({ length: n }, (_, i) => `sed -i 's/note ${i} /item ${i} /' CHANGELOG.md`).join('; ')
test('20 seds on a 2 MB changelog stay under the hook budget', async ($, on) => {
  world(on, { 'CHANGELOG.md': big(40000) })
  const r = await timed($, seds(20))
  console.log(`20 seds, 2 MB file: ${r.ms.toFixed(0)} ms`)
  expect(r.deny).toBeUndefined()
  expect(r.ms).toBeLessThan(10000)
})
test('a fence in the middle of 20 appends to a 2 MB changelog costs one reading', async ($, on) => {
  world(on, { 'CHANGELOG.md': big(40000) })
  const r = await timed($, `${appends(10)}; false && echo '${F}' >>CHANGELOG.md; ${appends(10)}; echo ${date} >>CHANGELOG.md`)
  console.log(`fence among 20 appends, 2 MB file: ${r.ms.toFixed(0)} ms`)
  expect(r.deny).toContain(date)
  expect(r.ms).toBeLessThan(3000)
})
refuses('a sed past its reading allowance still reads the last text', `${Array.from({ length: 30 }, (_, i) => `sed -i 's/^x${i}$/y/' notes.md`).join('; ')}; sed -i 's/^ok$/${date}/' notes.md`, { 'notes.md': `ok\n${'z'.repeat(1024 * 1024)}\n` }, date)
