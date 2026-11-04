import { expect, test } from 'claude-code/testing'
import { stampsIn } from '../hooks/stamps'
import { passes, refuses } from './shell-world'
import { characters, forms, prefix } from './review-second-forms'

// Run `bun tests/review-second-bash.ts` to verify the shared fixtures against real Bash.
for (const [name, command, , deny] of forms) {
  if (deny) refuses(name, command, {}, '2027-01-15')
  else passes(name, command)
}

for (const character of characters) {
  test(`checked: the quoted line keeps ${character} whole at the cut`, () => {
    expect(stampsIn(`${prefix}${character} tail`)[0]!.line).toBe(prefix)
  })
}
