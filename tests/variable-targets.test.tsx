import { L, passes, refuses } from './shell-world'

// An agent often names its file once and writes to the name: seen in preview 20261105-172039.
refuses('comparison: the file named directly', `echo "${L}" >> n.md`, {}, '18:30')
refuses('a file named by a variable', `f=n.md; echo "${L}" >> "$f"`, {}, '18:30')
refuses('the same joined by &&', `mkdir -p log && f=log/n.md; echo "${L}" >> "$f"`, {}, '18:30')
refuses('the name in braces, printf', `f=n.md; printf '%s\\n' "${L}" >> "\${f}"`, {}, '18:30')
refuses('a test on the file first', `f=n.md; if [ -s "$f" ]; then echo; fi; echo "${L}" >> "$f"`, {}, '18:30')
passes('a variable set after the write says nothing about it', `echo "${L}" >> "$f"; f=n.md`)
refuses('export names it too', `export f=n.md; echo "${L}" >> "$f"`, {}, '18:30')
refuses('a sed -i on a file named by a variable', `f=n.md; sed -i 's/^- TBD/${L}/' "$f"`, { 'n.md': '- TBD\n' }, '18:30')
refuses('a name inside a path', `d=log; echo "${L}" >> "$d/n.md"`, {}, '18:30')
passes('a value the shell works out is not known', `f=n.md; f=$(pick); echo "${L}" >> "$f"`)
passes('a name set only for one command does not last', `f=n.md true; echo "${L}" >> "$f"`)
passes('a file that is not text stays unjudged', `f=app.py; echo "${L}" >> "$f"`)
// Dex, job dc-var: a filled name must read as the file does, and must not outlive a step that may not run.
passes('a sed -i that changes nothing, named by a variable', `f=n.md; sed -i "s/TBD/${L}/" "$f"`, { 'n.md': 'ok\n' })
passes('inside an open fence, named by a variable', `f=n.md; echo "${L}" >> "$f"`, { 'n.md': '\`\`\`\nx\n' })
passes('a subshell cannot change the name after it', `f=app.py; (:; f=n.md; :); echo "${L}" >> "$f"`)
passes('a step inside if may not run', `f=app.py; if false; then f=n.md; fi; echo "${L}" >> "$f"`)
passes('unset forgets the name', `f=.md; unset f; echo "${L}" >> "app$f"`)
