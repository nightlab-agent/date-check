import { expect, test } from 'claude-code/testing'
import { bash, passes, refuses, world } from './shell-world'
import { forms } from './shell-skipped-forms'

// Each form is checked against real Bash by review-second-bash.ts; here against the hook.
for (const [name, command, , deny, , files] of forms as readonly (readonly [string, string, string, boolean, string?, Record<string, string>?])[]) {
  if (deny) refuses(name, command, files ?? {}, '2027-01-15')
  else passes(name, command, files ?? {})
}

// A `#` right after `)` opens a comment in bash (probed: `(echo 2027-01-15 >notes.md)#x` wrote the file).
refuses('H1: a hash right after a closing paren is a comment, the write inside still counts', `(echo 2027-01-15 >notes.md)#x`, {}, '2027-01-15')
refuses('H1 comparison: a space before the hash', `(echo 2027-01-15 >notes.md) #x`, {}, '2027-01-15')

// The repo's own standard: 40,000 of a thing read in under a second (shell-branches.test.tsx).
test('T1: a heredoc of 40,000 continued lines read in under a second', async ($, on) => {
  world(on)
  const started = performance.now()
  await bash($, `cat <<EOF >notes.md\n${'a\\\n'.repeat(40000)}EOF`)
  expect(performance.now() - started).toBeLessThan(1000)
})
test('T1 comparison: a heredoc of 40,000 plain lines read in under a second', async ($, on) => {
  world(on)
  const started = performance.now()
  await bash($, `cat <<EOF >notes.md\n${'a\n'.repeat(40000)}EOF`)
  expect(performance.now() - started).toBeLessThan(1000)
})
