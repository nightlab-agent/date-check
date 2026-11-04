import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// Spellings of a sed -i: how its options are read and what its scripts add.
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

const TBD = { 'log.md': '- TBD\n' }
// Options and their values.
refuses('comparison: -e with its script as the next word', `sed -i -e 's/^- TBD/${L}/' log.md`, TBD)
refuses('comparison: -i.bak', `sed -i.bak 's/^- TBD/${L}/' log.md`, TBD)
refuses('comparison: -ne with its script as the next word', `sed -i -ne 's/^- TBD/${L}/p' log.md`, TBD)
refuses('a glued -e', `sed -i -e's/^- TBD/${L}/' log.md`, TBD)
refuses('a glued -e after -n', `sed -i -n -e's/^- TBD/${L}/p' log.md`, TBD)
refuses('a glued -ne', `sed -i -ne's/^- TBD/${L}/p' log.md`, TBD)
refuses('a glued -Ee is extended', `sed -i -Ee's/^- (TBD)/${L}/' log.md`, TBD)
