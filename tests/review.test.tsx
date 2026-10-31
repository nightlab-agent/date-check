import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { stampsIn } from '../hooks/stamps'
import { shellWrite } from '../hooks/register'

// The code review of 0.1.0 before its release (69f17c4): each finding as a test that failed there,
// beside a comparison case. Same world as tests/date-check.test.tsx.

type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]

const NOW = new Date(2026, 9, 31, 16, 1).getTime()

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
type R = Promise<{ deny?: string; context?: string[] }>
const write = ($: $T, file_path: string, content: string) => $.tool.call({ tool: 'Write', file_path, content } as never) as R
const edit = ($: $T, file_path: string, old_string: string, new_string: string) =>
  $.tool.call({ tool: 'Edit', file_path, old_string, new_string } as never) as R
const bash = ($: $T, command: string) => $.tool.call({ tool: 'Bash', command } as never) as R

// F1 (kind 3, look-alike): an Edit's new_string is judged as if it were whole lines. The
// usual minimal Edit, old "2026-10-30" -> new "2026-11-05", changes a date inside a sentence;
// the fragment starts with the date, so it reads as a "date at the start of a line".
test('F1 (review): an Edit that changes only the date inside a sentence is not refused', async ($, on) => {
  const w = world(on, { '/p/PLAN.md': 'The launch is planned for 2026-10-30, after review.\n' })
  const r = await edit($, '/p/PLAN.md', '2026-10-30', '2026-11-05')
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Edit'])
})
test('F1 (review, comparison): the same change with the whole sentence as old/new goes through', async ($, on) => {
  const w = world(on, { '/p/PLAN.md': 'The launch is planned for 2026-10-30, after review.\n' })
  const r = await edit($, '/p/PLAN.md', 'The launch is planned for 2026-10-30, after review.', 'The launch is planned for 2026-11-05, after review.')
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Edit'])
})

// F2 (kind 3): "anything in a code block" is not judged, but the fence is only seen when the
// call's own added lines carry it. A line added inside a fence the file already has is judged.
const FENCED = '# Log format\n\n```\n2030-01-01 sample log line\n```\n'
test('F2 (review): an Edit adding a sample line inside an existing code fence is not refused', async ($, on) => {
  const w = world(on, { '/p/README.md': FENCED })
  const r = await edit($, '/p/README.md', '2030-01-01 sample log line\n', '2030-01-01 sample log line\n2030-01-02 second sample line\n')
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Edit'])
})
test('F2 (review): a Write: the same new line, the rest of the file unchanged', async ($, on) => {
  const w = world(on, { '/p/README.md': FENCED })
  const r = await write($, '/p/README.md', FENCED.replace('line\n```', 'line\n2030-01-02 second sample line\n```'))
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Write'])
})
test('F2 (review, comparison): the same fenced block written whole (fence lines added too) goes through', async ($, on) => {
  const w = world(on)
  const r = await write($, '/p/README.md', '# Log format\n\n```\n2030-01-01 sample log line\n2030-01-02 second sample line\n```\n')
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Write'])
})

// F3 (kind 3): the label list has no word boundary before it: "Due date:", "End date:",
// "due_date:", "{ date: '...' }" all read as the stamp field "date:".
test('F3 (review): "Due date:", "due_date:" and a code fixture { date: ... } are not stamps', () => {
  expect(stampsIn('Due date: 2026-12-01\n')).toEqual([])
  expect(stampsIn('due_date: 2026-12-01\n')).toEqual([])
  expect(stampsIn("const sub = { plan: 'pro', date: '2030-01-01' }\n")).toEqual([])
})
test('F3 (review, end to end): a todo with "Due date: 2026-12-01" is refused', async ($, on) => {
  const w = world(on)
  const r = await write($, '/p/TODO.md', '- [ ] file taxes\n  Due date: 2026-12-01\n')
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Write'])
})
test('F3 (review, comparison): "Deadline: 2026-12-01" (a label not in the list) goes through', async ($, on) => {
  const w = world(on)
  const r = await write($, '/p/TODO.md', '- [ ] file taxes\n  Deadline: 2026-12-01\n')
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Write'])
})

// F4 (kinds 3/4): any ">" makes a Bash command a "file write". Claude Code's own commit form
// carries "<noreply@anthropic.com>", so a commit message heredoc is judged as a file's text.
const commit = (trailer: string) =>
  `git commit -m "$(cat <<'EOF'\nPrepare 0.2.0\n\nRelease date: 2026-11-03\n\nCo-Authored-By: Claude${trailer}\nEOF\n)"`
