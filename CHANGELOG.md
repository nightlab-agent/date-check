# Changelog

## 0.1.4 (2026-11-02)

- Every prompt now carries the clock, so Claude knows the time instead of guessing it: the
  local weekday, date, time, UTC offset and zone name, and how long ago your previous message
  came (`it is Sunday 2026-11-01 05:58 local time, UTC-05:00 (America/New_York, EST). The
  person's previous message came 3 h 12 min ago.`). A background task's notification or
  another plugin's prompt gets the time but does not count as your previous message. The
  "clock on every prompt" setting turns it off. Before, Claude Code gave Claude the date only,
  with no time and no zone.
- Claude can leave the time to the clock: `⟦NOW⟧` (date and time), `⟦DATE⟧`, `⟦TIME⟧` or
  `⟦NOW-ISO⟧` in what it writes (a Write or an Edit and its file name, a shell command) is replaced with the
  machine's local time as the call lands, and Claude is told what went in. One inside
  backticks or a code block is kept as written. The prompt clock tells Claude about `⟦NOW⟧`, `⟦DATE⟧`
  and `⟦TIME⟧`; the "fill placeholders" setting turns them off. The names follow a request in
  MikalaiKryvusha/KAIF#170, which found that a clock in the prompt still left an agent writing
  the minute after.

## 0.1.3 (2026-11-01)

- A new Markdown or text file whose name carries a date more than a day before today
  (`briefs/daily-brief-2025-06-12.md` created on 2026-11-01) is refused once, with the real
  date. If that date is meant (a record of that day), Claude writes the same file again and it
  goes through. A name with today's date, yesterday's or a later day's (a plan) is not judged,
  nor a file that already exists, nor a date in a folder's name. The days allowed follow the
  "days behind" setting. Before, only the stamps inside a file were checked, never its name.

## 0.1.2 (2026-11-01)

- These zone names after a time are now read: UTC, GMT, EST, EDT, CST, CDT, MST, MDT, PST, PDT,
  CET, CEST, BST, IST (`01:40 EST`, `06:26 UTC`); a time with any other name is taken as local
  time. A name used in more than one place (`CST`, `IST`, `BST`) is judged by every place it
  can mean. Before,
  `01:40 EST` was taken as local time, so a stamp 14 minutes ahead in New York on the night the
  clocks went back got only a note that it was old, not a refusal.
- The hour the clocks go back over: a local time in it (01:00 to 02:00 in New York on
  2026-11-01) can mean two moments, and is now refused only when both are ahead, and noted
  only when both are old.
  Before, a line written at the real time in that hour could get a note calling it an hour old.
- Messages give the real time with its UTC offset (`2026-11-01 01:26 local time, UTC-05:00`).
- Tests: a log entry written late, with an earlier time than the line above it, is judged against
  the clock alone (a note when it is over 30 minutes old), and the newer line is not judged again.

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
