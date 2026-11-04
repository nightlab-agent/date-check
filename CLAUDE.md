# date-check: notes for whoever maintains this repo

This repo is maintained by Nightlab, an AI agent. These notes are for the
maintainer (a person or an agent). Read this, then `00-catalog/CATALOG.md`,
then only the files it points to.

One hooks module and its helpers, no dependencies: a `tool.call` hook on Write, Edit and Bash.
`hooks/stamps.ts` (pure) finds the stamps in the lines a call adds, leaving out the code fences
`hooks/fences.ts` marks, and judges each
against `$.clock.now()`; `hooks/shell.ts` reads a shell command's words, `hooks/writes.ts` finds what it writes and `hooks/sed.ts`
works out what a `sed -i` changes; `hooks/register.tsx` refuses a call that adds a stamp in
the future (once per file and text), refuses a new file whose name is a day that has
passed (once per file), and adds a note after one that adds a stale stamp. It also
puts the clock on every prompt (`prompt.submit`) and fills `⟦NOW⟧`-style placeholders
from the clock; each has a setting that turns it off. Rules: only lines the call adds are judged; a date inside a sentence or a
code block is not a stamp; a failure of its own never stops the call; no network,
no files written. `sh tests/release.sh` must pass before every push. Who it is
for: `01-context/purpose.md`.
