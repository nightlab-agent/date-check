# Changelog

## 0.1.1 (2026-10-31)

- README: says what each install scope means, and what the one hook is and when Claude Code runs it. No change
  to the code.

## 0.1.0 (2026-10-31)

- First version: before a Write, an Edit, or a shell command that writes to a file, finds the date and time stamps
  the call adds (a dated heading, a labelled field such as `Date:` or `updated:`, the start of a line) and compares
  each with the real clock. A stamp more than 2 minutes in the future is refused, and the refusal gives the real date
  and time; the same line written again goes through (a deadline can be in the future on purpose). A stamp more than
  30 minutes old today, or a date more than a day old, goes through with a note. Dates inside sentences and code
  blocks, and files that are not Markdown or text, are left alone.
