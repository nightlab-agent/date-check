import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// Review of 98fa4aa (applied(): every file a command writes, judged after its seds and echos).
// Clock: 2026-10-31 16:01 local, as in review-sed2.test.tsx. GNU sed 4.9 checked in scratch.
type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]
const NOW = new Date(2026, 9, 31, 16, 1).getTime()
const world = (on: On, files: Record<string, string> = {}) => {
  const fs = new Map(Object.entries(files))
  const ran: string[] = []
  // The engine hands fs.exists and fs.read the path joined to the session's directory.
  const at = (p: string) => (fs.has(p) ? p : p.split(/[/\\]/).pop()!)
  mock.clock(on, { now: NOW })
  on('fs.exists', (_, e) => ({ value: fs.has(at(e.path)) }))
  on('fs.read', (_, e) => {
    const t = fs.get(at(e.path))
    if (t === undefined) throw new Error('ENOENT')
    return { value: t }
  })
  on('tool.call', (_, e) => {
    ran.push((e as unknown as { tool: string }).tool)
    return { result: 'ok' } as never
  })
  return { fs, ran }
}
const bash = ($: $T, command: string) => $.tool.call({ tool: 'Bash', command } as never) as Promise<{ deny?: string }>

// H1 (missed): the first text file that changes is the only one judged; a harmless change to it hides a future stamp in the next.
test('H1: sed -i changing notes.md harmlessly and writing a future time into log.md is refused', async ($, on) => {
  world(on, { 'notes.md': 'foo\n', 'log.md': '- TBD\n' })
  expect((await bash($, "sed -i -e 's/foo/bar/' -e 's/^- TBD/- 2026-10-31 18:30/' notes.md log.md")).deny).toContain('18:30')
})
test('H1 comparison: the same command on log.md alone is refused', async ($, on) => {
  world(on, { 'log.md': '- TBD\n' })
  expect((await bash($, "sed -i -e 's/foo/bar/' -e 's/^- TBD/- 2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})

// H2 (missed): a sed -i on one log, then an echo of a future time into another log: only the sed's file is judged.
test('H2: sed -i on notes.md then echo of a future time into log.md is refused', async ($, on) => {
  world(on, { 'notes.md': 'foo\n', 'log.md': '' })
  expect((await bash($, `sed -i 's/foo/bar/' notes.md && echo "- 2026-10-31 18:30 bumped" >> log.md`)).deny).toContain('18:30')
})
test('H2 comparison: the echo alone is refused', async ($, on) => {
  world(on, { 'log.md': '' })
  expect((await bash($, `echo "- 2026-10-31 18:30 bumped" >> log.md`)).deny).toContain('18:30')
})

// H3b (false refusal): GNU sed edits plan.md and only reports "can't read missing.md" (exit 2). The missing file
// first sends the command back to the bare replacement, read as a line-start stamp.
test('H3b: sed -i over a missing file and plan.md, filling a date mid-sentence, goes through', async ($, on) => {
  const w = world(on, { 'plan.md': 'The launch is planned for TBD.\n' })
  expect(await bash($, "sed -i 's/TBD/2026-11-20/' missing.md plan.md")).not.toHaveProperty('deny')
  expect(w.ran).toEqual(['Bash'])
})
test('H3b comparison: plan.md then the missing file goes through', async ($, on) => {
  const w = world(on, { 'plan.md': 'The launch is planned for TBD.\n' })
  expect(await bash($, "sed -i 's/TBD/2026-11-20/' plan.md missing.md")).not.toHaveProperty('deny')
  expect(w.ran).toEqual(['Bash'])
})
