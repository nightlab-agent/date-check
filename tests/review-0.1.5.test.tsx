import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// Bugs found in a review of 0.1.5 before its release. Same in-memory world as tests/date-check.test.tsx.
type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]
const NOW = new Date(2026, 10, 2, 10, 0).getTime() // 2026-11-02 10:00 local

const world = (on: On, files: Record<string, string> = {}, cwd: string | (() => never) = '/p') => {
  const fs = new Map(Object.entries(files))
  const ran: string[] = []
  mock.clock(on, { now: NOW })
  on('session.cwd', () => (typeof cwd === 'string' ? { value: cwd } : cwd()))
  on('fs.exists', (_, e) => ({ value: fs.has(e.path) }))
  on('fs.read', (_, e) => {
    const t = fs.get(e.path)
    if (t === undefined) throw new Error('ENOENT')
    return { value: t }
  })
  on('tool.call', (_, e) => {
    const x = e as unknown as { tool: string; file_path: string; old_string?: string; new_string?: string; content?: string }
    ran.push(x.tool)
    if (x.tool === 'Write') fs.set(x.file_path, x.content!)
    if (x.tool === 'Edit') fs.set(x.file_path, (fs.get(x.file_path) ?? '').replace(x.old_string!, x.new_string!))
    return { result: 'ok' } as never
  })
  return { fs, ran }
}
type R = Promise<{ deny?: string; context?: string[] }>
const write = ($: $T, file_path: string, content: string) => $.tool.call({ tool: 'Write', file_path, content } as never) as R
const edit = ($: $T, file_path: string, old_string: string, new_string: string) =>
  $.tool.call({ tool: 'Edit', file_path, old_string, new_string } as never) as R
const bash = ($: $T, command: string) => $.tool.call({ tool: 'Bash', command } as never) as R


const F = "## 2026-11-05 release"

// P1 (kind 6/3): on Windows the session's directory and a Write's path use backslashes; placed()
// joins with "/" (register.tsx:67), so a relative shell retry never equals the absolute refusal.
test('P1: Windows, refused in a Write to E:\\p\\notes.md, appended again relatively, goes through', async ($, on) => {
  world(on, { 'E:\\p\\notes.md': '' }, 'E:\\p')
  expect((await write($, 'E:\\p\\notes.md', F + '\n')).deny).toContain('2026-11-05')
  expect((await bash($, `echo '${F}' >> notes.md`)).deny).toBeUndefined()
})
test('P1 (comparison): POSIX, the same retry goes through', async ($, on) => {
  world(on, { '/p/notes.md': '' }, '/p')
  expect((await write($, '/p/notes.md', F + '\n')).deny).toContain('2026-11-05')
  expect((await bash($, `echo '${F}' >> notes.md`)).deny).toBeUndefined()
})
// P1b: the same for the name key, which 0.1.4 matched by bare name (a regression of C1's fix).
test('P1b: Windows, a misnamed new file refused in a Write, written again by the shell relatively, goes through', async ($, on) => {
  world(on, {}, 'E:\\p')
  expect((await write($, 'E:\\p\\log\\2025-06-12.md', '# Log\n')).deny).toContain('2025-06-12')
  expect((await bash($, "echo '# Log' > log/2025-06-12.md")).deny).toBeUndefined()
})
test('P1b (comparison): POSIX, the same retry goes through', async ($, on) => {
  world(on, {}, '/p')
  expect((await write($, '/p/log/2025-06-12.md', '# Log\n')).deny).toContain('2025-06-12')
  expect((await bash($, "echo '# Log' > log/2025-06-12.md")).deny).toBeUndefined()
})

// P2 (kind 3): "../" is not resolved (register.tsx:67): /p/sub/../notes.md is not /p/notes.md.
test('P2: from /p/sub, refused at /p/notes.md, appended again to ../notes.md, goes through', async ($, on) => {
  world(on, { '/p/notes.md': '' }, '/p/sub')
  expect((await write($, '/p/notes.md', F + '\n')).deny).toContain('2026-11-05')
  expect((await bash($, `echo '${F}' >> ../notes.md`)).deny).toBeUndefined()
})
test('P2 (comparison): from /p/sub, appended again to /p/notes.md, goes through', async ($, on) => {
  world(on, { '/p/notes.md': '' }, '/p/sub')
  expect((await write($, '/p/notes.md', F + '\n')).deny).toContain('2026-11-05')
  expect((await bash($, `echo '${F}' >> /p/notes.md`)).deny).toBeUndefined()
})

