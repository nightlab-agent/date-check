import { L, passes, refuses } from './shell-world'

// Every command below was run in real bash (probe/diff.ts): the stamp lands in app.py, a code file, not n.md.
// F1 CHANGELOG Next: "one set inside `if`, a loop or a subshell, is not followed". A loop after a pipe is a subshell.
passes('F1 a loop after a pipe does not change the name', `f=app.py; echo x | while read l; do f=n.md; done; echo "${L}" >> "$f"`)
passes('F1 comparison: the same loop with no pipe forgets the name', `f=app.py; for i in 1; do f=n.md; done; echo "${L}" >> "$f"`)
