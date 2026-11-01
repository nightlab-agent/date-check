import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { judge, stampsIn } from '../hooks/stamps'

// Review of the 0.1.2 change (zone names, the repeated hour). Same world as the repo's tests.
type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]
type R = Promise<{ deny?: string; context?: string[] }>
const world = (on: On, files: Record<string, string> = {}, now: number) => {
  const fs = new Map(Object.entries(files))
  const ran: string[] = []
  mock.clock(on, { now })
  on('fs.exists', (_, e) => ({ value: fs.has(e.path) }))
  on('fs.read', (_, e) => { const t = fs.get(e.path); if (t === undefined) throw new Error('ENOENT'); return { value: t } })
  on('tool.call', (_, e) => { ran.push((e as unknown as { tool: string }).tool); return { result: 'ok' } as never })
  return { fs, ran }
}
const write = ($: $T, file_path: string, content: string) => $.tool.call({ tool: 'Write', file_path, content } as never) as R
const bash = ($: $T, command: string) => $.tool.call({ tool: 'Bash', command } as never) as R
const newYork = (ms: number) => (ms < Date.UTC(2026, 10, 1, 6) ? -240 : -300)
const clock0626Z = Date.UTC(2026, 10, 1, 6, 26)
const clock1505Z = Date.UTC(2026, 10, 1, 15, 5) // 10:05 EST

// R1: the field pattern is case-blind ('i'), so "utc" is captured, misses ZONES, and offsetOf throws.
test('R1 (zones review): a lowercase zone in a field does not switch the check off for the whole write', async ($, on) => {
  const w = world(on, {}, clock0626Z)
  const r = await write($, '/p/notes/status.md', 'Updated: 2026-11-01 06:26 utc\n- 2026-11-01T09:00Z deploy done\n')
  expect(r.deny).toContain('"2026-11-01T09:00Z"')
  expect(w.ran).toEqual([])
})
test('R1 (zones review, comparison): the same write with "UTC" refuses the future line', async ($, on) => {
  const w = world(on, {}, clock0626Z)
  const r = await write($, '/p/notes/status.md', 'Updated: 2026-11-01 06:26 UTC\n- 2026-11-01T09:00Z deploy done\n')
  expect(r.deny).toContain('"2026-11-01T09:00Z"')
  expect(w.ran).toEqual([])
})
test('R1 (zones review): stampsIn does not throw on "Date: 2026-11-01 06:26 est"', () => {
  expect(() => stampsIn('Date: 2026-11-01 06:26 est')).not.toThrow()
})

// R2: "UTC+2" stops at UTC (lookahead only refuses letters), so 08:00 UTC+2 is read as 08:00Z.
test('R2 (zones review): "08:00 UTC+2" written at 06:05Z (08:05 in UTC+2) is not refused', () => {
  expect(judge(stampsIn('Updated: 2026-11-01 08:00 UTC+2'), Date.UTC(2026, 10, 1, 6, 5), undefined, newYork)).toEqual([])
})
test('R2 (zones review, comparison): "08:00 +02:00" at the same moment is not refused', () => {
  expect(judge(stampsIn('Updated: 2026-11-01 08:00 +02:00'), Date.UTC(2026, 10, 1, 6, 5), undefined, newYork)).toEqual([])
})

// R3: timeOpening now takes ZONE, whose [+-]\d{2}:?\d{2} eats the end of a time range.
test('R3 (zones review): a log line "- 10:00-11:30 standup" is not read as offset -11:30', () => {
  expect(stampsIn('- 10:00-11:30 standup', '2026-11-01')[0]).not.toHaveProperty('offset')
  expect(judge(stampsIn('- 10:00-11:30 standup', '2026-11-01'), clock1505Z, undefined, newYork)).toEqual([])
})
test('R3 (zones review, comparison): "- 10:00 - 11:30 standup" at 10:05 EST is fine', () => {
  expect(judge(stampsIn('- 10:00 - 11:30 standup', '2026-11-01'), clock1505Z, undefined, newYork)).toEqual([])
})
test('R3 (zones review): the shell append "echo 10:00-11:30 standup >> log" at 10:05 EST goes through', async ($, on) => {
  const w = world(on, {}, clock1505Z)
  const r = await bash($, `echo "10:00-11:30 standup" >> /p/log/2026-11-01.md`)
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Bash'])
})
test('R3 (zones review, comparison): the same append with spaces round the dash goes through', async ($, on) => {
  const w = world(on, {}, clock1505Z)
  const r = await bash($, `echo "10:00 - 11:30 standup" >> /p/log/2026-11-01.md`)
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Bash'])
})

// R4: "Z" has no letter guard, unlike the names: "Zoom" reads as UTC (pre-existing in STAMP).
test('R4 (zones review): "- 2026-11-01 10:00 Zoom with Ana" at 10:05 EST is not called old', () => {
  expect(judge(stampsIn('- 2026-11-01 10:00 Zoom with Ana'), clock1505Z, undefined, newYork)).toEqual([])
})
test('R4 (zones review, comparison): "- 2026-11-01 10:00 Meeting with Ana" at 10:05 EST is fine', () => {
  expect(judge(stampsIn('- 2026-11-01 10:00 Meeting with Ana'), clock1505Z, undefined, newYork)).toEqual([])
})

// R5: EST written in summer for Eastern time (very common) has only the -300 reading.
const july = Date.UTC(2026, 6, 1, 14, 0) // 10:00 EDT
test('R5 (zones review): "2026-07-01 10:00 EST" written at 10:00 EDT is not refused', () => {
  expect(judge(stampsIn('Updated: 2026-07-01 10:00 EST'), july, undefined, () => -240)).toEqual([])
})
test('R5 (zones review, comparison): "2026-07-01 10:00 EDT" at 10:00 EDT is fine', () => {
  expect(judge(stampsIn('Updated: 2026-07-01 10:00 EDT'), july, undefined, () => -240)).toEqual([])
})

// Tried: the spring-forward gap, 02:30 on 2026-03-08 in New York at 03:05 EDT.
const spring = (ms: number) => (ms < Date.UTC(2026, 2, 8, 7) ? -300 : -240)
test('tried (gap): "- 02:30 end" at 03:05 EDT', () => {
  expect(judge(stampsIn('- 02:30 end', '2026-03-08'), Date.UTC(2026, 2, 8, 7, 5), undefined, spring).map(v => v.kind)).toEqual(['future'])
})
