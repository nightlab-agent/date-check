import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// The engine's fs.read rejects a file over 4 MiB and fs.exists a network location (index.d.ts).
// The rejections here are mocked, not a real large file or share. The new text is known all the
// same, so it is judged on its own. Clock 2026-10-31 16:01 local; 18:30 that day is in the future.
type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]
const NOW = new Date(2026, 9, 31, 16, 1).getTime()
const world = (on: On, fails: { read?: boolean; exists?: boolean }, files: Record<string, string> = { 'log.md': 'x\n' }) => {
  mock.clock(on, { now: NOW })
  on('fs.exists', (_, e) => {
    if (fails.exists) throw new Error('network location')
    return { value: e.path.split('/').pop()! in files }
  })
  on('fs.read', (_, e) => {
    if (fails.read) throw new Error('over 4 MiB')
    return { value: files[e.path.split('/').pop()!]! }
  })
  on('tool.call', () => ({ result: 'ok' }) as never)
}
type R = Promise<{ deny?: string }>
const call = ($: $T, x: object) => $.tool.call(x as never) as R
const bash = ($: $T, command: string) => call($, { tool: 'Bash', command })
const L = '- 2026-10-31 18:30 deploy'

test('comparison: an Edit of a file that reads is refused', async ($, on) => {
  world(on, {})
  expect((await call($, { tool: 'Edit', file_path: 'log.md', old_string: 'x', new_string: L })).deny).toContain('18:30')
})
test('comparison: a shell write to a file that will not read is refused', async ($, on) => {
  world(on, { read: true })
  expect((await bash($, `echo "${L}" >> log.md`)).deny).toContain('18:30')
})
test('an Edit of a file that will not read judges the new text', async ($, on) => {
  world(on, { read: true })
  expect((await call($, { tool: 'Edit', file_path: 'log.md', old_string: 'x', new_string: L })).deny).toContain('18:30')
})
test('an Edit that keeps an old stamp, on a file that will not read, is not refused', async ($, on) => {
  world(on, { read: true })
  expect((await call($, { tool: 'Edit', file_path: 'log.md', old_string: `${L} x`, new_string: `${L} y` })).deny).toBeUndefined()
})
test('a Write over a file that will not read judges the content', async ($, on) => {
  world(on, { read: true })
  expect((await call($, { tool: 'Write', file_path: 'log.md', content: L })).deny).toContain('18:30')
})
test('a Write to a place the engine cannot look at judges the content', async ($, on) => {
  world(on, { exists: true })
  expect((await call($, { tool: 'Write', file_path: '//server/share/log.md', content: L })).deny).toContain('18:30')
})
test('an Edit in a place the engine cannot look at judges the new text', async ($, on) => {
  world(on, { exists: true })
  expect((await call($, { tool: 'Edit', file_path: '//server/share/log.md', old_string: 'x', new_string: L })).deny).toContain('18:30')
})
test('a shell write in a place the engine cannot look at judges the text', async ($, on) => {
  world(on, { exists: true })
  expect((await bash($, `echo "${L}" >> //server/share/log.md`)).deny).toContain('18:30')
})
test('a file that may exist is not refused for its name', async ($, on) => {
  world(on, { exists: true })
  expect((await call($, { tool: 'Write', file_path: '//server/share/2025-06-12.md', content: 'x' })).deny).toBeUndefined()
})
test('a file that will not read does not hide the log beside it', async ($, on) => {
  world(on, { read: true }, { 'big.md': 'x\n' })
  expect((await bash($, `echo "x" >> big.md; echo "${L}" >> log.md`)).deny).toContain('18:30')
})
