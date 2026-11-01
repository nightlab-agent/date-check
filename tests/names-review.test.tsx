import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// Review of the uncommitted name check (new files named for a past day). Each finding is a test
// that fails on the change as it stands, beside a comparison case that passes. Same world as
// tests/names.test.tsx, plus a gate on fs.exists so two calls can overlap.

type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]

const NOW = new Date(2026, 10, 1, 2, 20).getTime()

const world = (on: On, files: Record<string, string> = {}, slow?: (path: string) => Promise<void> | undefined) => {
  const fs = new Map(Object.entries(files))
  const ran: string[] = []
  mock.clock(on, { now: NOW })
  on('fs.exists', async (_, e) => {
    await slow?.(e.path)
    return { value: fs.has(e.path) }
  })
  on('fs.read', (_, e) => {
    const t = fs.get(e.path)
    if (t === undefined) throw new Error('ENOENT')
    return { value: t }
  })
  on('tool.call', (_, e) => {
    const x = e as unknown as { tool: string; file_path: string; content?: string; command?: string }
    ran.push(x.tool)
    if (x.tool === 'Write') fs.set(x.file_path, x.content!)
    return { result: 'ok' } as never
  })
  return { fs, ran }
}
type R = Promise<{ deny?: string; context?: string[] }>
const write = ($: $T, file_path: string, content: string) => $.tool.call({ tool: 'Write', file_path, content } as never) as R
const bash = ($: $T, command: string) => $.tool.call({ tool: 'Bash', command } as never) as R

// N1 (look-alike paths). The mod asks fs.exists about the path as the shell command spells it;
// the engine resolves a relative path under the session's directory and does not expand `~`
// (claude-code index.d.ts 2.1.310, the `fs` block: "a relative path is under the session's
// working directory"), so a `cd x && ... >> name` or a `~/...` target reads as a NEW file even
// when the shell appends to one that exists. "Existing files are not judged" breaks.
test('N1: appending to an existing old log after a cd in the same command is not refused', async ($, on) => {
  world(on, { '/p/logs/2025-06-12.md': '# Log\n' })
  const r = await bash($, "cd /p/logs && echo '- fixed the typo' >> 2025-06-12.md")
  expect(r.deny).toBeUndefined()
})

test('N1: appending to an existing old log under ~ is not refused', async ($, on) => {
  world(on, { '/home/u/notes/2025-06-12.md': '# Notes\n' })
  const r = await bash($, "echo '- one more line' >> ~/notes/2025-06-12.md")
  expect(r.deny).toBeUndefined()
})

test('N1 (comparison): the same append spelled with the absolute path goes through', async ($, on) => {
  const w = world(on, { '/p/logs/2025-06-12.md': '# Log\n' })
  const r = await bash($, "echo '- fixed the typo' >> /p/logs/2025-06-12.md")
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Bash'])
})

// N2 (look-alike keys). The "written again" key is the path text, so the same file named once
// absolutely (Write must) and once relatively (the shell, from the project root) is two files:
// the second try is refused again.
test('N2: a file refused by name in a Write, created again by the shell from the project root, goes through', async ($, on) => {
  world(on)
  const first = await write($, '/p/logs/2025-01-15.md', '# Log\n')
  expect(first.deny).toContain('2025-01-15')
  const again = await bash($, "echo '# Log' > logs/2025-01-15.md")
  expect(again.deny).toBeUndefined()
})

test('N2 (comparison): the same retry spelled with the absolute path goes through', async ($, on) => {
  world(on)
  await write($, '/p/logs/2025-01-15.md', '# Log\n')
  const again = await bash($, "echo '# Log' > /p/logs/2025-01-15.md")
  expect(again.deny).toBeUndefined()
})

// N3 (out of order). A refusal stores `++order` over whatever the key held. A call that began
// BEFORE the first refusal but finishes after the retry began overwrites the older number with a
// newer one, so the retry (begun after the first refusal) is refused a second time.
test('N3: the retry after a refusal goes through even when an older overlapping call is refused late', async ($, on) => {
  const file = '/p/briefs/daily-brief-2025-06-12.md'
  let calls = 0
  let releaseB!: () => void, releaseC!: () => void
  const gateB = new Promise<void>(r => (releaseB = r)), gateC = new Promise<void>(r => (releaseC = r))
  world(on, {}, () => {
    calls++
    return calls === 2 ? gateB : calls === 3 ? gateC : undefined
  })
  const a = write($, file, '# Brief\n')            // begins 1
  const b = write($, file, '# Brief (other)\n')    // begins 2, held in fs.exists
  expect((await a).deny).toContain('2025-06-12')   // A refused: meant = 3
  const c = write($, file, '# Brief\n')            // the retry: begins 4, held
  releaseB()
  expect((await b).deny).toContain('2025-06-12')   // B began before A's refusal: refused, meant = 5
  releaseC()
  expect((await c).deny).toBeUndefined()           // C began after A's refusal: must go through
})

test('N3 (comparison): with no older call overlapping, the retry goes through', async ($, on) => {
  const file = '/p/briefs/daily-brief-2025-06-12.md'
  world(on)
  expect((await write($, file, '# Brief\n')).deny).toContain('2025-06-12')
  expect((await write($, file, '# Brief\n')).deny).toBeUndefined()
})
