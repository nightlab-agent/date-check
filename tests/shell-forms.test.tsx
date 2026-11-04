import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// How a shell command is read before the writes in it are judged: its text, what stands before the
// command word, comments and quotes.
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

// The text an echo prints, quoted or not.
refuses('comparison: quoted echo', `echo "${L}" >> log.md`)
refuses('comparison: echo -e with a new line in it', `echo -e "x\\n${L}" >> log.md`)
refuses('an unquoted echo', `echo ${L} >> log.md`)
refuses('an unquoted echo with no bullet', `echo 2026-10-31 18:30 deploy >> log.md`)
refuses('an unquoted echo to a quoted file', `echo ${L} >> "log.md"`)
refuses('an unquoted echo with one quoted word', `echo ${L} "now" >> log.md`)
refuses('an unquoted echo -n', `echo -n ${L} >> log.md`)
passes('comparison: a stamp that is not the opening word stays a sentence', `echo Deploy on 2026-12-25 18:30 >> log.md`)
