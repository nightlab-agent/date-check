import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { addedLines, judge, stampsIn } from '../hooks/stamps'

type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]

// The clock in these tests: 2026-10-31 16:01 local time, wherever the tests run.
const NOW = new Date(2026, 9, 31, 16, 1).getTime()

// A project in memory; each tool that gets past the mod writes into it.
const world = (on: On, files: Record<string, string> = {}, now = NOW) => {
  const fs = new Map(Object.entries(files))
  const ran: string[] = []
  mock.clock(on, { now })
  // The engine passes `<cwd>/name` for a relative name (seen 2026-11-02); files here are named bare.
  const at = (p: string) => (fs.has(p) ? p : p.split(/[/\\]/).pop()!)
  on('fs.exists', (_, e) => ({ value: fs.has(at(e.path)) }))
  on('fs.read', (_, e) => {
    const t = fs.get(at(e.path))
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

test('real mistake 2: a reply stamped 15:50 written at 15:33 is refused with the real time', async ($, on) => {
  const w = world(on, {}, new Date(2026, 9, 31, 15, 33).getTime())
  const r = await edit($, '/p/notes/2026-10-31.md', '- 15:20 posted\n', '- 15:20 posted\n- 15:50 reply: keep the voice\n')
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
  expect((await edit($, '/p/notes/2026-10-31.md', 'a\n', 'a\n- 16:00 reply\n')).context ?? []).toEqual([])
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

test('with staleNotes off a new file named for a past day is still refused, once', { options: { staleNotes: false } }, async ($, on) => {
  const w = world(on)
  const r = await write($, '/p/briefs/brief-2025-06-12.md', 'hello\n')
  expect(r.deny).toContain('2025-06-12')
  expect(w.ran).toEqual([])
  expect(await write($, '/p/briefs/brief-2025-06-12.md', 'hello\n')).not.toHaveProperty('deny')
  expect(w.ran).toEqual(['Write'])
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

test('the hook reads heredocs, echo and printf, and ignores redirects to /dev/null', async ($, on) => {
  const w = world(on)
  expect((await bash($, "cat >> log.md <<'EOF'\n- 2026-10-31 18:30 x\nEOF")).deny).toContain('(in: - 2026-10-31 18:30 x)')
  expect((await bash($, 'printf "%s\\n" "- 2026-10-31 18:31 a" | tee -a out.log')).deny).toContain('(in: - 2026-10-31 18:31 a)')
  expect((await bash($, 'echo "- 2026-10-31 18:32 a" > /dev/null')).deny).toBeUndefined()
  expect((await bash($, 'ls 2>/dev/null')).deny).toBeUndefined()
  expect((await bash($, 'git log')).deny).toBeUndefined()
  expect(w.ran).toEqual(['Bash', 'Bash', 'Bash'])
})

// Seen 2026-11-02: an agent put a guessed time into a record with `sed -i`, which date-check did not read.
// Under ~ the file is not read, so each of these judges the text the script writes.
test('the hook reads sed -i: the text a substitution or an append writes', async ($, on) => {
  world(on)
  expect((await bash($, "sed -i 's/^- TBD reviewed/- 2026-10-31 18:30 reviewed/' ~/log.md")).deny).toContain('(in: - 2026-10-31 18:30 reviewed)')
  expect((await bash($, "sed -i '$a - 2026-10-31 18:31 reviewed the export fix' ~/notes/log.md")).deny).toContain('(in: - 2026-10-31 18:31 reviewed the export fix)')
  expect((await bash($, 'sed -i.bak -e "235s|$|2026-10-31 18:32 checked|" ~/log.md')).deny).toContain('(in: 2026-10-31 18:32 checked)')
  expect((await bash($, "sed -i '' 's/a/- 2026-10-31 18:33 b/g' ~/log.md")).deny).toContain('18:33')
  expect((await bash($, "sed -i -E 's#x#- 2026-10-31 18:34 y#' ~/log.md && tail -1 ~/log.md")).deny).toContain('18:34')
})

test('the hook leaves sed alone when it only prints: no -i, or -n with p', async ($, on) => {
  const w = world(on, { 'log.md': 'a\n' })
  expect((await bash($, "sed 's/a/- 2026-10-31 18:30 b/' log.md")).deny).toBeUndefined()
  expect((await bash($, "sed -n '1,20p' log.md")).deny).toBeUndefined()
  expect((await bash($, "grep -n x log.md | sed 's/:/- 2026-10-31 18:30 /'")).deny).toBeUndefined()
  expect(w.ran).toEqual(['Bash', 'Bash', 'Bash'])
})

test('addedLines keeps a repeated line once per time it is added', () => {
  expect(addedLines('a\nb\n', 'a\nb\nb\n')).toBe('b')
})

test('a future time put into a log by sed -i is refused, with the real time', async ($, on) => {
  const w = world(on, { '2026-10-31.md': '- TBD reviewed the export fix\n' })
  const r = await bash($, "sed -i 's/^- TBD reviewed/- 18:30 reviewed/' 2026-10-31.md")
  expect(r.deny).toContain('"18:30"')
  expect(w.ran).toEqual([])
})

test('comparison: the same sed -i with the real time (16:01) goes through', async ($, on) => {
  const w = world(on, { '2026-10-31.md': '- TBD reviewed the export fix\n' })
  expect(await bash($, "sed -i 's/^- TBD reviewed/- 16:01 reviewed/' 2026-10-31.md")).not.toHaveProperty('deny')
  expect(w.ran).toEqual(['Bash'])
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

test('a shell line with two echos to one file judges both (seen in a preview: a blank line, then the stamped one)', async ($, on) => {
  const w = world(on)
  const cmd = `cd log && [ -n "$(tail -c1 2026-10-31.md)" ] && echo >> 2026-10-31.md; echo "- 18:30 reviewed the export fix" >> 2026-10-31.md && cat 2026-10-31.md`
  const r = await bash($, cmd)
  expect(r.deny).toContain('"18:30"')
  expect(w.ran).toEqual([])
})

// Out of order: a log line written late, with an earlier time than the line above it. The
// earlier time is judged against the clock, never against the newer line, and the newer line
// already in the file is never judged again.
test('out of order: a late entry (15:20) under a newer one (16:00) gets the stale note only', async ($, on) => {
  const w = world(on, { '/p/log/2026-10-31.md': '- 16:00 release out\n' })
  const r = await edit($, '/p/log/2026-10-31.md', '- 16:00 release out\n', '- 16:00 release out\n- 15:20 tests passed\n')
  expect(r.deny).toBeUndefined()
  expect(r.context?.join(' ')).toContain('"15:20"')
  expect(r.context?.join(' ')).not.toContain('"16:00"')
  expect(w.fs.get('/p/log/2026-10-31.md')).toBe('- 16:00 release out\n- 15:20 tests passed\n')
})
test('out of order (comparison): a late entry 15:50, inside the 30 minutes, goes through with nothing said', async ($, on) => {
  world(on, { '/p/log/2026-10-31.md': '- 16:00 release out\n' })
  const r = await edit($, '/p/log/2026-10-31.md', '- 16:00 release out\n', '- 16:00 release out\n- 15:50 tests passed\n')
  expect(r.deny).toBeUndefined()
  expect(r.context ?? []).toEqual([])
})

// The night the clocks go back (New York, 2026-11-01: 01:00 to 02:00 happens twice). A zone
// standing in for New York, so these pass wherever the tests run.
const newYork = (ms: number) => (ms < Date.UTC(2026, 10, 1, 6) ? -240 : -300)
const clock0626Z = Date.UTC(2026, 10, 1, 6, 26)

test('real mistake 4: a log line stamped "01:40 EST" written at 01:26 EST is refused (the zone name is read)', async ($, on) => {
  const w = world(on, {}, clock0626Z)
  const r = await edit($, '/p/log/2026-11-01.md', '- replies read\n', '- replies read\n- 01:40 EST session end, nothing published\n')
  expect(r.deny).toContain('"01:40 EST"')
  expect(r.deny).toMatch(/It is 2026-11-01 \d{2}:\d{2} local time, UTC[+-]\d{2}:\d{2} now/)
  expect(w.ran).toEqual([])
})

test('comparison: "01:26 EST" at 01:26 EST goes through with nothing said', async ($, on) => {
  const w = world(on, {}, clock0626Z)
  const r = await edit($, '/p/log/2026-11-01.md', 'a\n', 'a\n- 01:26 EST session end\n')
  expect(r.deny).toBeUndefined()
  expect(r.context ?? []).toEqual([])
  expect(w.ran).toEqual(['Edit'])
})

test('the repeated hour: a bare 01:40 at 01:26 EST can be the 01:40 EDT just gone, so it is neither refused nor called old', () => {
  expect(judge(stampsIn('- 01:40 end', '2026-11-01'), clock0626Z, undefined, newYork)).toEqual([])
  expect(judge(stampsIn('- 01:10 end', '2026-11-01'), clock0626Z, undefined, newYork)).toEqual([])
})

test('comparison: outside the repeated hour the same zone still judges: 00:30 (EDT) is old, 02:00 (EST) is ahead', () => {
  expect(judge(stampsIn('- 00:30 end', '2026-11-01'), clock0626Z, undefined, newYork).map(v => v.kind)).toEqual(['stale'])
  expect(judge(stampsIn('- 02:00 end', '2026-11-01'), clock0626Z, undefined, newYork).map(v => v.kind)).toEqual(['future'])
})

test('look-alikes: a name used for two zones is wrong only under both; a word after a time is not a zone', () => {
  // CST: 16:00 in Chicago is 22:00Z, in China 08:00Z; at 08:00Z the China reading is now.
  expect(judge(stampsIn('2026-11-01 16:00 CST built'), Date.UTC(2026, 10, 1, 8), undefined, newYork)).toEqual([])
  expect(stampsIn('- 01:40 ESTIMATE', '2026-11-01')[0]).not.toHaveProperty('zone')
  expect(stampsIn('Updated: 2026-11-01 06:26 UTC')[0]).toMatchObject({ text: '2026-11-01 06:26 UTC', zone: 'UTC' })
})
