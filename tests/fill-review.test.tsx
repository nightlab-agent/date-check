import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { fillNow } from '../hooks/stamps'

// Review of 1f5995b (placeholders). Each finding: a failing test beside a passing comparison.
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
    return { result: 'ok' } as never
  })
  return { fs, ran, clock }
}
const write = ($: $T, file_path: string, content: string) => $.tool.call({ tool: 'Write', file_path, content } as never) as R
const bash = ($: $T, command: string) => $.tool.call({ tool: 'Bash', command } as never) as R

// F1 (kind 1/3): the "meant" key is the line as filled, so a retry of the same text a minute
// later is a different line and is refused again.
test('F1: a future date refused once, written again with the same ⟦TIME⟧ a minute later, goes through', async ($, on) => {
  const w = world(on)
  const text = 'Released: 2026-11-20 (planned at ⟦TIME⟧)\n'
  expect((await write($, '/p/plan.md', text)).deny).toBeDefined()
  await w.clock.set(NOW + 60000)
  expect((await write($, '/p/plan.md', text)).deny).toBeUndefined()
})
test('F1 comparison: the same retry inside the same minute goes through', async ($, on) => {
  world(on)
  const text = 'Released: 2026-11-20 (planned at ⟦TIME⟧)\n'
  expect((await write($, '/p/plan.md', text)).deny).toBeDefined()
  expect((await write($, '/p/plan.md', text)).deny).toBeUndefined()
})

// F2 (kind 3): Markdown code the fill regex does not see as code.
test('F2a: ⟦TIME⟧ inside a ~~~ fenced block is kept', () => {
  expect(fillNow('~~~\nlog ⟦TIME⟧\n~~~\n', NOW).text).toBe('~~~\nlog ⟦TIME⟧\n~~~\n')
})
test('check (no fault): ⟦TIME⟧ inside a four-backtick fence that shows a ``` fence is kept', () => {
  const t = '````md\n```\nx\n```\nlog ⟦TIME⟧\n````\n'
  expect(fillNow(t, NOW).text).toBe(t)
})
test('check (no fault): double-backtick span: ⟦NOW⟧ inside a double-backtick code span is kept', () => {
  expect(fillNow('Type ``a ` ⟦NOW⟧`` here.\n', NOW).text).toBe('Type ``a ` ⟦NOW⟧`` here.\n')
})
test('F2d: an inline ``` mid-sentence does not stop a later ⟦TIME⟧ from filling', () => {
  expect(fillNow('Wrap code in ``` fences.\n- ⟦TIME⟧ done\n', NOW).text).toBe('Wrap code in ``` fences.\n- 06:20 done\n')
})
test('F2 comparison: a ``` fence and a single-backtick span are kept, the text after is filled', () => {
  expect(fillNow('```\nlog ⟦TIME⟧\n```\n`⟦NOW⟧`\n- ⟦TIME⟧ done\n', NOW).text).toBe('```\nlog ⟦TIME⟧\n```\n`⟦NOW⟧`\n- 06:20 done\n')
})

// F3 (kind 6/3): ⟦NOW⟧ carries a space, so an unquoted shell word becomes two.
// F3 answered by the docs, not the code: ⟦NOW⟧ carries a space, so in a file name the prompt
// clock and README say ⟦DATE⟧ (quoting a shell word here would misread a heredoc's "it's").
test('F3: the prompt clock tells the agent to use ⟦DATE⟧ in a file name', async ($, on) => {
  world(on)
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  const p = (await $.prompt.submit({ text: 'go', origin: { kind: 'composer' } } as never)) as { context?: string[] }
  expect((p.context ?? []).join(' ')).toContain('⟦DATE⟧ (also in a file name)')
})
test('F3 comparison: touch notes/⟦DATE⟧.md keeps two words', async ($, on) => {
  const w = world(on)
  await bash($, 'touch notes/⟦DATE⟧.md')
  expect(w.ran[0]!.command!.split(/\s+/).length).toBe(2)
})

// Checked, no fault: engine keys survive the rewrite.
test('check: a filled call keeps tool_use_id, agentId and consent as sent', async ($, on) => {
  const w = world(on)
  await $.tool.call({ tool: 'Write', file_path: '/p/a.md', content: 'a ⟦TIME⟧\n', tool_use_id: 'tu1', agentId: 'ag1', consent: 'c' } as never)
  expect(w.ran[0]).toMatchObject({ tool: 'Write', tool_use_id: 'tu1', agentId: 'ag1', consent: 'c', content: 'a 06:20\n' })
})
test('F2e: ⟦TIME⟧ in an indented code block (which the judge treats as code) is kept', () => {
  expect(fillNow('Example:\n\n    log ⟦TIME⟧\n', NOW).text).toBe('Example:\n\n    log ⟦TIME⟧\n')
})
