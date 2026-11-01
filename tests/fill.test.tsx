import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { fillNow } from '../hooks/stamps'

// Placeholders: the agent writes ⟦NOW⟧ and the clock fills it in as the call lands, so no time
// is typed. The clock here: 2026-11-01 06:20:41 local time, wherever the tests run.
type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]
type R = Promise<{ deny?: string; context?: string[] }>
const NOW = new Date(2026, 10, 1, 6, 20, 41).getTime()

const world = (on: On, files: Record<string, string> = {}, now = NOW) => {
  const fs = new Map(Object.entries(files))
  const ran: Record<string, string>[] = []
  const clock = mock.clock(on, { now })
  on('fs.exists', (_, e) => ({ value: fs.has(e.path) }))
  on('fs.read', (_, e) => {
    const t = fs.get(e.path)
    if (t === undefined) throw new Error('ENOENT')
    return { value: t }
  })
  on('tool.call', (_, e) => {
    const x = e as unknown as Record<string, string>
    ran.push(x)
    if (x.tool === 'Write') fs.set(x.file_path!, x.content!)
    if (x.tool === 'Edit') fs.set(x.file_path!, (fs.get(x.file_path!) ?? '').replace(x.old_string!, x.new_string!))
    return { result: 'ok' } as never
  })
  return { fs, ran, clock }
}
const write = ($: $T, file_path: string, content: string) => $.tool.call({ tool: 'Write', file_path, content } as never) as R
const edit = ($: $T, file_path: string, old_string: string, new_string: string) =>
  $.tool.call({ tool: 'Edit', file_path, old_string, new_string } as never) as R
const bash = ($: $T, command: string) => $.tool.call({ tool: 'Bash', command } as never) as R

test('a log line written with ⟦TIME⟧ lands with the real time, and the agent is told what was written', async ($, on) => {
  const w = world(on, { '/p/log/2026-11-01.md': '# Log\n' })
  const r = await edit($, '/p/log/2026-11-01.md', '# Log\n', '# Log\n- ⟦TIME⟧ replies checked\n')
  expect(r.deny).toBeUndefined()
  expect(w.fs.get('/p/log/2026-11-01.md')).toBe('# Log\n- 06:20 replies checked\n')
  expect(r.context?.join(' ')).toContain('⟦TIME⟧ 06:20')
})

test('Write: ⟦NOW⟧, ⟦DATE⟧ and ⟦NOW-ISO⟧ each take their own form', async ($, on) => {
  const w = world(on)
  await write($, '/p/CHANGELOG.md', '## 0.2.0 (⟦DATE⟧)\nhandoff ⟦NOW⟧\nat ⟦NOW-ISO⟧\n')
  const t = w.fs.get('/p/CHANGELOG.md')!
  expect(t).toContain('## 0.2.0 (2026-11-01)')
  expect(t).toContain('handoff 2026-11-01 06:20')
  expect(t).toMatch(/at 2026-11-01T06:20:41[+-]\d\d:\d\d\n/)
})

test('a shell append with ⟦TIME⟧ runs with the real time in the command', async ($, on) => {
  const w = world(on)
  await bash($, 'echo "- ⟦TIME⟧ posted the Short" >> notes/log.md')
  expect(w.ran[0]!.command).toBe('echo "- 06:20 posted the Short" >> notes/log.md')
})

// Comparison: nothing to fill, nothing changed and nothing said.
test('comparison: a call with no placeholder reaches the tool exactly as sent, with no note', async ($, on) => {
  const w = world(on)
  const r = await write($, '/p/notes.md', 'plain text, 06:19 checked\n')
  expect(w.ran[0]!.content).toBe('plain text, 06:19 checked\n')
  expect(r.context ?? []).toEqual([])
})

// Look-alikes: a placeholder shown in code stays; near spellings are text.
test('look-alikes: ⟦NOW⟧ inside backticks or a code block is kept; ⟦now⟧ and [NOW] are text', async ($, on) => {
  const w = world(on)
  await write($, '/p/README.md', 'Write `⟦NOW⟧` and it is filled.\n\n```\nlog ⟦TIME⟧\n```\n⟦now⟧ [NOW] ⟦NOW ⟧\nsaved ⟦TIME⟧\n')
  const t = w.fs.get('/p/README.md')!
  expect(t).toContain('Write `⟦NOW⟧` and it is filled.')
  expect(t).toContain('```\nlog ⟦TIME⟧\n```')
  expect(t).toContain('⟦now⟧ [NOW] ⟦NOW ⟧')
  expect(t).toContain('saved 06:20')
})

test('look-alikes: an unclosed code fence keeps everything after it as written', () => {
  expect(fillNow('at ⟦TIME⟧\n```\n⟦TIME⟧', NOW).text).toBe('at 06:20\n```\n⟦TIME⟧')
})

// Out of order: the Edit's old text is matched as the file has it, a placeholder there untouched.
test('out of order: an Edit whose old text holds ⟦NOW⟧ still matches; only the new text is filled', async ($, on) => {
  const w = world(on, { '/p/todo.md': 'stamp: ⟦NOW⟧ (literal)\n' })
  await edit($, '/p/todo.md', 'stamp: ⟦NOW⟧ (literal)\n', 'stamp: ⟦NOW⟧\n')
  expect(w.ran[0]!.old_string).toBe('stamp: ⟦NOW⟧ (literal)\n')
  expect(w.fs.get('/p/todo.md')).toBe('stamp: 2026-11-01 06:20\n')
})

// Two at once: each call reads the clock for itself.
test('two at once: two writes a minute apart each get their own minute', async ($, on) => {
  const w = world(on)
  const a = write($, '/p/a.md', 'a ⟦TIME⟧\n')
  await w.clock.set(NOW + 60000)
  const b = write($, '/p/b.md', 'b ⟦TIME⟧\n')
  await Promise.all([a, b])
  expect(w.fs.get('/p/a.md')).toBe('a 06:20\n')
  expect(w.fs.get('/p/b.md')).toBe('b 06:21\n')
})

test('a filled stamp is the real time, so the future check never refuses it', async ($, on) => {
  world(on)
  const r = await write($, '/p/notes/handoff.md', '## ⟦NOW⟧ handoff\n')
  expect(r.deny).toBeUndefined()
})

test('fill: false leaves placeholders as written and the prompt clock does not mention them', { options: { fill: false } }, async ($, on) => {
  const w = world(on)
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  await write($, '/p/a.md', 'a ⟦TIME⟧\n')
  expect(w.fs.get('/p/a.md')).toBe('a ⟦TIME⟧\n')
  const p = (await $.prompt.submit({ text: 'go', origin: { kind: 'composer' } } as never)) as { context?: string[] }
  const line = (p.context ?? []).find(c => c.startsWith('date-check: it is'))!
  expect(line).toContain('06:20 local time')
  expect(line).not.toContain('⟦')
})

test('comparison: by default the prompt clock tells the agent the placeholders exist', async ($, on) => {
  world(on)
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  const p = (await $.prompt.submit({ text: 'go', origin: { kind: 'composer' } } as never)) as { context?: string[] }
  expect((p.context ?? []).join(' ')).toContain('write ⟦NOW⟧ (date and time), ⟦DATE⟧ (also in a file name) or ⟦TIME⟧')
})
