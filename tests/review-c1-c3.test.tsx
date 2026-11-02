import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// Critic pass 2026-11-02 (code-reviewer). Same in-memory world as tests/date-check.test.tsx.
type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]
const NOW = new Date(2026, 10, 2, 10, 0).getTime() // 2026-11-02 10:00 local

const world = (on: On, files: Record<string, string> = {}) => {
  const fs = new Map(Object.entries(files))
  const ran: string[] = []
  mock.clock(on, { now: NOW })
  on('session.cwd', () => ({ value: '/p' }))
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

// C1 (kind 3, look-alikes): the name check's "written again" key is the bare file name
// (register.tsx:213), so a refusal for one folder's 2025-06-12.md lets a different new file of
// the same name in another folder through unrefused, with "kept ... as written the second time".
test('C1: a new misnamed file in another folder, never refused itself, is refused', async ($, on) => {
  const w = world(on)
  expect((await write($, '/p/log/2025-06-12.md', '# Log\n')).deny).toContain('2025-06-12')
  const r = await write($, '/p/journal/2025-06-12.md', '# Journal\n')
  expect(r.deny).toContain('2025-06-12')
  expect(w.ran).toEqual([])
})
test('C1 (comparison): the same second file with no earlier refusal is refused', async ($, on) => {
  const w = world(on)
  const r = await write($, '/p/journal/2025-06-12.md', '# Journal\n')
  expect(r.deny).toContain('2025-06-12')
  expect(w.ran).toEqual([])
})

// C2 (kind 3, look-alikes): newStamps drops any new stamp whose text appears anywhere in a
// removed line (stamps.ts:128-129), so a date mentioned in a sentence that the edit removes
// is taken for the same stamp: a release heading dated in the future then goes through.
const PLAN = '# Changelog\n\n## [Unreleased]\n- Release planned for 2026-11-05\n'
test('C2: turning "planned for 2026-11-05" into a release heading dated 2026-11-05 is refused', async ($, on) => {
  const w = world(on, { '/p/CHANGELOG.md': PLAN })
  const r = await edit($, '/p/CHANGELOG.md', '## [Unreleased]\n- Release planned for 2026-11-05', '## [1.0.0] - 2026-11-05\n- First release')
  expect(r.deny).toContain('2026-11-05')
  expect(w.ran).toEqual([])
})
test('C2 (comparison): the same heading when the removed line names no date is refused', async ($, on) => {
  const w = world(on, { '/p/CHANGELOG.md': '# Changelog\n\n## [Unreleased]\n- Release planned for next week\n' })
  const r = await edit($, '/p/CHANGELOG.md', '## [Unreleased]\n- Release planned for next week', '## [1.0.0] - 2026-11-05\n- First release')
  expect(r.deny).toContain('2026-11-05')
  expect(w.ran).toEqual([])
})

// C3 (kind 3, the same file seen as two): the stamp key is the path text (register.tsx:209),
// unlike the name key, so a future stamp refused in a Write (absolute path) and written again by
// the shell from the project root (relative path) is refused a second time, against the refusal's
// own promise "write the same text again and it goes through" (register.tsx:94).
test('C3: a future stamp refused in a Write, appended again by the shell relatively, goes through', async ($, on) => {
  world(on, { '/p/notes.md': '' })
  expect((await write($, '/p/notes.md', '## 2026-11-05 release\n')).deny).toContain('2026-11-05')
  const r = await bash($, "echo '## 2026-11-05 release' >> notes.md")
  expect(r.deny).toBeUndefined()
})
test('C3 (comparison): the same retry spelled with the absolute path goes through', async ($, on) => {
  world(on, { '/p/notes.md': '' })
  expect((await write($, '/p/notes.md', '## 2026-11-05 release\n')).deny).toContain('2026-11-05')
  const r = await bash($, "echo '## 2026-11-05 release' >> /p/notes.md")
  expect(r.deny).toBeUndefined()
})
