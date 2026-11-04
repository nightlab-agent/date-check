import { passes, refuses } from './shell-world'

// Bash's builtin printf and cat produced the outputs in these comments.
// shell-world fixes the clock at 2026-10-31 16:01 local.
const date = '2027-01-15'

// R1: descriptor 3 does not change cat's stdin; both commands write the date.
refuses('R1: another descriptor leaves the stdin heredoc intact', `cat <<EOF 3</dev/null >notes.md\n${date}\nEOF`, {}, date)
refuses('R1 comparison: the stdin heredoc without another descriptor', `cat <<EOF >notes.md\n${date}\nEOF`, {}, date)

// Reopening stdin through /dev/stdin also keeps the date.
refuses('R1b: reopening stdin preserves the heredoc', `cat <<EOF </dev/stdin >notes.md\n${date}\nEOF`, {}, date)
refuses('R1b comparison: the heredoc without reopening stdin', `cat <<EOF >notes.md\n${date}\nEOF`, {}, date)

// R2: the first echo prints a literal pipe; the second writes only the date.
refuses('R2: an escaped pipe does not continue a command', `echo x\\|\necho ${date} >notes.md`, {}, date)
refuses('R2 comparison: a quoted pipe does not continue a command', `echo 'x|'\necho ${date} >notes.md`, {}, date)

// R3: bash reads 010 as eight, so it writes only "2027-01-" and a newline.
passes('R3: an octal precision truncates the date', `printf '%.*s\\n' 010 ${date} >notes.md`)
passes('R3 comparison: a literal precision truncates the date', `printf '%.8s\\n' ${date} >notes.md`)

// R4: %#.0o keeps the leading zero, so neither output starts with a stamp.
passes('R4: alternate octal zero is still printed at precision zero', `printf '%#.0o${date}\\n' 0 >notes.md`)
passes('R4 comparison: the leading zero is literal', `printf '0${date}\\n' >notes.md`)

// R5: the quoted character number is 65, so both write "652027-01-15".
passes('R5: a character number is not zero', `printf '%.0d${date}\\n' "'A" >notes.md`)
passes('R5 comparison: a decimal character code', `printf '%.0d${date}\\n' 65 >notes.md`)

// R6: é occupies two UTF-8 bytes; precision two leaves no newline before the date.
passes('R6: b precision counts UTF-8 bytes after a unicode escape', `printf '%.2b%s\\n' '\\u00e9\\n' ${date} >notes.md`)
passes('R6 comparison: the same prefix without a newline', `printf '%b%s\\n' '\\u00e9' ${date} >notes.md`)

// R7: bash warns and saturates this unsigned argument to 18446744073709551615.
passes('R7: an unsigned overflow does not become a small integer', `printf '202%u-01-15\\n' -18446744073709551623 >notes.md`)
passes('R7 comparison: the saturated unsigned value', `printf '202%u-01-15\\n' 18446744073709551615 >notes.md`)

// Seen, not this change: this pair also fails/passes at the base.
// A negative precision means no precision, so bash prints the whole date.
refuses('seen: a negative precision does not truncate the date', `printf '%.*s\\n' -1 ${date} >notes.md`, {}, date)
refuses('seen comparison: an omitted precision prints the date', `printf '%s\\n' ${date} >notes.md`, {}, date)
