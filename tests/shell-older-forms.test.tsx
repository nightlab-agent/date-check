import { expect, test } from 'claude-code/testing'
import { fillNow } from '../hooks/stamps'
import { passes, refuses } from './shell-world'

// Four forms read wrongly before: a fence closed by a mixed mark, a stdout redirect that loses to a later one, an unquoted heredoc's line continuation, an empty heredoc.
const date = '2027-01-15'
test('existing: a mixed fence mark leaves a sample placeholder alone', () => {
  const token = String.fromCodePoint(0x27e6) + 'TIME' + String.fromCodePoint(0x27e7)
  const sample = '```\n```~\n' + token + '\n```\n'
  expect(fillNow(sample, 0).text).toBe(sample)
})
test('existing comparison: a matching fence mark leaves a sample placeholder alone', () => {
  const token = String.fromCodePoint(0x27e6) + 'TIME' + String.fromCodePoint(0x27e7)
  const sample = '```\n' + token + '\n```\n'
  expect(fillNow(sample, 0).text).toBe(sample)
})

passes('existing: the last stdout redirect discards the stamp', `echo '${date}' >notes.md >/dev/null`)
refuses('existing comparison: a sole stdout redirect keeps the stamp', `echo '${date}' >notes.md`, {}, date)
passes('existing: an unquoted heredoc joins a continued line', `cat <<EOF >notes.md\nPlanned for \\\n${date}\nEOF`)
refuses('existing comparison: a quoted heredoc keeps a continued line', `cat <<'EOF' >notes.md\nPlanned for \\\n${date}\nEOF`, {}, date)
passes('existing: an empty heredoc adds no newline', `printf 'Planned for ' >notes.md; cat <<EOF >>notes.md\nEOF\necho '${date}' >>notes.md`)
refuses('existing comparison: a nonempty heredoc writes the stamp', `cat <<EOF >notes.md\n${date}\nEOF`, {}, date)

refuses('existing: the last redirect keeps the stamp', `echo '${date}' >/dev/null >notes.md`, {}, date)
passes('existing: output sent on to a stream leaves the file', `echo '${date}' >notes.md >&2`)
refuses('existing: a redirect to its own stream changes nothing', `echo '${date}' >notes.md >&1`, {}, date)
refuses('existing: an end word split by a continuation still ends the heredoc', `cat <<EOF >notes.md\n${date}\nE\\\nOF\necho ok >other.md`, {}, date)
passes('existing: a heredoc of one empty line ends with no text', `cat <<EOF >notes.md\n\nEOF`)
