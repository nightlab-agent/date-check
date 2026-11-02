import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// Bugs found in a second review of 0.1.5 before its release. Same in-memory world as tests/date-check.test.tsx.
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
const editAll = ($: $T, file_path: string, old_string: string, new_string: string) =>
  $.tool.call({ tool: "Edit", file_path, old_string, new_string, replace_all: true } as never) as R


const F = "## 2026-11-05 release"
// Q1 (kind 3, regression of 9fd973d): line identity is keyed by fence parity (stamps.ts:118-128). An
// edit that closes an earlier unclosed fence (or removes a sample whose ~~~ closed a ``` block)
// flips parity for every line below; their stamps were never stamps in `before` (read as code),
// so none carry over (stamps.ts:142-145) and an untouched planned heading below is refused.
const OPEN = '# Notes\n\n```sh\nnpm i\n\n## 2026-12-01 planned release\n'
test('Q1: closing an unclosed fence refuses an untouched planned heading below it', async ($, on) => {
  const w = world(on, { '/p/n.md': OPEN })
  const r = await edit($, '/p/n.md', 'npm i\n', 'npm i\n```\n')
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Edit'])
})
test('Q1 (comparison): adding a closed code block above the same heading goes through', async ($, on) => {
  const w = world(on, { '/p/n.md': '# Notes\n\n## 2026-12-01 planned release\n' })
  const r = await edit($, '/p/n.md', '# Notes\n', '# Notes\n```sh\nnpm i\n```\n')
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Edit'])
})
const MIX = '# Notes\n\n```md\n~~~\nx\n~~~\n```\n\n## 2026-12-01 planned release\n'
test('Q1b: removing a ``` sample that shows ~~~ refuses the untouched heading below', async ($, on) => {
  const w = world(on, { '/p/n.md': MIX })
  const r = await edit($, '/p/n.md', '```md\n~~~\nx\n~~~\n```\n', '')
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Edit'])
})
test('Q1b (comparison): removing a plain ``` sample goes through', async ($, on) => {
  const w = world(on, { '/p/n.md': '# Notes\n\n```md\nx\n```\n\n## 2026-12-01 planned release\n' })
  const r = await edit($, '/p/n.md', '```md\nx\n```\n', '')
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Edit'])
})

// Q2 (kind 3): after a cd the path is kept as typed (register.tsx:70), so "notes.md" under two
// different cds is one key: refused in a/, the same line to b/notes.md goes through unrefused.
test('Q2: refused via "cd a && ... >> notes.md", "cd b && ... >> notes.md" goes through unrefused', async ($, on) => {
  world(on, {}, '/p')
  expect((await bash($, `cd a && echo '${F}' >> notes.md`)).deny).toContain('2026-11-05')
  expect((await bash($, `cd b && echo '${F}' >> notes.md`)).deny).toContain('2026-11-05')
})
test('Q2 (comparison): refused at a/notes.md, b/notes.md (no cd) is refused', async ($, on) => {
  world(on, {}, '/p')
  expect((await bash($, `echo '${F}' >> a/notes.md`)).deny).toContain('2026-11-05')
  expect((await bash($, `echo '${F}' >> b/notes.md`)).deny).toContain('2026-11-05')
})
// Q3 (kind 3): movesDir (register.tsx:62) misses a cd in a subshell "(cd sub && ...)": P3 again.
test('Q3: refused at /p/notes.md, "(cd sub && echo ... >> notes.md)" is refused', async ($, on) => {
  world(on, { '/p/notes.md': '' }, '/p')
  expect((await write($, '/p/notes.md', F + '\n')).deny).toContain('2026-11-05')
  expect((await bash($, `(cd sub && echo '${F}' >> notes.md)`)).deny).toContain('2026-11-05')
})
test('Q3 (comparison): the same without parentheses is refused', async ($, on) => {
  world(on, { '/p/notes.md': '' }, '/p')
  expect((await write($, '/p/notes.md', F + '\n')).deny).toContain('2026-11-05')
  expect((await bash($, `cd sub && echo '${F}' >> notes.md`)).deny).toContain('2026-11-05')
})
// Q4 (kind 3, minor): UNC paths are not case-folded, drive paths are (register.tsx:87).
test('Q4: refused at \\\\srv\\Share\\n.md, retried at \\\\srv\\share\\n.md goes through', async ($, on) => {
  world(on, {}, 'E:\\p')
  expect((await write($, '\\\\srv\\Share\\n.md', F + '\n')).deny).toContain('2026-11-05')
  expect((await write($, '\\\\srv\\share\\n.md', F + '\n')).deny).toBeUndefined()
})
test('Q4 (comparison): E:\\P\\n.md then e:\\p\\n.md goes through', async ($, on) => {
  world(on, {}, 'E:\\p')
  expect((await write($, 'E:\\P\\n.md', F + '\n')).deny).toContain('2026-11-05')
  expect((await write($, 'e:\\p\\n.md', F + '\n')).deny).toBeUndefined()
})

// Tried (expected to pass)
test('tried: Windows cwd with forward slashes, relative retry matches', async ($, on) => {
  world(on, {}, 'E:/p')
  expect((await write($, 'E:\\p\\n.md', F + '\n')).deny).toContain('2026-11-05')
  expect((await bash($, `echo '${F}' >> n.md`)).deny).toBeUndefined()
})
test('tried: POSIX case is kept: /p/N.md is not /p/n.md', async ($, on) => {
  world(on, {}, '/p')
  expect((await write($, '/p/N.md', F + '\n')).deny).toContain('2026-11-05')
  expect((await write($, '/p/n.md', F + '\n')).deny).toContain('2026-11-05')
})
test('tried: pushd moves the path as cd does', async ($, on) => {
  world(on, { '/p/notes.md': '' }, '/p')
  expect((await write($, '/p/notes.md', F + '\n')).deny).toContain('2026-11-05')
  expect((await bash($, `pushd sub && echo '${F}' >> notes.md`)).deny).toContain('2026-11-05')
})
test('tried: a stamp line edited only in whitespace carries over', async ($, on) => {
  world(on, { '/p/n.md': '## 2026-12-01 release\n' })
  expect((await edit($, '/p/n.md', '## 2026-12-01 release', '##  2026-12-01 release ')).deny).toBeUndefined()
})
test('tried: replace_all over two stamped lines carries both', async ($, on) => {
  world(on, { '/p/n.md': '## 2026-12-01 a x\ntext\n## 2026-12-01 a x\n' })
  expect((await editAll($, '/p/n.md', 'a x', 'a y')).deny).toBeUndefined()
})
test('tried: indented code moved to prose is refused', async ($, on) => {
  world(on, { '/p/n.md': '# N\n\n    ## 2026-12-01 release\n' })
  expect((await edit($, '/p/n.md', '    ## 2026-12-01 release', '## 2026-12-01 release')).deny).toContain('2026-12-01')
})
