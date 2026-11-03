import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// Pre-release code review of 692caf0..361a024 (sed -i). Same world as review-sed3.test.tsx.
// Clock 2026-10-31 16:01 local; 18:30 that day is in the future. GNU sed 4.9 (C.UTF-8) checked in scratch.
type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]
const NOW = new Date(2026, 9, 31, 16, 1).getTime()
const world = (on: On, files: Record<string, string> = {}) => {
  const fs = new Map(Object.entries(files))
  const at = (p: string) => (fs.has(p) ? p : p.split(/[/\\]/).pop()!)
  mock.clock(on, { now: NOW })
  on('fs.exists', (_, e) => ({ value: fs.has(at(e.path)) }))
  on('fs.read', (_, e) => {
    const t = fs.get(at(e.path))
    if (t === undefined) throw new Error('ENOENT')
    return { value: t }
  })
  on('tool.call', () => ({ result: 'ok' }) as never)
  return { fs }
}
const bash = ($: $T, command: string) => $.tool.call({ tool: 'Bash', command } as never) as Promise<{ deny?: string }>
const SED = "sed -i 's/^- TBD/- 2026-10-31 18:30/' log.md"

test('CR comparison: plain sed -i of a future time into log.md is refused', async ($, on) => {
  world(on, { 'log.md': '- TBD\n' })
  expect((await bash($, SED)).deny).toContain('18:30')
})

// CR3: a script quoted in pieces (sed and the shell join them) is read as an empty script.
test('CR3: sed -i s/\'^- TBD\'/\'- 2026-10-31 18:30\'/ log.md is refused', async ($, on) => {
  world(on, { 'log.md': '- TBD\n' })
  expect((await bash($, "sed -i s/'^- TBD'/'- 2026-10-31 18:30'/ log.md")).deny).toContain('18:30')
})
test('CR3: sed -i s/^-\\ TBD/-\\ 2026-10-31\\ 18:30/ log.md (escaped spaces) is refused', async ($, on) => {
  world(on, { 'log.md': '- TBD\n' })
  expect((await bash($, 'sed -i s/^-\\ TBD/-\\ 2026-10-31\\ 18:30/ log.md')).deny).toContain('18:30')
})

// CR4: JavaScript's . without the u flag is half an emoji; sed's . (UTF-8) is the whole one. No match = no change = passes.
test('CR4: sed -i with . over an emoji bullet, writing a future time, is refused', async ($, on) => {
  world(on, { 'log.md': '- 🚀 TBD\n' })
  expect((await bash($, "sed -i 's/^- . TBD/- 2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})
test('CR4 comparison: the same with a * bullet is refused', async ($, on) => {
  world(on, { 'log.md': '- * TBD\n' })
  expect((await bash($, "sed -i 's/^- . TBD/- 2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})
// CR4 backstop: a pattern the u flag refuses (sed reads a lone ] as a letter) is read without it; on a file with an emoji the written text is judged alone.
test('CR4: sed -i with . and a lone ] over an emoji bullet, writing a future time, is refused', async ($, on) => {
  world(on, { 'log.md': '- 🚀 TBD]\n' })
  expect((await bash($, "sed -i 's/^- . TBD]/- 2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})
test('CR4 comparison: the lone ] pattern with a * bullet is refused', async ($, on) => {
  world(on, { 'log.md': '- * TBD]\n' })
  expect((await bash($, "sed -i 's/^- . TBD]/- 2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})
