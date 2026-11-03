import { expect, test } from 'claude-code/testing'
import { applySed, shellParts } from '../hooks/sed'

// applySed: the file's text after the s commands, as GNU sed leaves it; undefined where we do not read sed the same way.
const T = 'one TBD\n- TBD two\nthree TBD TBD\n'
test('applySed: s replaces the first match on each line', () => {
  expect(applySed(T, ['s/TBD/X/'], false)).toBe('one X\n- X two\nthree X TBD\n')
})
test('applySed: g replaces every match, I ignores case', () => {
  expect(applySed(T, ['s/tbd/X/gI'], false)).toBe('one X\n- X two\nthree X X\n')
})
test('applySed: a basic \\( \\) group and \\1, & for the match', () => {
  expect(applySed('- TBD\n', ['s/^\\(- \\)TBD/\\118:30 [&]/'], false)).toBe('- 18:30 [- TBD]\n')
})
test('applySed: -E groups', () => {
  expect(applySed('a1 b2\n', ['s/([a-z])([0-9])/\\2\\1/g'], true)).toBe('1a 2b\n')
})
test('applySed: in a basic pattern ( + ? | are letters', () => {
  expect(applySed('f(x)+1?\n', ['s/(x)+1?/y/'], false)).toBe('fy\n')
})
test('applySed: a line number, $ and a /pattern/ address', () => {
  expect(applySed(T, ['2s/TBD/X/'], false)).toBe('one TBD\n- X two\nthree TBD TBD\n')
  expect(applySed(T, ['$s/TBD/X/'], false)).toBe('one TBD\n- TBD two\nthree X TBD\n')
  expect(applySed(T, ['/^-/s/TBD/X/'], false)).toBe('one TBD\n- X two\nthree TBD TBD\n')
})
test('applySed: [[:digit:]] and a backslash inside brackets', () => {
  expect(applySed('v12 a\\b\n', ['s/[[:digit:]]\\+/N/; s/[\\]/|/'], false)).toBe('vN a|b\n')
})
test('applySed: another delimiter, escaped inside', () => {
  expect(applySed('a|b\n', ['s|a\\|b|c|'], false)).toBe('c\n')
})
test('applySed: no trailing new line stays without one', () => {
  expect(applySed('x', ['s/x/y/'], false)).toBe('y')
})
test('applySed: what it does not read returns undefined (the written text is judged instead)', () => {
  expect(applySed(T, ['1,2s/TBD/X/'], false)).toBeUndefined() // a range
  expect(applySed(T, ['s/TBD/X/2'], false)).toBeUndefined() // the Nth match
  expect(applySed(T, ['s/TBD/X/w out.txt'], false)).toBeUndefined()
  expect(applySed(T, ['/x/d'], false)).toBeUndefined()
  expect(applySed(T, ['a - 18:30 added'], false)).toBeUndefined()
  expect(applySed(T, ['s//X/'], false)).toBeUndefined() // the last pattern again
  expect(applySed(T, ['s/[[:foo:]]/X/'], false)).toBeUndefined()
})
test('shellParts: ; && || and new lines cut only outside quotes', () => {
  expect(shellParts(`sed -i 's/a/b/; s/c/d/' f.md && echo "x; y" >> l.md || true\nls`)).toEqual([
    `sed -i 's/a/b/; s/c/d/' f.md `, ` echo "x; y" >> l.md `, ` true`, `ls`,
  ])
})

// Through the hook, on a file that exists: the applied text is judged, so a stamp the sed puts at a line's start is still refused.
import { mock } from 'claude-code/testing'
test('a sed -i that opens a log line with a future time is refused on the applied text', async ($, on) => {
  const fs = new Map([['2026-10-31.md', '- 15:00 kept\n- TBD shipped\n']])
  const at = (p: string) => (fs.has(p) ? p : p.split(/[/\\]/).pop()!)
  mock.clock(on, { now: new Date(2026, 9, 31, 16, 1).getTime() })
  on('fs.exists', (_, e) => ({ value: fs.has(at(e.path)) }))
  on('fs.read', (_, e) => ({ value: fs.get(at(e.path))! }))
  on('tool.call', () => ({ result: 'ok' }) as never)
  const r = (await $.tool.call({ tool: 'Bash', command: "sed -i 's/^- TBD/- 18:30/' 2026-10-31.md" } as never)) as { deny?: string }
  expect(r.deny).toContain('- 18:30 shipped')
})
