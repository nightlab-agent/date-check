import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { addedLines, judge, stampsIn } from '../hooks/stamps'
import { shellWrite } from '../hooks/register'

type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]

// The clock in these tests: 2026-10-31 16:01 local time, wherever the tests run.
const NOW = new Date(2026, 9, 31, 16, 1).getTime()

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
    const x = e as unknown as { tool: string; file_path: string; old_string?: string; new_string?: string; content?: string; command?: string }
    ran.push(x.tool)
    if (x.tool === 'Write') fs.set(x.file_path, x.content!)
    if (x.tool === 'Edit') fs.set(x.file_path, (fs.get(x.file_path) ?? '').replace(x.old_string!, x.new_string!))
    return { result: 'ok' } as never
  })
  return { fs, ran }
}
const write = ($: $T, file_path: string, content: string) => $.tool.call({ tool: 'Write', file_path, content } as never) as Promise<{ deny?: string; context?: string[] }>
const edit = ($: $T, file_path: string, old_string: string, new_string: string) =>
  $.tool.call({ tool: 'Edit', file_path, old_string, new_string } as never) as Promise<{ deny?: string; context?: string[] }>
const bash = ($: $T, command: string) => $.tool.call({ tool: 'Bash', command } as never) as Promise<{ deny?: string; context?: string[] }>

// The three real mistakes (an agent's records, 2026-10-31), each at the clock it was made at.
test('real mistake 1: an order stamped 10:30 written at 11:03 goes through with a note giving the real time', async ($, on) => {
  const w = world(on, {}, new Date(2026, 9, 31, 11, 3).getTime())
  const r = await write($, '/p/notes/orders.md', '# Orders\n\n## 2026-10-31 10:30 NEW: rotate the posting slots\n')
  expect(r.deny).toBeUndefined()
  expect(r.context?.join(' ')).toContain('"2026-10-31 10:30"')
  expect(r.context?.join(' ')).toContain('2026-10-31 11:03')
  expect(w.ran).toEqual(['Write'])
})

test('real mistake 2: a tray reply stamped 15:50 written at 15:33 is refused with the real time', async ($, on) => {
  const w = world(on, {}, new Date(2026, 9, 31, 15, 33).getTime())
  const r = await edit($, '/p/tray/2026-10-31.md', '- 15:20 s240 posted\n', '- 15:20 s240 posted\n- 15:50 reply: keep the voice\n')
  expect(r.deny).toContain('"15:50"')
  expect(r.deny).toContain('2026-10-31 15:33')
  expect(w.ran).toEqual([])
})

test('real mistake 3: an order stamped 16:05, appended by the shell at 16:01, is refused', async ($, on) => {
  const w = world(on)
  const r = await bash($, `echo "2026-10-31T16:05 NEW: build a date checker" >> /p/notes/orders.log`)
  expect(r.deny).toContain('"2026-10-31T16:05"')
  expect(r.deny).toContain('2026-10-31 16:01')
  expect(w.ran).toEqual([])
})

test('comparison: the same three written at the real time go through with nothing said', async ($, on) => {
  const w = world(on)
  expect(await write($, '/p/notes/orders.md', '## 2026-10-31 16:01 NEW: post s6\n')).not.toHaveProperty('deny')
  expect((await edit($, '/p/tray/2026-10-31.md', 'a\n', 'a\n- 16:00 reply\n')).context ?? []).toEqual([])
  expect(await bash($, `echo "2026-10-31T16:02:00 ok" >> /p/log/run.log`)).not.toHaveProperty('deny')
  expect(w.ran).toEqual(['Write', 'Edit', 'Bash'])
})

// Planted: the dates agents get wrong most, a release a year back and one ahead.
test('a changelog release dated in 2024 goes through with a note giving the real date', async ($, on) => {
  world(on, { '/p/CHANGELOG.md': '# Changelog\n\n## 1.1.0 - 2026-10-20\n- old\n' })
  const r = await write($, '/p/CHANGELOG.md', '# Changelog\n\n## 1.2.0 - 2024-06-12\n- new\n\n## 1.1.0 - 2026-10-20\n- old\n')
  expect(r.deny).toBeUndefined()
  expect(r.context?.join(' ')).toContain('"2024-06-12"')
  expect(r.context?.join(' ')).toContain('2026-10-31 16:01')
  // the 1.1.0 heading was already in the file: not judged, not named
  expect(r.context?.join(' ')).not.toContain('2026-10-20')
})

