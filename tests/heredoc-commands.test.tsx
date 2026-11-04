import { expect, test } from 'claude-code/testing'
import { L, passes, refuses } from './shell-world'
import { shellParts } from '../hooks/shell'

// A heredoc is read wherever its command stands, in command order. Each case holds a stamp in the
// future, so a heredoc read is a refusal.
const doc = (head: string, tail = '') => `${head} <<EOF\n${L}\nEOF${tail}`
refuses('comparison: heredoc after ;', doc('true; cat >> log.md'), {}, '18:30')
refuses('comparison: heredoc after &&', doc('true && cat >> log.md'), {}, '18:30')
refuses('comparison: echo behind then', `if true; then echo "${L}" >> log.md; fi`, {}, '18:30')
refuses('heredoc behind then', doc('if true; then cat >> log.md', '\nfi'), {}, '18:30')
refuses('heredoc behind do', doc('for i in 1; do cat >> log.md', '\ndone'), {}, '18:30')
refuses('heredoc behind else', doc('if false; then :; else cat >> log.md', '\nfi'), {}, '18:30')
refuses('heredoc behind elif', doc('if false; then :; elif cat >> log.md', '\nthen :; fi'), {}, '18:30')
refuses('heredoc in a subshell', doc('(cat >> log.md', '\n)'), {}, '18:30')
refuses('heredoc in a brace group', doc('{ cat >> log.md', '\n}'), {}, '18:30')
refuses('heredoc behind !', doc('! cat >> log.md'), {}, '18:30')
refuses('heredoc behind env', doc('env tee -a log.md'), {}, '18:30')
refuses('heredoc behind a wrapper with options', doc('timeout 5 nice -n 3 tee log.md'), {}, '18:30')
refuses('heredoc behind a variable assignment', doc('LC_ALL=C cat >> log.md'), {}, '18:30')
refuses('heredoc behind a pipe', doc('true | cat >> log.md'), {}, '18:30')
refuses('the redirect after the heredoc word', `cat <<EOF >> log.md\n${L}\nEOF`, {}, '18:30')

// How the heredoc word is spelled.
refuses('<<- takes the tabs off its lines', `cat >> log.md <<-EOF\n\t${L}\n\tEOF`, {}, '18:30')
refuses('<<- with a heading', `cat >> log.md <<-EOF\n\t## 2026-10-31 18:30\n\tEOF`, {}, '18:30')
refuses('a backslash before the word', `cat >> log.md <<\\EOF\n${L}\nEOF`, {}, '18:30')
refuses('a quoted word with a space', `cat >> log.md <<'THE END'\n${L}\nTHE END`, {}, '18:30')
refuses('a line that only looks like the end stays in the text', `cat >> log.md <<EOF\n  EOF\n${L}\nEOF`, {}, '18:30')
test('two heredocs on one line take the next bodies in turn', () => {
  const docs: string[] = []
  expect(shellParts('cat <<A; cat <<B\none\nA\ntwo\nB\necho x', docs).length).toBe(3)
  expect(docs).toEqual(['one', 'two'])
})
test('an empty heredoc has no text, and a body keeps its lines', () => {
  const docs: string[] = []
  shellParts('cat <<A\nA\ncat <<B\n;one\n\ntwo\nB', docs)
  expect(docs).toEqual(['', ';one\n\ntwo'])
})
test('a shift inside an arithmetic with no end line is no heredoc', () => {
  expect(shellParts('echo $((1<<2)) ; echo x').length).toBe(2)
  expect(shellParts('echo $((1<<2))\necho x').length).toBe(2)
})
test('a << in quotes or a comment opens nothing', () => {
  const docs: string[] = []
  expect(shellParts(`echo "a <<B"\n# <<C\necho y\nB\nC`, docs).length).toBeGreaterThan(3)
  expect(docs).toEqual([])
})

// A heredoc for another program is not a write, wherever a cat stands.
passes('comparison: a heredoc to python', `python3 - <<'PY'\n- 2026-10-31 18:30 x\nPY`)
passes('a cat earlier on the line does not take the heredoc', `cat a.md > out.md; python3 - <<'PY'\n- 2026-10-31 18:30 x\nPY`)
passes('a cat earlier on the line, joined by &&', `cat a.txt > notes.md && python3 - <<'PY'\n# 2026-10-31 18:30 note\nPY`)

// A stamp behind a parenthesis in quotes inside a command substitution.
refuses('comparison: a substitution with plain words', `echo '${L}' $(printf x) >> notes.md`, {}, '18:30')
refuses('a quoted ( inside a substitution', `echo '${L}' $(printf '(') >> notes.md`, {}, '18:30')
refuses('a quoted ) inside a substitution', `echo '${L}' $(printf ')') >> notes.md`, {}, '18:30')
refuses('a double-quoted ( inside a substitution', `echo '${L}' $(printf "(") >> notes.md`, {}, '18:30')
refuses('a nested substitution', `echo '${L}' $(printf $(echo x)) >> notes.md`, {}, '18:30')
