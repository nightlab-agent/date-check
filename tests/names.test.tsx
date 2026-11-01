import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { judgeName } from '../hooks/stamps'

type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]

// The clock in these tests: 2026-11-01 02:20 local time, wherever the tests run.
const NOW = new Date(2026, 10, 1, 2, 20).getTime()

// A project in memory; each tool that gets past the mod writes into it.
const world = (on: On, files: Record<string, string> = {}, now = NOW) => {
  const fs = new Map(Object.entries(files))
  const ran: string[] = []
  mock.clock(on, { now })
  on('fs.exists', (_, e) => ({ value: fs.has(e.path) }))
  on('fs.read', (_, e) => {
    const t = fs.get(e.path)
    if (t === undefined) throw new Error('ENOENT')
    return { value: t }
  })
  on('tool.call', (_, e) => {
    const x = e as unknown as { tool: string; file_path: string; content?: string; command?: string }
    ran.push(x.tool)
    if (x.tool === 'Write') fs.set(x.file_path, x.content!)
    if (x.tool === 'Bash') {
      const m = /> *(\S+)\s*$/.exec(x.command!)
      if (m) fs.set(m[1]!, 'x')
    }
    return { result: 'ok' } as never
  })
  return { fs, ran }
}
type R = Promise<{ deny?: string; context?: string[] }>
const write = ($: $T, file_path: string, content: string) => $.tool.call({ tool: 'Write', file_path, content } as never) as R
const bash = ($: $T, command: string) => $.tool.call({ tool: 'Bash', command } as never) as R

// Planted: the agent names the day's brief for the day it guessed, one near its training.
test('a new daily brief named for a past day is refused once with the real date', async ($, on) => {
  const w = world(on)
  const r = await write($, '/p/briefs/daily-brief-2025-06-12.md', '# Brief\n\nNothing new.\n')
  expect(r.deny).toContain("the new file's name says 2025-06-12")
  expect(r.deny).toContain('2026-11-01 02:20')
  expect(w.fs.has('/p/briefs/daily-brief-2025-06-12.md')).toBe(false)
})

test('the same file written again after the refusal goes through, with a note', async ($, on) => {
  const w = world(on)
  await write($, '/p/briefs/daily-brief-2025-06-12.md', '# Brief\n')
  const r = await write($, '/p/briefs/daily-brief-2025-06-12.md', '# Brief\n')
  expect(r.deny).toBeUndefined()
  expect((r.context ?? []).join('\n')).toContain('kept the date 2025-06-12')
  expect(w.fs.has('/p/briefs/daily-brief-2025-06-12.md')).toBe(true)
})

test('a new file named for a later day is a plan and goes through (an agenda)', async ($, on) => {
  world(on)
  const r = await write($, '/p/agenda/2026-11-05.md', '# Agenda\n')
  expect(r.deny).toBeUndefined()
})

test('staleDays 0 refuses a new file named for yesterday', async ($, on) => {
  world(on)
  expect(judgeName('/p/logs/2026-10-31.md', NOW, { aheadMinutes: 2, staleMinutes: 30, staleDays: 0 })?.date).toBe('2026-10-31')
})

// Planted: a shell redirect creating a misnamed file.
test('a shell echo creating a misnamed log is refused', async ($, on) => {
  const w = world(on)
  const r = await bash($, "echo '# Log' > logs/2025-01-15.md")
  expect(r.deny).toContain('2025-01-15')
  expect(w.ran).not.toContain('Bash')
})

// Comparison cases: names that are right, or files that already exist.
test("today's log goes through with nothing said", async ($, on) => {
  const w = world(on)
  const r = await write($, '/p/logs/2026-11-01.md', '# Log\n')
  expect(r.deny).toBeUndefined()
  expect(r.context ?? []).toEqual([])
  expect(w.ran).toEqual(['Write'])
})

test("yesterday's log goes through (a day's record finished after midnight)", async ($, on) => {
  world(on)
  const r = await write($, '/p/logs/2026-10-31.md', '# Log\n')
  expect(r.deny).toBeUndefined()
})

test('tomorrow in UTC is not the future: 20:00 in New York is already the next day in UTC', async ($, on) => {
  world(on, {}, new Date(2026, 10, 1, 23, 30).getTime())
  const utcDay = new Date(new Date(2026, 10, 1, 23, 30).getTime()).toISOString().slice(0, 10)
  const r = await write($, `/p/logs/${utcDay}.md`, '# Log\n')
  expect(r.deny).toBeUndefined()
})

test('an old dated file that already exists is rewritten without a word about its name', async ($, on) => {
  world(on, { '/p/logs/2025-06-12.md': '# Log\n' })
  const r = await write($, '/p/logs/2025-06-12.md', '# Log\n\nfixed a typo\n')
  expect(r.deny).toBeUndefined()
  expect(r.context ?? []).toEqual([])
})

test('a date in a directory name, not the file name, is not judged', async ($, on) => {
  world(on)
  const r = await write($, '/p/runs/2025-06-12/notes.md', '# Notes\n')
  expect(r.deny).toBeUndefined()
})

test('a dated code file is not judged (a date in code is data)', async ($, on) => {
  world(on)
  const r = await write($, '/p/fixtures/sample-2020-01-01.json', '{}')
  expect(r.deny).toBeUndefined()
})

test('judgeName: past, later, today, none, not a date', async () => {
  expect(judgeName('a/2025-06-12.md', NOW)?.date).toBe('2025-06-12')
  expect(judgeName('a/2026-11-09-plan.md', NOW)).toBeUndefined()
  expect(judgeName('a/2026-11-01.md', NOW)).toBeUndefined()
  expect(judgeName('a/notes.md', NOW)).toBeUndefined()
  expect(judgeName('a/2026-13-40.md', NOW)).toBeUndefined()
})

test('the refusal names the file by its name, not its whole path', async ($, on) => {
  world(on)
  const r = await write($, '/home/someone/work/briefs/daily-brief-2025-06-12.md', '# Brief\n')
  expect(r.deny).toContain('(daily-brief-2025-06-12.md)')
  expect(r.deny).not.toContain('/home/someone')
})