// P3 (kind 3): a `cd` earlier in the same command moves the file, but placed() joins to the
// session's directory (register.tsx:63-67; change() at :95 already knows a cd makes the path unsure).
test('P3: refused at /p/notes.md, "cd sub && echo ... >> notes.md" (a different file) is refused', async ($, on) => {
  world(on, { '/p/notes.md': '' }, '/p')
  expect((await write($, '/p/notes.md', F + '\n')).deny).toContain('2026-11-05')
  expect((await bash($, `cd sub && echo '${F}' >> notes.md`)).deny).toContain('2026-11-05')
})
test('P3 (comparison): refused at /p/notes.md, "echo ... >> sub/notes.md" is refused', async ($, on) => {
  world(on, { '/p/notes.md': '' }, '/p')
  expect((await write($, '/p/notes.md', F + '\n')).deny).toContain('2026-11-05')
  expect((await bash($, `echo '${F}' >> sub/notes.md`)).deny).toContain('2026-11-05')
})

// Tried: a failing session.cwd must not swallow the refusal.
test('tried: session.cwd throws, a future stamp in a Write is still refused', async ($, on) => {
  const w = world(on, {}, () => { throw new Error('no cwd') })
  expect((await write($, '/p/notes.md', F + '\n')).deny).toContain('2026-11-05')
  expect(w.ran).toEqual([])
})
test('tried: session.cwd throws, a relative shell append with a future stamp is still refused', async ($, on) => {
  world(on, {}, () => { throw new Error('no cwd') })
  expect((await bash($, `echo '${F}' >> notes.md`)).deny).toContain('2026-11-05')
})
test('tried: "./notes.md" and a trailing-slash cwd match the absolute refusal', async ($, on) => {
  world(on, { '/p/notes.md': '' }, '/p/')
  expect((await write($, '/p/notes.md', F + '\n')).deny).toContain('2026-11-05')
  expect((await bash($, `echo '${F}' >> ./notes.md`)).deny).toBeUndefined()
})

// P4 (kind 3): a removed line inside a fenced code block was never a stamp (newStamps skips
// fences for added lines) but its text still carries over (stamps.ts:131 reads it out of context).
const DOC = '# Notes\n\nExample:\n```\n## 2026-11-05 release\n```\n'
test('P4: replacing a fenced example with a real heading dated 2026-11-05 is refused', async ($, on) => {
  const w = world(on, { '/p/notes.md': DOC })
  const r = await edit($, '/p/notes.md', 'Example:\n```\n## 2026-11-05 release\n```', '## 2026-11-05 release')
  expect(r.deny).toContain('2026-11-05')
  expect(w.ran).toEqual([])
})
test('P4 (comparison): the same heading when the removed example is prose is refused', async ($, on) => {
  const w = world(on, { '/p/notes.md': '# Notes\n\nExample: a release heading\n' })
  const r = await edit($, '/p/notes.md', 'Example: a release heading', '## 2026-11-05 release')
  expect(r.deny).toContain('2026-11-05')
  expect(w.ran).toEqual([])
})
// Tried: duplicates. Two identical stamped lines removed, three added: one is new.
test('tried: two removed "## 2026-11-05" lines carry over two of three added', async ($, on) => {
  const w = world(on, { '/p/n.md': '## 2026-11-05 a\n## 2026-11-05 a\n' })
  const r = await edit($, '/p/n.md', '## 2026-11-05 a\n## 2026-11-05 a', '## 2026-11-05 b\n## 2026-11-05 c\n## 2026-11-05 d')
  expect(r.deny).toContain('2026-11-05')
  expect(w.ran).toEqual([])
})
