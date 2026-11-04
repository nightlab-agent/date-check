import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// An Edit's placeholder is read where it lands in the file. Built here so a live date-check does
// not fill this file. Clock 2026-10-31 16:01 local.
type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]
const NOW = new Date(2026, 9, 31, 16, 1).getTime()
const TIME = String.fromCodePoint(0x27e6) + 'TIME' + String.fromCodePoint(0x27e7)
const world = (on: On, files: Record<string, string>, unreadable = false) => {
  const calls: { new_string?: string; content?: string; file_path?: string }[] = []
  mock.clock(on, { now: NOW })
  on('fs.exists', (_, e) => ({ value: e.path.split('/').pop()! in files }))
  on('fs.read', (_, e) => {
    if (unreadable) throw new Error('over 4 MiB')
    return { value: files[e.path.split('/').pop()!]! }
  })
  on('tool.call', (_, e) => { calls.push(e as never); return { result: 'ok' } as never })
  return { calls }
}
const edit = ($: $T, file_path: string, old_string: string, new_string: string, replace_all = false) =>
  $.tool.call({ tool: 'Edit', file_path, old_string, new_string, replace_all } as never) as Promise<unknown>
const FENCE = '```\nlog x\n```\n'

test('comparison: a Write of a placeholder in a fence keeps it', async ($, on) => {
  const w = world(on, {})
  await $.tool.call({ tool: 'Write', file_path: 'n.md', content: '```\nlog ' + TIME + '\n```\n' } as never)
  expect(w.calls[0]!.content).toContain(TIME)
})
test('comparison: an Edit in plain text fills it', async ($, on) => {
  const w = world(on, { 'n.md': 'log x\n' })
  await edit($, 'n.md', 'log x', `log ${TIME}`)
  expect(w.calls[0]!.new_string).toBe('log 16:01')
})
test('an Edit inside a fence of the file keeps it', async ($, on) => {
  const w = world(on, { 'n.md': FENCE })
  await edit($, 'n.md', 'log x', `log ${TIME}`)
  expect(w.calls[0]!.new_string).toBe(`log ${TIME}`)
})
test('an Edit inside a code span of the file keeps it', async ($, on) => {
  const w = world(on, { 'n.md': 'Write `TOKEN` for the time.\n' })
  await edit($, 'n.md', 'TOKEN', TIME)
  expect(w.calls[0]!.new_string).toBe(TIME)
})
test('an Edit on an indented code line keeps it', async ($, on) => {
  const w = world(on, { 'n.md': 'Text.\n\n    log x\n' })
  await edit($, 'n.md', 'log x', `log ${TIME}`)
  expect(w.calls[0]!.new_string).toBe(`log ${TIME}`)
})
test('an Edit after a fence fills, and only its own placeholder', async ($, on) => {
  const w = world(on, { 'n.md': `${FENCE}${TIME} stays\n\nlog y\n` })
  await edit($, 'n.md', 'log y', `log ${TIME} now`)
  expect(w.calls[0]!.new_string).toBe('log 16:01 now')
})
test('an Edit keeps the first of two matches in view: the one that lands', async ($, on) => {
  const w = world(on, { 'n.md': `log x\n\n${FENCE}` })
  await edit($, 'n.md', 'log x', `log ${TIME}`)
  expect(w.calls[0]!.new_string).toBe('log 16:01')
})
test('an Edit that brings its own fence keeps what is in it', async ($, on) => {
  const w = world(on, { 'n.md': 'old\n' })
  await edit($, 'n.md', 'old', '```\n' + TIME + '\n```')
  expect(w.calls[0]!.new_string).toContain(TIME)
})
test('comparison: old text not in the file: read on its own, as before', async ($, on) => {
  const w = world(on, { 'n.md': FENCE })
  await edit($, 'n.md', 'absent', `log ${TIME}`)
  expect(w.calls[0]!.new_string).toBe('log 16:01')
})
test('comparison: a file that will not read: read on its own, as before', async ($, on) => {
  const w = world(on, { 'n.md': FENCE }, true)
  await edit($, 'n.md', 'log x', `log ${TIME}`)
  expect(w.calls[0]!.new_string).toBe('log 16:01')
})
