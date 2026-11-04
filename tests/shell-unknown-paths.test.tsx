import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// A path the shell works out when it runs (a glob, a variable): nothing here knows the file behind it.
// Clock 2026-10-31 16:01 local; 18:30 that day is in the future.
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
}
const bash = ($: $T, command: string) => $.tool.call({ tool: 'Bash', command } as never) as Promise<{ deny?: string }>
const L = '- 2026-10-31 18:30 deploy'
const refuses = (name: string, command: string, files: Record<string, string> = {}) =>
  test(name, async ($, on) => {
    world(on, files)
    expect((await bash($, command)).deny).toContain('18:30')
  })
const passes = (name: string, command: string, files: Record<string, string> = {}) =>
  test(name, async ($, on) => {
    world(on, files)
    expect((await bash($, command)).deny).toBeUndefined()
  })

refuses('comparison: sed -i on a named file', `sed -i 's/^- TBD/${L}/' log.md`, { 'log.md': '- TBD\n' })
refuses('comparison: sed -i under ~', `sed -i 's/^- TBD/${L}/' ~/log.md`)
passes('comparison: sed -i on a named file that does not exist writes nothing', `sed -i 's/^- TBD/${L}/' log.md`)
refuses('sed -i on a glob', `sed -i 's/^- TBD/${L}/' *.md`, { 'log.md': '- TBD\n' })
refuses('sed -i on a variable path', `sed -i 's/^- TBD/${L}/' "$HOME/log.md"`)
refuses('sed -i on a variable folder, no file behind it here', `sed -i 's/TBD/2026-10-31 18:30/' "$LOG_DIR/today.md"`)
refuses('sed -i on a command in the path', 'sed -i "s/TBD/2026-10-31 18:30/" `pwd`/log.md')
passes('comparison: sed -i on a glob of code is not judged', `sed -i 's/^- TBD/${L}/' *.py`)

// The name check is for a new file: behind a variable, nothing says it is new.
test('comparison: a new file named for a past day is refused', async ($, on) => {
  world(on)
  expect((await bash($, `echo "note" >> 2025-06-12.md`)).deny).toContain('2025-06-12')
})
passes('comparison: the same day under ~ is not taken for new', `echo "note" >> ~/2025-06-12.md`)
passes('the same day behind a variable is not taken for new', `echo "note" >> $HOME/2025-06-12.md`, { '2025-06-12.md': 'x\n' })
passes('the same day behind a variable, with no file seen', `echo "note" >> "$LOG_DIR/2025-06-12.md"`)
