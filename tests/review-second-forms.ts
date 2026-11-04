const date = '2027-01-15'

// name, command, the file Bash writes, whether the hook should refuse, optional file path.
// Every command starts in an empty folder; the hook clock is 2026-10-31 16:01 local.
export const forms = [
  ['a quoted delimiter preserves its backslash and the following command',
    `cat >notes.md <<'E\\F'\nok\nE\\F\necho ${date} >>notes.md`, `ok\n${date}\n`, true],
  ['comparison: the same delimiter without a backslash',
    `cat >notes.md <<'EF'\nok\nEF\necho ${date} >>notes.md`, `ok\n${date}\n`, true],

  ['a here-string decodes an ANSI-C hex escape',
    `cat <<< $'\\x32027-01-15' >notes.md`, `${date}\n`, true],
  ['comparison: a here-string with the literal date',
    `cat <<< '${date}' >notes.md`, `${date}\n`, true],

  ['a quoted echo -e still enables escapes',
    `echo '-e' 'x\\n${date}' >notes.md`, `x\n${date}\n`, true],
  ['comparison: an unquoted echo -e',
    `echo -e 'x\\n${date}' >notes.md`, `x\n${date}\n`, true],

  // Echo requires the leading zero for octal; printf %b also accepts \12.
  ['echo leaves an octal escape without its leading zero literal',
    `echo -e '\\12- ${date}' >notes.md`, `\\12- ${date}\n`, false],
  ['comparison: echo decodes an octal escape with its leading zero',
    `echo -e '\\012- ${date}' >notes.md`, `\n- ${date}\n`, true],

  ['comparison: an even number of zeros really does become the date',
    `printf '%.1048576d\\n' 0 >notes.md; sed -i 's/00//g; s/^$/${date}/' notes.md`, `${date}\n`, true],

  // \c also drops echo's final newline.
  ['echo -e with a stop escape joins the next write',
    `echo -e 'Planned for \\c' >notes.md; echo ${date} >>notes.md`, `Planned for ${date}\n`, false],
  ['comparison: echo -n joins the next write',
    `echo -n 'Planned for ' >notes.md; echo ${date} >>notes.md`, `Planned for ${date}\n`, false],

  ['a here-string decodes a control escape',
    `cat <<< $'\\cJ${date}' >notes.md`, `\n${date}\n`, true],
  ['a here-string stops at a nul escape',
    `cat <<< $'ok\\0x ${date}' >notes.md`, `ok\n`, false],
  ['a heredoc end word in ANSI-C quotes',
    `cat >notes.md <<$'E\\tF'\nok\nE\tF\necho ${date} >>notes.md`, `ok\n${date}\n`, true],
  ['a double-quoted end word keeps a backslash that escapes nothing',
    `cat >notes.md <<"E\\F"\nok\nE\\F\necho ${date} >>notes.md`, `ok\n${date}\n`, true],
  ['a bare end word loses its backslash',
    `cat >notes.md <<E\\F\nok\nEF\necho ${date} >>notes.md`, `ok\n${date}\n`, true],
  ['a -n after the text is text, so the next write starts a new line',
    `echo Planned for -n >notes.md; echo ${date} >>notes.md`, `Planned for -n\n${date}\n`, true],
  ['a quoted echo -n joins the next write',
    `echo '-n' 'Planned for ' >notes.md; echo ${date} >>notes.md`, `Planned for ${date}\n`, false],
  ['checked: an unterminated heredoc writes its body',
    `cat >notes.md <<EOF\n${date}\n`, `${date}\n`, true],
  ['checked: a heredoc end word with a trailing space is body',
    `cat >notes.md <<EOF\n${date}\nEOF \n`, `${date}\nEOF \n`, true],
  ['checked: a tab-stripping heredoc matches its end word',
    `cat >notes.md <<-EOF\n\t${date}\n\tEOF\n`, `${date}\n`, true],
  ['checked: one file under a leading dot spelling',
    `echo TBD >notes.md; sed -i 's/TBD/${date}/' ./notes.md`, `${date}\n`, true],
  ['checked: one file under interior dot and doubled slash spellings',
    `mkdir a; echo TBD >a//notes.md; sed -i 's/TBD/${date}/' a/./notes.md`, `${date}\n`, true, 'a/notes.md'],
  ['checked: echo without -e keeps its escapes literal',
    `echo 'x\\n${date}' >notes.md`, `x\\n${date}\n`, false],
  ['checked: echo -E overrides -e',
    `echo -e -E 'x\\n${date}' >notes.md`, `x\\n${date}\n`, false],
  ['checked: echo -e overrides -E in a combined option',
    `echo -Ee 'x\\n${date}' >notes.md`, `x\n${date}\n`, true],
] as const

export const characters = ['🇺🇸', '👩‍💻', '👍🏽', 'e\u0301'] as const
export const prefix = `${date} ${'x'.repeat(108)}` // 119 UTF-16 units.
