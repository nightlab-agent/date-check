import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// Which file a shell command writes to, read from its words with quotes resolved.
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

refuses('comparison: echo to a plain file', `echo "${L}" >> log.md`)
refuses('comparison: echo to a quoted file', `echo "${L}" >> "notes.md"`)
refuses('comparison: tee -a', `echo "${L}" | tee -a log.md`)
refuses('comparison: env tee -a', `echo "${L}" | env tee -a log.md`)
refuses('comparison: no space around the redirect', `echo "${L}">>log.md`)
refuses('comparison: printf with a format and the line', `printf '%s\\n' "${L}" >> log.md`)

refuses('an arrow inside the echoed text does not hide the file', `echo "${L} a -> b" >> log.md`)
refuses('a > inside the echoed text does not hide the file', `echo "${L} size > 5" >> log.md`)
refuses('a > inside single quotes does not hide the file', `echo '${L} a > b' >> log.md`)
refuses('a quoted file name with a space', `echo "${L}" >> "my notes.md"`)
refuses('an escaped space in the file name', `echo "${L}" >> my\\ notes.md`)
refuses('a heredoc to a quoted file name with a space', `cat >> "my notes.md" <<EOF\n${L}\nEOF`)
refuses('tee --append', `echo "${L}" | tee --append log.md`)
refuses('tee -a -i', `echo "${L}" | tee -a -i log.md`)
refuses('tee with two files, the log second', `echo "${L}" | tee -a out.dat log.md`)
refuses('|& into tee', `echo "${L}" |& tee -a log.md`)
refuses('an echo after a heredoc on the heredoc line', `cat > a.py <<EOF && echo "${L}" >> log.md\nbody\nEOF`)

// The same word reader must not invent a write.
passes('a quoted > with no redirect writes no file', `echo "- 2026-12-25 10:00 > notes.md"`)
passes('2>> sends only errors', `echo "${L}" 2>> log.md`)
passes('>&2 names no file', `echo "${L}" >&2`)
passes('2>&1 names no file', `echo "${L}" 2>&1`)
passes('output thrown away', `echo "${L}" > /dev/null`)
