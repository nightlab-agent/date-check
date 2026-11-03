import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// Shell writes the hook missed or refused wrongly. Clock 2026-10-31 16:01 local; 18:30 that day is in the future.
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
  return { fs }
}
const bash = ($: $T, command: string) => $.tool.call({ tool: 'Bash', command } as never) as Promise<{ deny?: string }>
const T = '- 2026-10-31 18:30'

// xargs sed -i on code files: a future date in code is data, not a stamp.
test('xargs comparison: sed -i of a future date into app.py goes through', async ($, on) => {
  world(on, { 'app.py': 'EXPIRES = "TODO"\n' })
  expect((await bash($, `sed -i 's/TODO/2026-12-01 10:00/' app.py`)).deny).toBeUndefined()
})
test('xargs: git ls-files "*.py" | xargs sed -i of a future date into code goes through', async ($, on) => {
  world(on, { 'app.py': 'EXPIRES = "TODO"\n' })
  expect((await bash($, `git ls-files '*.py' | xargs sed -i 's/TODO/2026-12-01 10:00/'`)).deny).toBeUndefined()
})
test('xargs comparison: git ls-files "*.md" | xargs sed -i of a future time is refused', async ($, on) => {
  world(on)
  expect((await bash($, `git ls-files '*.md' | xargs sed -i 's/TODO/2026-10-31 18:30/'`)).deny).toContain('18:30')
})
