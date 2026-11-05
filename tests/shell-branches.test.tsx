import { expect, test } from 'claude-code/testing'
import { bash, passes, refuses, world } from './shell-world'

const date = '2027-01-15'

refuses('overwrite: a skipped overwrite must not erase a stamp from an earlier write', `echo '${date}' >notes.md; false && echo ok >notes.md`, {}, date)
passes('overwrite comparison: an executed overwrite removes the stamp', `echo '${date}' >notes.md; true && echo ok >notes.md`)

refuses('hash: a hash after an escaped space is part of the word', `echo '${date}'\\ #x >notes.md`, {}, date)
refuses('hash comparison: a quoted space before the hash', `echo '${date} #x' >notes.md`, {}, date)

refuses('printf: ANSI-C argument must not suppress a printf format escape', `printf '\\n%s' $'${date}' >notes.md`, {}, date)
refuses('printf comparison: a single-quoted argument', `printf '\\n%s' '${date}' >notes.md`, {}, date)

test('printf: a previous shell read must not change printf parsing', async ($, on) => {
  world(on)
  await bash($, `echo $'abc'`)
  expect((await bash($, `printf '\\n${date}' >notes.md`)).deny ?? '').toContain(date)
})


// An overwrite inside a branch may not run either, in every form of branch.
refuses('overwrite: under an if', `echo '${date}' >notes.md; if false; then echo ok >notes.md; fi`, {}, date)
refuses('overwrite: under a loop', `echo '${date}' >notes.md; for f in; do echo ok >notes.md; done`, {}, date)
refuses('overwrite: under a case', `echo '${date}' >notes.md; case x in y) echo ok >notes.md;; esac`, {}, date)
refuses('overwrite: after an or', `echo '${date}' >notes.md; true || echo ok >notes.md`, {}, date)
refuses('overwrite: in a subshell branch', `echo '${date}' >notes.md; (false && echo ok >notes.md)`, {}, date)
refuses('overwrite: a chain of two gates', `echo '${date}' >notes.md; true && false && echo ok >notes.md`, {}, date)
passes('overwrite comparison: a branch overwriting a file this command did not write', `cd docs && echo ok >notes.md`, { 'notes.md': '- 2027-01-15 planned\n' })
passes('overwrite comparison: plain sequence', `echo '${date}' >notes.md; echo ok >notes.md`)

// A # opens a comment only where a word starts.
refuses('hash: after an escaped tab', `echo '${date}'\\\t#x >notes.md`, {}, date)
passes('hash comparison: a backslash that is itself escaped leaves a real space', `echo a\\\\ #'${date}' >notes.md`)
refuses('hash: a line continuation does not start a word', `echo '${date}'\\\n#x >notes.md`, {}, date)
passes('hash comparison: a continued line after a space is a comment', `echo ok \\\n#'${date}' >notes.md`)
