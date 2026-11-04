import { passes, refuses } from './shell-world'

// Forms of a command the parser read wrongly: a shift, a redirect first, a later input redirect, a line ending in a pipe.
const date = '2027-01-15'

refuses('S1: an arithmetic shift does not consume later commands as a heredoc', `echo $((1<<true))\necho ${date} > notes.md\ntrue`, {}, date)
refuses('S1 comparison: arithmetic addition leaves later commands visible', `echo $((1+true))\necho ${date} > notes.md\ntrue`, {}, date)
refuses('S2: a heredoc follows a leading output redirect', `>notes.md cat <<EOF\n${date}\nEOF`, {}, date)
refuses('S2 comparison: redirect follows the command name', `cat >notes.md <<EOF\n${date}\nEOF`, {}, date)
passes('S3: a later stdin redirect replaces the heredoc', `cat <<EOF </dev/null >notes.md\n${date}\nEOF`)
passes('S3 comparison: empty heredoc writes no date', `cat <<EOF >notes.md\nEOF`)
refuses('S4: a newline after a pipe joins the pipeline', `echo ${date} |\ntee notes.md`, {}, date)
refuses('S4 comparison: a one-line pipeline is judged', `echo ${date} | tee notes.md`, {}, date)
refuses('R8: escaped brackets name the literal existing file', `sed -i 's/TBD/${date}/' notes\\[1\\].md`, { 'notes[1].md': 'TBD\n' }, date)
refuses('R8 comparison: quoted brackets name the literal existing file', `sed -i 's/TBD/${date}/' 'notes[1].md'`, { 'notes[1].md': 'TBD\n' }, date)
