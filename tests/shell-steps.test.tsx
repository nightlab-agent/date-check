import { passes, refuses } from './shell-world'
import { forms } from './shell-steps-forms'

// Each form is checked against real Bash by review-second-bash.ts; here against the hook.
for (const [name, command, , deny, , files] of forms as readonly (readonly [string, string, string, boolean, string?, Record<string, string>?])[]) {
  if (deny) refuses(name, command, files ?? {}, '2027-01-15')
  else passes(name, command, files ?? {})
}
