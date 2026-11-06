import { expect, test } from 'claude-code/testing'
import { bash, L, passes, refuses, world } from './shell-world'

// False refusals first. Those commands are also exercised by review-variable-bash.ts.
passes('loop iterator replaces an earlier text-file name', `f=n.md; for f in app.py; do :; done; echo "${L}" >> "$f"`)
refuses('comparison: an unchanged text-file name is judged', `f=n.md; echo "${L}" >> "$f"`, {}, '18:30')
passes('unset in then forgets the earlier suffix', `f=.md; if true; then unset f; fi; echo "${L}" >> "app$f"`)
passes('comparison: a top-level unset forgets the suffix', `f=.md; unset f; echo "${L}" >> "app$f"`)
passes('a quoted variable containing a glob names a literal file', `f='*.md'; sed -i 's/TBD/2027-01-15/' "$f"`, { '*.md': 'planned for TBD.\n' })
passes('comparison: the same literal glob named outright', `sed -i 's/TBD/2027-01-15/' '*.md'`, { '*.md': 'planned for TBD.\n' })
passes('an assignment skipped by && cannot replace a code-file name', `f=app.py; false && f=n.md; echo "${L}" >> "$f"`)
passes('a later conditional assignment cannot revive the forgotten name', `f=app.py; false && f=n.md && f=other.md; echo "${L}" >> "$f"`)
passes('a conditional reassignment after a newline stays conditional', `f=app.py; false &&\nf=n.md; echo "${L}" >> "$f"`)
passes('a loop iterator immediately after do forgets its name', `f=n.md; for i in 1; do for f in app.py; do :; done; done; echo "${L}" >> "$f"`)
passes('a background reassignment cannot replace the parent name', `f=app.py; f=n.md & wait; echo "${L}" >> "$f"`)
passes('comparison: a code-file name remains unjudged', `f=app.py; echo "${L}" >> "$f"`)

// These scopes deliberately forget a name instead of guessing which assignment ran.
passes('an explicit assignment in a loop forgets the name', `f=app.py; for i in 1; do f=n.md; done; echo "${L}" >> "$f"`)
passes('an assignment in a subshell forgets the name', `f=n.md; (:; f=app.py; :); echo "${L}" >> "$f"`)
passes('an assignment in one if branch forgets the name', `f=app.py; if true; then f=n.md; fi; echo "${L}" >> "$f"`)
passes('an unquoted glob keeps its file context unknown', `f='*.md'; sed -i 's/TBD/2027-01-15/' $f`, { 'n.md': 'ok\n' })
passes('a future stamp at an unquoted glob target is not followed', `f='*.md'; echo "${L}" >> $f`, { 'n.md': '' })

test('two names for one file share the refusal on retry', async ($, on) => {
  world(on)
  expect((await bash($, `f=n.md; echo "${L}" >> "$f"`)).deny ?? '').toContain('18:30')
  expect((await bash($, `g=n.md; echo "${L}" >> "$g"`)).deny).toBeUndefined()
})

refuses('two names for one file join a split stamp', `f=n.md; g=./n.md; printf '%s' '- 2026-' >> "$f"; printf '%s\\n' '10-31 18:30 deploy' >> "$g"`, {}, '18:30')

test('names from two calls do not leak into one another', async ($, on) => {
  world(on)
  const [text, code] = await Promise.all([
    bash($, `f=n.md; echo "${L}" >> "$f"`),
    bash($, `f=app.py; echo "${L}" >> "$f"`),
  ])
  expect(text.deny ?? '').toContain('18:30')
  expect(code.deny).toBeUndefined()
  expect((await bash($, `echo "${L}" >> "$f"`)).deny).toBeUndefined()
})
