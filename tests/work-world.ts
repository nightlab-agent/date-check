import { expect, test } from 'claude-code/testing'
import { bash, world } from './shell-world'
import type { WorkCase } from './work-cases'

// The engine exercises the decisions on the same inputs the standalone counter
// measures. Its test timeout is a runner safeguard, not the hook's work budget.
export const checkWorkCases = (cases: WorkCase[]) => {
  for (const c of cases) test(c.name, { timeoutMs: 120_000 }, async ($, on) => {
    world(on, c.files)
    const r = await bash($, c.command)
    if (c.deny) expect(r.deny ?? '').toContain(c.deny)
    else expect(r.deny).toBeUndefined()
  })
}
