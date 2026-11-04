import { L, passes, refuses } from './shell-world'

// A backslash at a line's end joins two lines, in a word's place as bash reads it.
const has = { 'log.md': '- TBD\n' }
refuses('comparison: sed -i on one line', `sed -i 's/^- TBD/${L}/' log.md`, has, '18:30')
refuses('sed -i with its script on the next line', `sed -i \\\n  's/^- TBD/${L}/' log.md`, has, '18:30')
refuses('sed -i with -e and the file on later lines', `sed -i \\\n  -e 's/^- TBD/${L}/' \\\n  log.md`, has, '18:30')
refuses('comparison: echo with its redirect on one line', `echo "${L}" >> log.md`, {}, '18:30')
refuses('echo with the redirect target on the next line', `echo "${L}" >> \\\n  log.md`, {}, '18:30')
refuses('echo with its text on the next line', `echo \\\n  "${L}" >> log.md`, {}, '18:30')
refuses('env sed split after env', `env \\\n  sed -i 's/^- TBD/${L}/' log.md`, has, '18:30')
refuses('a heredoc whose redirect is on the next line', `cat \\\n  > log.md <<'EOF'\n${L}\nEOF`, {}, '18:30')
refuses('a word cut in two by a line join', `ec\\\nho "${L}" >> log.md`, {}, '18:30')
refuses('a line join inside double quotes is dropped', `echo "- 2026-10-31 \\\n18:30 deploy" >> log.md`, {}, '18:30')
passes('a line join inside double quotes leaves the date in its sentence', `echo "see \\\n2026-10-31 18:30 deploy" >> log.md`)
refuses('comparison: in single quotes the backslash and the new line stay', `echo 'see \\\n2026-10-31 18:30 deploy' >> log.md`, {}, '18:30')
