import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { shellWrite } from '../hooks/register'

// Review of 98b3a48 (sed -i). Clock: 2026-10-31 16:01 local, as in date-check.test.tsx.
type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]
const NOW = new Date(2026, 9, 31, 16, 1).getTime()
const world = (on: On, files: Record<string, string> = {}) => {
  const fs = new Map(Object.entries(files))
  const ran: string[] = []
  // The engine hands fs.exists and fs.read the path joined to the session's directory
  // (seen 2026-11-02: "plan.md" arrives as "<cwd>/plan.md"); the files here are named bare.
  const at = (p: string) => (fs.has(p) ? p : p.split(/[/\\]/).pop()!)
  mock.clock(on, { now: NOW })
  on('fs.exists', (_, e) => ({ value: fs.has(at(e.path)) }))
  on('fs.read', (_, e) => {
    const t = fs.get(at(e.path))
    if (t === undefined) throw new Error('ENOENT')
    return { value: t }
  })
  on('tool.call', (_, e) => {
    const x = e as unknown as { tool: string; file_path: string; old_string?: string; new_string?: string; content?: string }
    ran.push(x.tool)
    if (x.tool === 'Edit') fs.set(x.file_path, (fs.get(x.file_path) ?? '').replace(x.old_string!, x.new_string!))
    return { result: 'ok' } as never
  })
  return { fs, ran }
}
const bash = ($: $T, command: string) => $.tool.call({ tool: 'Bash', command } as never) as Promise<{ deny?: string }>
const edit = ($: $T, file_path: string, old_string: string, new_string: string) =>
  $.tool.call({ tool: 'Edit', file_path, old_string, new_string } as never) as Promise<{ deny?: string }>

// F1 (false refusal): the replacement is judged as if it were a whole line, so a date put mid-sentence is a "stamp".
test('F1: sed -i filling a planned date into a sentence goes through, as the same Edit does', async ($, on) => {
  const w = world(on, { 'plan.md': 'The launch is planned for TBD.\n' })
  expect(await bash($, "sed -i 's/TBD/2026-11-20/' plan.md")).not.toHaveProperty('deny')
  expect(w.ran).toEqual(['Bash'])
})
test('F1 comparison: the same change as an Edit goes through', async ($, on) => {
  const w = world(on, { 'plan.md': 'The launch is planned for TBD.\n' })
  expect(await edit($, 'plan.md', 'The launch is planned for TBD.', 'The launch is planned for 2026-11-20.')).not.toHaveProperty('deny')
  expect(w.ran).toEqual(['Edit'])
})
test('F1b: sed -i putting a meeting time mid-line in a day log goes through, as the same Edit does', async ($, on) => {
  const w = world(on, { '2026-10-31.md': '- 15:00 call with Ana moved to TBD\n' })
  expect(await bash($, "sed -i 's/TBD/18:30/' 2026-10-31.md")).not.toHaveProperty('deny')
  expect(w.ran).toEqual(['Bash'])
})
test('F1b comparison: the same change as an Edit goes through', async ($, on) => {
  const w = world(on, { '2026-10-31.md': '- 15:00 call with Ana moved to TBD\n' })
  expect(await edit($, '2026-10-31.md', 'moved to TBD', 'moved to 18:30')).not.toHaveProperty('deny')
  expect(w.ran).toEqual(['Edit'])
})

// F2 (regression): a sed -i to another file earlier in the command now hides an echo's future stamp.
test('F2: a sed -i on code before an echo of a future time into a log is still refused', async ($, on) => {
  world(on)
  expect((await bash($, `sed -i 's/v1/v2/' src/app.ts && echo "- 2026-10-31 18:30 bumped" >> log.md`)).deny).toContain('18:30')
})
test('F2 comparison: the echo alone is refused', async ($, on) => {
  world(on)
  expect((await bash($, `echo "- 2026-10-31 18:30 bumped" >> log.md`)).deny).toContain('18:30')
})

// F3: one quoted script with `;` between commands is cut at the `;` before sedWrite sees it.
test('F3: sed -i with two commands joined by ; in one script is read', () => {
  expect(shellWrite("sed -i 's/a/b/; s/^- TBD/- 18:30/' log.md")).toEqual({ file: 'log.md', text: 'b\n- 18:30' })
})
test('F3 comparison: the same two commands as two -e are read', () => {
  expect(shellWrite("sed -i -e 's/a/b/' -e 's/^- TBD/- 18:30/' log.md")).toEqual({ file: 'log.md', text: 'b\n- 18:30' })
})

// F4: several files: only the last is judged, so a code file last hides a log first.
test('F4: sed -i over a log and a code file judges the log', async ($, on) => {
  world(on, { 'log.md': '- TBD\n', 'app.ts': 'x\n' }) // sed -i writes nothing to a file that does not exist (s330)
  expect((await bash($, "sed -i 's/^- TBD/- 2026-10-31 18:30/' log.md app.ts")).deny).toContain('18:30')
})
test('F4 comparison: the log alone is refused', async ($, on) => {
  world(on, { 'log.md': '- TBD\n' })
  expect((await bash($, "sed -i 's/^- TBD/- 2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})

// F5: a redirect after the file is taken as the file.
test('F5: sed -i ... log.md 2>err.txt still names log.md', () => {
  expect(shellWrite("sed -i 's/^- TBD/- 18:30/' log.md 2>err.txt")?.file).toBe('log.md')
})
test('F5 comparison: without the redirect it names log.md', () => {
  expect(shellWrite("sed -i 's/^- TBD/- 18:30/' log.md")?.file).toBe('log.md')
})

// F6: a back-reference glued to the stamp hides it (\1 then 18:30 reads as \118:30).
test('F6: s with \\1 before the time still yields the time at the line start', () => {
  expect(shellWrite("sed -i 's/^\\(- \\)TBD/\\118:30/' 2026-10-31.md")?.text).toMatch(/^- 18:30|^18:30/)
})
test('F6 comparison: the literal prefix form yields it', () => {
  expect(shellWrite("sed -i 's/^- TBD/- 18:30/' 2026-10-31.md")?.text).toBe('- 18:30')
})

// Look-alikes that must stay unread (these should all PASS).
test('look-alikes left alone: grep -i, sed -n p, a word starting with sed, -i inside the script', () => {
  expect(shellWrite("grep -i x log.md | sed 's/a/18:30/'")).toBeUndefined()
  expect(shellWrite("sed -n -E '/x/p' log.md")).toBeUndefined()
  expect(shellWrite("sedx -i 's/a/b 18:30/' log.md")).toBeUndefined()
  expect(shellWrite("sed 's/-i/- 18:30/' log.md")).toBeUndefined()
  expect(shellWrite("sed -i '/- 18:30 wrong/d' log.md")).toBeUndefined()
  expect(shellWrite("sed -Ei 's/x/- 18:30/' log.md")?.file).toBe('log.md')
  expect(shellWrite("sed -i -f fix.sed log.md")).toBeUndefined()
  expect(shellWrite("sed -i 's/a\\/b/c\\/18:30/' log.md")?.text).toBe('c/18:30')
  expect(() => shellWrite("sed -i 's' log.md; sed -i 's[a[b[' x.md; sed -i 's^a^b^' y.md; sed -i 's-a-b-' z.md")).not.toThrow()
})
