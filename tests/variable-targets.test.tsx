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
