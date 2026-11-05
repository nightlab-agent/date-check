import { passes, refuses } from './shell-world'

// R1, R5, R6, R10: forms a real command takes. Each failed before its fix; each comparison passed all along.
// shell-world fixes the clock at 2026-10-31 16:01 local.
const date = '2027-01-15'

refuses('R1: explicit stdin heredoc is judged', `cat 0<<EOF > notes.md\n${date}\nEOF`, {}, date)
refuses('R1 comparison: implicit stdin heredoc is judged', `cat <<EOF > notes.md\n${date}\nEOF`, {}, date)

refuses('R5: an overwrite does not hide the earlier sed result, which it may never reach', `echo TBD > notes.md; sed -i 's/TBD/${date}/' notes.md; echo 2026-10-31 > notes.md`, {}, date)
refuses('R5 comparison: without the overwrite the sed date remains', `echo TBD > notes.md; sed -i 's/TBD/${date}/' notes.md`, {}, date)

passes('R6: printf joins a sentence in a file created earlier', `printf 'Planned for ' > notes.md; printf '%d-01-15\\n' 2027 >> notes.md`)
passes('R6 comparison: the format supplies the sentence', `printf 'Planned for %d-01-15\\n' 2027 >> notes.md`)

refuses('R10: a quoted printf option still ends the options', `printf '--' '%s\\n' ${date} > notes.md`, {}, date)
refuses('R10 comparison: an unquoted printf option ends the options', `printf -- '%s\\n' ${date} > notes.md`, {}, date)
