// Same shape as tests/review-second-forms.ts:
// name, command, the file Bash writes, whether the hook should refuse, optional file path, optional files before.
const date = '2027-01-15'
export const forms = [
  // A fence in a step that may never run hides a date a later step appends.
  ['G1: a fence appended under a failed gate hides the date appended after it',
    `false && echo '\`\`\`' >>notes.md; echo ${date} >>notes.md`, `${date}\n`, true],
  ['G1 comparison: a plain line appended under a failed gate',
    `false && echo x >>notes.md; echo ${date} >>notes.md`, `${date}\n`, true],
  ['G1: a fence in its own step does not hide the date in the next step, in a plain list too',
    `echo '\`\`\`' >>notes.md; echo ${date} >>notes.md`, `\`\`\`\n${date}\n`, true],
  ['G2: a fence overwritten under a failed gate hides the date appended after it',
    `false && echo '\`\`\`' >notes.md; echo ${date} >>notes.md`, `${date}\n`, true],
  ['G2 comparison: a plain overwrite under a failed gate',
    `false && echo x >notes.md; echo ${date} >>notes.md`, `${date}\n`, true],
  ['G3: a fence from a heredoc under a failed gate hides the date appended after it',
    `false && cat <<EOF >>notes.md\n\`\`\`\nEOF\necho ${date} >>notes.md`, `${date}\n`, true],
  ['G4: a fence a skipped sed inserts hides the date appended after it',
    `false && sed -i '1i \\\`\`\`' notes.md; echo ${date} >>notes.md`, `ok\n${date}\n`, true, 'notes.md', { 'notes.md': 'ok\n' }],
  ['G4: the sed runs, a fence in its own step hides nothing',
    `sed -i '1i \\\`\`\`' notes.md; echo ${date} >>notes.md`, `\`\`\`\nok\n${date}\n`, true, 'notes.md', { 'notes.md': 'ok\n' }],
  ['G4 comparison: a skipped sed that inserts a plain line',
    `false && sed -i '1i x' notes.md; echo ${date} >>notes.md`, `ok\n${date}\n`, true, 'notes.md', { 'notes.md': 'ok\n' }],
  ['P3: a heredoc continuation that spells the end word ends the heredoc',
    `cat <<EOF >notes.md\n${date}\nEO\\\nF\necho after >>notes.md`, `${date}\nafter\n`, true],
  ['P4: a tab-stripped heredoc joins a continued line before the strip',
    `cat <<-EOF >notes.md\n\t${date}\\\n\tx\n\tEOF`, `${date}\tx\n`, true],
  ['P5: an even run of backslashes keeps the date on its own line',
    `cat <<EOF >notes.md\nx\\\\\\\\\n${date}\nEOF`, `x\\\\\n${date}\n`, true],
] as const
