import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { stampsIn } from '../hooks/stamps'

// A refusal quotes a long line cut at 120 units. Clock 2026-10-31 16:01 local.
type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]
const NOW = new Date(2026, 9, 31, 16, 1).getTime()
const world = (on: On) => {
  mock.clock(on, { now: NOW })
  on('fs.exists', () => ({ value: false }))
  on('tool.call', () => ({ result: 'ok' }) as never)
}
const write = ($: $T, content: string) => $.tool.call({ tool: 'Write', file_path: 'log.md', content } as never) as Promise<{ deny?: string }>
const across = '- 2026-10-31 18:30 ' + 'a'.repeat(100) + '😀 tail'

test('comparison: an emoji left of the cut stays whole', () => {
  expect(stampsIn('- 2026-10-31 18:30 😀 ' + 'a'.repeat(100) + ' tail')[0]!.line.isWellFormed()).toBe(true)
})
test('comparison: a short line is kept as it is', () => {
  expect(stampsIn('- 2026-10-31 18:30 😀')[0]!.line).toBe('- 2026-10-31 18:30 😀')
})
test('the cut does not split an emoji', () => {
  expect(across.indexOf('😀')).toBe(119)
  expect(stampsIn(across)[0]!.line.isWellFormed()).toBe(true)
})
test('a bare time line in a dated file is cut the same way', () => {
  expect(stampsIn('- 16:05 ' + 'a'.repeat(111) + '😀 tail', '2026-10-31')[0]!.line.isWellFormed()).toBe(true)
})
test('the refusal the model reads is well formed', async ($, on) => {
  world(on)
  expect((await write($, across)).deny!.isWellFormed()).toBe(true)
})
test('the same line written again still goes through', async ($, on) => {
  world(on)
  await write($, across)
  expect((await write($, across)).deny).toBeUndefined()
})
