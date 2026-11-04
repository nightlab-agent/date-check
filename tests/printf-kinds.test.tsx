import { passes, refuses } from './shell-world'

// printf's number kinds, signs, \\c and %n, from a review: each file gets what bash would write.
// shell-world fixes the clock at 2026-10-31 16:01 local.
const date = '2027-01-15'


passes('R2: a hex conversion prints the current year', `printf '%x-10-31\\n' 8230 > notes.md`)
passes('R2 comparison: a decimal conversion prints the current year', `printf '%d-10-31\\n' 2026 > notes.md`)

passes('R3: a printf integer sign prevents a bare date stamp', `printf '%+d-01-15\\n' 2027 > notes.md`)
passes('R3 comparison: printf prints the plus sign literally', `printf '+%d-01-15\\n' 2027 > notes.md`)

passes('R4: printf b c escape ends output before the date', `printf '%b\\n%d-01-15\\n' '\\c' 2027 > notes.md`)
passes('R4 comparison: printf b c escape without later output', `printf '%b' '\\c' > notes.md`)



refuses('R7: a printf b hexadecimal newline exposes a date', `printf '%b%s\\n' '\\x0a' ${date} > notes.md`, {}, date)
refuses('R7 comparison: a printf b named newline exposes a date', `printf '%b%s\\n' '\\n' ${date} > notes.md`, {}, date)


refuses('R9: printf n consumes a variable name without printing it', `printf '%n%s\\n' sink ${date} > notes.md`, {}, date)
refuses('R9 comparison: printf s prints an empty prefix', `printf '%s%s\\n' '' ${date} > notes.md`, {}, date)


// Each expected reading checked against bash's own printf.
refuses('an octal argument prints the year in decimal', `printf '%d-01-15\\n' 03753 > notes.md`, {}, date)
refuses('a hex argument prints the year in decimal', `printf '%d-01-15\\n' 0x7eb > notes.md`, {}, date)
refuses('a width from an argument takes that argument', `printf '%*d-01-15\\n' 4 2027 > notes.md`, {}, date)
passes('a number cut short at its first bad letter', `printf '%d\\n' ${date}x > notes.md`)
passes('a percent written as an escape opens no directive', `printf '\\x25d-01-15\\n' 2027 > notes.md`)
passes('a %n with no variable name stops printf', `printf '%n%s\\n' 4 ${date} > notes.md`)
refuses('an octal escape in %b is a new line', `printf '%b%s\\n' '\\0012' ${date} > notes.md`, {}, date)
refuses('an octal escape in a format is a new line', `printf '\\012%s\\n' ${date} > notes.md`, {}, date)