test('a release dated tomorrow is refused; written again unchanged it goes through, said so', async ($, on) => {
  const w = world(on)
  const first = await edit($, '/p/CHANGELOG.md', '# Changelog\n', '# Changelog\n\n## [2.0.0] - 2026-11-03\n')
  expect(first.deny).toContain('2026-11-03')
  const again = await edit($, '/p/CHANGELOG.md', '# Changelog\n', '# Changelog\n\n## [2.0.0] - 2026-11-03\n')
  expect(again.deny).toBeUndefined()
  expect(again.context?.join(' ')).toContain('kept "2026-11-03"')
  expect(w.ran).toEqual(['Edit'])
})

test('comparison: today, and a UTC date that is already tomorrow in UTC, both pass', async ($, on) => {
  world(on)
  const utc = new Date(NOW).toISOString().slice(0, 10)
  expect(await write($, '/p/a.md', `## 1.0.0 - 2026-10-31\n\nReleased: ${utc}\n`)).not.toHaveProperty('deny')
})

test('event dates inside sentences, code fences, and lines the file already had are never judged', async ($, on) => {
  world(on, { '/p/README.md': 'Updated: 2023-01-01\n' })
  const body = 'Updated: 2023-01-01\nThe outage on 2027-05-01 is planned.\n```\n2030-01-01 sample log line\n```\n'
  const r = await write($, '/p/README.md', body)
  expect(r.deny).toBeUndefined()
  expect(r.context ?? []).toEqual([])
})

test('look-alikes: version numbers, ids and a 25:00 are not stamps', () => {
  expect(stampsIn('## 2026.11.03\n- 25:00 nope\nid: 2027-13-45\n1.2.3-2027-01-01x\n', '2026-10-31')).toEqual([])
})

test('a stamp with a zone is compared as that moment: 21:30Z is now on the east coast of America, and not ahead', () => {
  const [s] = stampsIn(`- ${new Date(NOW).toISOString().slice(0, 16)}Z started`)
  expect(judge([s!], NOW)).toEqual([])
  const [late] = stampsIn(`- ${new Date(NOW + 10 * 60000).toISOString().slice(0, 16)}Z started`)
  expect(judge([late!], NOW).map(v => v.kind)).toEqual(['future'])
})

test('two at once: one call with a future and a stale stamp is refused for the future one only', async ($, on) => {
  world(on)
  const r = await write($, '/p/log/2026-10-31.md', '- 09:00 morning check\n- 18:30 evening check\n')
  expect(r.deny).toContain('"18:30"')
  expect(r.deny).not.toContain('09:00')
})

test('a stale time today goes through with a note; with staleNotes off, nothing is said', { options: { staleNotes: false } }, async ($, on) => {
  world(on)
  const r = await write($, '/p/log/2026-10-31.md', '- 09:00 morning check\n')
  expect(r.deny).toBeUndefined()
  expect(r.context ?? []).toEqual([])
})

test('comparison: with staleNotes on (the default) the same line gets the note', async ($, on) => {
  world(on)
  const r = await write($, '/p/log/2026-10-31.md', '- 09:00 morning check\n')
  expect(r.context?.join(' ')).toContain('"09:00"')
})

test('bare times count only in a file named for a date; elsewhere a "16:30" is left alone', async ($, on) => {
  world(on)
  expect(await write($, '/p/notes/meeting.md', '- 23:30 call with the team\n')).not.toHaveProperty('deny')
})

test('shellWrite reads heredocs, echo and printf, and ignores redirects to /dev/null', () => {
  expect(shellWrite("cat >> log.md <<'EOF'\n- 16:05 x\nEOF")).toEqual({ file: 'log.md', text: '- 16:05 x' })
  expect(shellWrite('printf "%s\\n" "a" | tee -a out.log')?.file).toBe('out.log')
  expect(shellWrite('ls 2>/dev/null')).toBeUndefined()
  expect(shellWrite('git log')).toBeUndefined()
})

test('addedLines keeps a repeated line once per time it is added', () => {
  expect(addedLines('a\nb\n', 'a\nb\nb\n')).toBe('b')
})

test('only Markdown and text files are judged: a future date in code goes through', async ($, on) => {
  const w = world(on)
  expect(await write($, '/p/src/fixtures.ts', '// Updated: 2030-01-01\nexport const day = "2030-01-01"\n')).not.toHaveProperty('deny')
  expect(w.ran).toEqual(['Write'])
})

test('a changelog with no extension is judged like CHANGELOG.md', async ($, on) => {
  const w = world(on)
  const r = await write($, '/p/CHANGELOG', '## 0.2.0 (2026-11-03)\n')
  expect(r.deny).toContain('2026-11-03')
  expect(w.ran).toEqual([])
})
