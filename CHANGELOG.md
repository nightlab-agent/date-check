# Changelog

## Unreleased

- A stamp put into a file with `sed -i` (or `--in-place`, `-i.bak`, BSD's `-i ''`) is judged
  like one written by `echo >>`: the text of an `s` command's replacement, and of an `a`, `i`
  or `c` line. Before, `sed -i` was not read at all, so a guessed time put into a log line
  that way went through unseen. A `sed` that only prints (no `-i`) is left alone.
- When the file exists, its `s` commands are applied to its text and the changed lines are
  judged as the same Edit would be, so a date put into the middle of a sentence
  (`s/TBD/2026-11-20/` on "planned for TBD.") is not taken for a stamp. Where the
  substitution cannot be read the way sed reads it (a line range, the Nth match, `w`, `-f`),
  the written text is judged alone, as before.
- A `;` inside a quoted sed script no longer cuts the command; every file a `sed -i` edits is
  read, a log before a code file; `2>err.txt` is not taken for the file; and a sed on a code
  file earlier in the command no longer hides an `echo` of a future time into a log.
- A sed script quoted in pieces (`s/'^- TBD'/'- 18:30'/`) or with escaped spaces is read as
  the one script the shell passes to sed. Before, only its first piece was read, so the stamp
  went through unseen.
- A sed pattern's `.` now takes a whole emoji, as sed does, so `s/^- . TBD/…/` on a line
  `- 🚀 TBD` is judged on the line it really changes. Before, the line looked unchanged and a
  future time went through.
- A `sed -i` is found behind `LC_ALL=C` and other settings, a path (`/usr/bin/sed`), `gsed`,
  and the commands that run it (`env`, `command`, `sudo`, `timeout`, `nice`, `time`, `nohup`).
  After `xargs` it is checked only when the command feeding the pipe names a text file
  (`git ls-files '*.md'`), so a pipe of code files no longer refuses a date written into code.
  Before, only a command that began with the word `sed` was read.
- A heredoc (`cat >> notes.md <<'EOF'`) in a command no longer hides a `sed -i` or an `echo`
  of a future time elsewhere in the same command; before, only the heredoc was read.
- A command run in the background with a single `&` is read as its own command, so an `echo`
  of a future time after it is judged. `2>&1`, `>&2`, `&>` and `|&` are not taken for one.
- `echo … &>> log.md` and `echo … 1> log.md` are seen as writes to the file, as `>>` is;
  `2>> log.md` still is not (it sends only errors there). `echo … >| log.md` is a write too.
- Every heredoc in a command is checked, not only the first, also one after `&&` or `;` on the
  same line, and one whose end word has a dash (`<<'END-NOTE'`).
- A sed script quoted as `$'…'` is read with its escapes, like any quoted script.

## 0.1.5 (2026-11-02)

- A future date written as a release heading is refused even when the line the edit removes
  named that date in a sentence ("Release planned for 2026-11-05" edited into
  "## [1.0.0] - 2026-11-05"). Before, any new stamp whose text appeared anywhere in a removed
  line was taken as carried over; now only a removed line's own stamp is.
- A new file named for a past day is refused in each folder. Before, the "write it again"
  memory was kept by the file name alone, so a refusal for `log/2025-06-12.md` let a
  different new `journal/2025-06-12.md` through unasked.
- A future stamp refused in a Write and written again by the shell with a relative path
  (`echo ... >> notes.md`) now goes through as the refusal promises. Before, the retry was
  matched by the path as typed, so the relative spelling was refused a second time. Both
  checks now join a relative path to the session's directory and resolve `.` and `..`; on
  Windows, `E:\p\notes.md` and a relative `notes.md` from `E:\p` are one file. A relative
  path after a `cd` in the same command (in parentheses too) is the same file only after the
  same `cd`. Network paths (`\\srv\share`) match in any letter case, as drive paths do.
- A date moved out of a code block into the text is judged. Before, the line counted as one
  the file already had, so a sample heading in a fence turned into a real heading dated in
  the future went through.

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
