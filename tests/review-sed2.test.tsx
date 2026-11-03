import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// Review of c435484 (sed -i applied to the file's text). Clock: 2026-10-31 16:01 local, as in
// review-sed.test.tsx. Each expected result was checked against GNU sed 4.9 in scratch.
type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]
const NOW = new Date(2026, 9, 31, 16, 1).getTime()
const world = (on: On, files: Record<string, string> = {}) => {
  const fs = new Map(Object.entries(files))
  const ran: string[] = []
  // The engine hands fs.exists and fs.read the path joined to the session's directory.
  const at = (p: string) => (fs.has(p) ? p : p.split(/[/\\]/).pop()!)
  mock.clock(on, { now: NOW })
  on('fs.exists', (_, e) => ({ value: fs.has(at(e.path)) }))
  on('fs.read', (_, e) => {
    const t = fs.get(at(e.path))
    if (t === undefined) throw new Error('ENOENT')
    return { value: t }
  })
  on('tool.call', (_, e) => {
    ran.push((e as unknown as { tool: string }).tool)
    return { result: 'ok' } as never
  })
  return { fs, ran }
}
const bash = ($: $T, command: string) => $.tool.call({ tool: 'Bash', command } as never) as Promise<{ deny?: string }>

// G1 (missed, look-alike BRE/JS): in a basic sed pattern `$` not at the end is a plain `$`; JS reads it as an anchor.
// GNU sed: '- $DATE done' -> '- 2026-12-01 10:00 done'.
test('G1: sed -i replacing a $DATE placeholder with a future time in a log is refused', async ($, on) => {
  world(on, { 'log.md': '- $DATE done\n' })
  expect((await bash($, "sed -i 's/$DATE/2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})
test('G1 comparison: the same with a TBD placeholder is refused', async ($, on) => {
  world(on, { 'log.md': '- TBD done\n' })
  expect((await bash($, "sed -i 's/TBD/2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})

// G2 (missed): several text files: only the first is judged, so a future stamp sed writes into the second slips through.
test('G2: sed -i over two logs judges the one the substitution changes', async ($, on) => {
  world(on, { 'notes.md': 'nothing\n', 'log.md': '- TBD\n' })
  expect((await bash($, "sed -i 's/^- TBD/- 2026-10-31 18:30/' notes.md log.md")).deny).toContain('18:30')
})
test('G2 comparison: the log alone is refused', async ($, on) => {
  world(on, { 'log.md': '- TBD\n' })
  expect((await bash($, "sed -i 's/^- TBD/- 2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})

// G3 (look-alike flags): GNU `-iE` is -i with backup suffix "E", a basic pattern; the hook reads it as -i -E.
// GNU sed: '- (TBD)' -> '- 2026-12-01 10:00' (parens literal); '- TBD' unchanged.
test('G3: sed -iE (suffix E, basic pattern) writing a future time over "(TBD)" is refused', async ($, on) => {
  world(on, { 'log.md': '- (TBD)\n' })
  expect((await bash($, "sed -iE 's/^- (TBD)/- 2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})
test('G3 comparison: the same with -i alone is refused', async ($, on) => {
  world(on, { 'log.md': '- (TBD)\n' })
  expect((await bash($, "sed -i 's/^- (TBD)/- 2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})
test('G3b: sed -iE that changes nothing (basic pattern does not match) goes through', async ($, on) => {
  const w = world(on, { 'log.md': '- TBD\n' })
  expect(await bash($, "sed -iE 's/^- (TBD)/- 2026-10-31 18:30/' log.md")).not.toHaveProperty('deny')
  expect(w.ran).toEqual(['Bash'])
})
test('G3b comparison: sed -i -E that does match is refused', async ($, on) => {
  world(on, { 'log.md': '- TBD\n' })
  expect((await bash($, "sed -i -E 's/^- (TBD)/- 2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})

// G4 (missed): -z reads the file as one record, so \n in a pattern matches; applied per line it never does.
test('G4: sed -z -i across a newline writing a future time is refused', async ($, on) => {
  world(on, { 'log.md': 'x\n- TBD\n' })
  expect((await bash($, "sed -z -i 's/x\\n- TBD/x\\n- 2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})
test('G4 comparison: sed -z -i without the newline is refused', async ($, on) => {
  world(on, { 'log.md': 'x\n- TBD\n' })
  expect((await bash($, "sed -z -i 's/- TBD/- 2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})

// G5 (missed, look-alike): in a CRLF file sed's `.` takes the \r, JS's `.` does not, so `.*$` never matches.
test('G5: sed -i "s/TBD.*$/.../" on a CRLF log is refused', async ($, on) => {
  world(on, { 'log.md': '- TBD later\r\n' })
  expect((await bash($, "sed -i 's/TBD.*$/2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})
test('G5 comparison: the same on an LF log is refused', async ($, on) => {
  world(on, { 'log.md': '- TBD later\n' })
  expect((await bash($, "sed -i 's/TBD.*$/2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})

// G6 (missed): --expression=SCRIPT is not read as a script; the second one is taken for a file name.
test('G6: two --expression= scripts, the second writing a future time, are refused', async ($, on) => {
  world(on, { 'log.md': '- TBD\n' })
  expect((await bash($, "sed -i --expression='s/a/b/' --expression='s/^- TBD/- 2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})
test('G6 comparison: the same two scripts as -e are refused', async ($, on) => {
  world(on, { 'log.md': '- TBD\n' })
  expect((await bash($, "sed -i -e 's/a/b/' -e 's/^- TBD/- 2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})

// G7 (false refusal, two at once): a sed -i plus an echo on the same file falls back to the bare replacement.
test('G7: sed -i filling a date mid-sentence, then an echo to the same file, goes through', async ($, on) => {
  const w = world(on, { 'plan.md': 'The launch is planned for TBD.\n' })
  expect(await bash($, `sed -i 's/TBD/2026-11-20/' plan.md && echo "- noted" >> plan.md`)).not.toHaveProperty('deny')
  expect(w.ran).toEqual(['Bash'])
})
test('G7 comparison: the sed -i alone goes through', async ($, on) => {
  const w = world(on, { 'plan.md': 'The launch is planned for TBD.\n' })
  expect(await bash($, "sed -i 's/TBD/2026-11-20/' plan.md")).not.toHaveProperty('deny')
  expect(w.ran).toEqual(['Bash'])
})

// G8 (false refusal, LOW): sed reads no line in an empty file and writes nothing; the hook applies s to one empty line.
test('G8: sed -i "s/^$/.../" on an empty log goes through (sed writes nothing)', async ($, on) => {
  const w = world(on, { 'log.md': '' })
  expect(await bash($, "sed -i 's/^$/- 2026-10-31 18:30/' log.md")).not.toHaveProperty('deny')
  expect(w.ran).toEqual(['Bash'])
})
test('G8 comparison: on a log of one empty line it is refused', async ($, on) => {
  world(on, { 'log.md': '\n' })
  expect((await bash($, "sed -i 's/^$/- 2026-10-31 18:30/' log.md")).deny).toContain('18:30')
})