test('F4 (review): a git commit (no file written) with a planned release date is not refused', async ($, on) => {
  const w = world(on)
  expect(shellWrite(commit(' <noreply@anthropic.com>'))).toBeUndefined()
  const r = await bash($, commit(' <noreply@anthropic.com>'))
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Bash'])
})
test('F4 (review): an echo to the terminal is judged when a later command redirects', async ($, on) => {
  const w = world(on)
  const r = await bash($, `echo "Release date: 2026-11-03" && npm run build > build.log`)
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Bash'])
})
test('F4 (review, comparison): the same commit without the <email> trailer goes through', async ($, on) => {
  const w = world(on)
  const r = await bash($, commit(''))
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Bash'])
})

// F5 (kind 3): "meant" is keyed on file + stamp text, not the line. One refused heading
// makes every later future use of that date in the file pass unrefused, a new mistake too.
test('F5 (review): a different line with the same future date, never refused itself, is refused', async ($, on) => {
  const w = world(on)
  await edit($, '/p/CHANGELOG.md', '# Changelog\n', '# Changelog\n\n## [2.0.0] - 2026-11-03\n')
  const r = await edit($, '/p/CHANGELOG.md', '# Changelog\n', '# Changelog\n\nUpdated: 2026-11-03\n')
  expect(r.deny).toContain('2026-11-03')
  expect(w.ran).toEqual([])
})
test('F5 (review, comparison): the same line in another file is refused', async ($, on) => {
  const w = world(on)
  await edit($, '/p/CHANGELOG.md', '# Changelog\n', '# Changelog\n\n## [2.0.0] - 2026-11-03\n')
  const r = await edit($, '/p/NOTES.md', '# Notes\n', '# Notes\n\nUpdated: 2026-11-03\n')
  expect(r.deny).toContain('2026-11-03')
  expect(w.ran).toEqual([])
})

// F6 (kind 3): an Edit that changes words on a line the file already had re-judges the
// line's old stamp; README: "any line the file already had" is not judged.
const PLANNED = '# Changelog\n\n## [Unreleased] - 2026-11-03\n- new flag\n'
test('F6 (review): renaming "[Unreleased]" to "[2.0.0]" on a heading already dated 2026-11-03 is not refused', async ($, on) => {
  const w = world(on, { '/p/CHANGELOG.md': PLANNED })
  const r = await edit($, '/p/CHANGELOG.md', '## [Unreleased] - 2026-11-03', '## [2.0.0] - 2026-11-03')
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Edit'])
})
test('F6 (review, comparison): adding an item under that same heading goes through', async ($, on) => {
  const w = world(on, { '/p/CHANGELOG.md': PLANNED })
  const r = await edit($, '/p/CHANGELOG.md', '- new flag\n', '- new flag\n- faster start\n')
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Edit'])
})

// F7 (kind 2): two parallel calls with the same future stamp. The meant check runs after an
// await (fs.read), so the second call sees the first's refusal and passes, never refused.
test('F7 (review): two parallel Writes of the same future stamp to one file are both refused', async ($, on) => {
  const w = world(on, { '/p/log.md': '# log\n' })
  const [a, b] = await Promise.all([
    write($, '/p/log.md', '# log\n## 2026-10-31 18:00 done\n'),
    write($, '/p/log.md', '# log\n## 2026-10-31 18:00 done\n'),
  ])
  expect([a.deny !== undefined, b.deny !== undefined]).toEqual([true, true])
  expect(w.ran).toEqual([])
})
test('F7 (review, comparison): the same two Writes one after the other: refused, then kept', async ($, on) => {
  const w = world(on, { '/p/log.md': '# log\n' })
  const a = await write($, '/p/log.md', '# log\n## 2026-10-31 18:00 done\n')
  const b = await write($, '/p/log.md', '# log\n## 2026-10-31 18:00 done\n')
  expect([a.deny !== undefined, b.deny !== undefined]).toEqual([true, false])
  expect(w.ran).toEqual(['Write'])
})

// F8 (kind 3): an indented (4-space) Markdown code block is a code block, but is judged.
test('F8 (review): a sample line in an indented code block is not refused', async ($, on) => {
  const w = world(on)
  const r = await write($, '/p/README.md', 'Log format:\n\n    2030-01-01 12:00 sample line\n')
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Write'])
})
test('F8 (review, comparison): the same sample in a fenced block goes through', async ($, on) => {
  const w = world(on)
  const r = await write($, '/p/README.md', 'Log format:\n\n```\n2030-01-01 12:00 sample line\n```\n')
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Write'])
})

// F9 (kind 3, by design per README but a false block): an agenda file named for a future day.
test('F9 (review): an agenda prepared today for 2026-11-05 (bare times) is not refused', async ($, on) => {
  const w = world(on)
  const r = await write($, '/p/agenda/2026-11-05.md', '- 09:00 standup\n- 10:30 design review\n')
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Write'])
})
test('F9 (review, comparison): the same agenda in a file named for today, past times', async ($, on) => {
  const w = world(on)
  const r = await write($, '/p/agenda/2026-10-31.md', '- 09:00 standup\n- 10:30 design review\n')
  expect(r.deny).toBeUndefined()
  expect(w.ran).toEqual(['Write'])
})
