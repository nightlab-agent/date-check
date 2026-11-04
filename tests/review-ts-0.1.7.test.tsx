import { expect, test } from 'claude-code/testing'
import { stampsIn } from '../hooks/stamps'
import { passes, refuses } from './shell-world'

// TypeScript review of 0.1.7: each finding as a test beside a comparison case.
// shell-world fixes the clock at 2026-10-31 16:01 local; bash 5 produced the outputs in the comments.
const date = '2027-01-15'

// T1: bash reads a heredoc with no end line to the end of the command (a warning, exit 0), and
// writes the body; "EOF " with a space after it is no end line either.
refuses('T1: a heredoc with no end line is written to the end of the command', `cat > notes.md <<EOF\n${date} release\n`, {}, date)
refuses('T1b: an end line with a space after the word is body, as bash reads it', `cat <<EOF > notes.md\n${date} release\nEOF \n`, {}, date)
refuses('T1 comparison: the same heredoc with its end line', `cat > notes.md <<EOF\n${date} release\nEOF\n`, {}, date)
passes('T1 comparison: a shift inside arithmetic is no heredoc', `echo $((1<<2)) > notes.md`)

// T2: a here-string is the text cat writes (bash: cat <<< "x" >> f appends x).
refuses('T2: a here-string reaches the file', `cat <<< "${date} release" >> notes.md`, {}, date)
refuses('T2 comparison: the same text as a heredoc', `cat <<EOF >> notes.md\n${date} release\nEOF\n`, {}, date)

// T3: the quoted line is cut at 120 units; a flag is two code points of two units each, so a
// cut after its first half leaves a lone regional indicator, which shortLine does not catch.
test('T3: the quoted line is not cut through a flag emoji', () => {
  const line = `- 2026-10-31 18:30 ${'x'.repeat(99)}\u{1F1FA}\u{1F1F8}`
  const s = stampsIn(line)[0]!
  expect([...s.line].at(-1)).not.toBe('\u{1F1FA}')
})
test('T3 comparison: a two-unit emoji at the cut is kept whole', () => {
  const line = `- 2026-10-31 18:30 ${'x'.repeat(99)}\u{1F604}`
  const s = stampsIn(line)[0]!
  expect([...s.line].at(-1)).toBe('\u{1F604}')
})

// A width past what a string holds is capped, so the command is still judged.
refuses('T4: a huge width does not stop the command being judged', `printf '%99999999999s\\n${date}\\n' x >> notes.md`, {}, date)
refuses('T4 comparison: a small width', `printf '%9s\\n${date}\\n' x >> notes.md`, {}, date)
