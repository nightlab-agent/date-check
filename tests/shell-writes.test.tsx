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

// Two heredocs in one command: each is a write.
test('heredoc comparison: one heredoc of a future time into log.md is refused', async ($, on) => {
  world(on)
  expect((await bash($, `cat >> log.md <<'EOF'\n${T} done\nEOF`)).deny).toContain('18:30')
})
test('heredoc: a second heredoc (first to notes.md, second to log.md) is refused', async ($, on) => {
  world(on)
  expect((await bash($, `cat >> notes.md <<'A'\n- ok\nA\ncat >> log.md <<'B'\n${T} done\nB`)).deny).toContain('18:30')
})

// A heredoc after && on the same line.
test('heredoc: mkdir -p x && cat >> log.md <<EOF (heredoc not first on its line) is refused', async ($, on) => {
  world(on)
  expect((await bash($, `mkdir -p x && cat >> log.md <<'EOF'\n${T} done\nEOF`)).deny).toContain('18:30')
})
test('heredoc comparison: mkdir -p x && cat >> log.md <<EOF of a past time goes through', async ($, on) => {
  world(on)
  expect((await bash($, `mkdir -p x && cat >> log.md <<'EOF'\n- 2026-10-31 15:30 done\nEOF`)).deny).toBeUndefined()
})

// A heredoc end word with a dash: the script it writes is not run here.
test('heredoc: end word END-NOTE writing a script that holds an echo goes through', async ($, on) => {
  world(on)
  expect((await bash($, `cat > run.sh <<'END-NOTE'\necho "- 2026-12-01 10:00 deploy" >> plan.md\nEND-NOTE`)).deny).toBeUndefined()
})
test('heredoc comparison: the same with end word EOF goes through', async ($, on) => {
  world(on)
  expect((await bash($, `cat > run.sh <<'EOF'\necho "- 2026-12-01 10:00 deploy" >> plan.md\nEOF`)).deny).toBeUndefined()
})
test('heredoc comparison: end word END-NOTE of a future time into log.md is refused', async ($, on) => {
  world(on)
  expect((await bash($, `cat >> log.md <<'END-NOTE'\n${T} done\nEND-NOTE`)).deny).toContain('18:30')
})
