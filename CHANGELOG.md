# Changelog

## Unreleased

- A code fence inside a list item is code, as a Markdown reader shows it: indented under the item
  by spaces or a tab, on the marker's own line, or under a nested or numbered item. Before, a date
  in such a sample was refused, and a placeholder in one was filled. The fence ends with its item
  when a line sits left of the item's text. tests/code-fences.test.tsx fails on 9 cases without
  this. Not seen on a screen.
- A `sed -i` on a file the same command made earlier is judged on what it leaves there
  (`echo "- TBD" > n.md; sed -i 's/TBD/.../' n.md`). Before, it counted as an edit of a missing
  file and was dropped. tests/files-made-in-a-command.test.tsx fails on 4 cases without this. Not
  seen on a screen.
- A heredoc is read wherever its command stands: behind `then`, `do`, `else`, `elif`, `(`, `{`,
  `!`, a variable, `env` or another wrapper, with `<<-` (tabs taken off) or `<<\EOF`, and in
  command order among the other writes of the command. A heredoc for another program no longer
  counts as the input of a `cat` earlier on the line. A `(` or `)` in quotes inside `$(...)` no
  longer hides the redirect after it. tests/heredoc-commands.test.tsx fails on 19 cases without
  this. Not seen on a screen.
- A backslash at a line's end joins the two lines as bash does: a command split over lines
  (`sed -i \` with the script on the next line, `echo ... >> \` with the file on the next, a
  heredoc's redirect) is read as one. tests/line-continuations.test.tsx fails on 7 cases without
  this. Not seen on a screen.
- The README and this log said `sed -i -f` falls back to judging the written text. It does not: a
  script read from a file is not read, and the README says so now. The `staleNotes` setting says
  that a new file named for a past day is still refused with it off. The README lists `CHANGES`
  and `RELEASE` among the checked names and says any shell write reads its file.
- A shell write is now read word by word, quotes resolved. A `>` inside the echoed text no
  longer hides the real file or stands for a write that never happens (`echo "... > notes.md"`
  with no redirect is left alone), and a quoted name or `my\ notes.md` is one file, in an echo
  and a heredoc. `tee --append`, `tee -a -i` and every file a `tee` names are read, and an
  echo after a heredoc on the heredoc line is judged. tests/shell-targets.test.tsx fails on 11
  cases without this. Not seen on a screen.
- An `echo` or `printf` with its text outside quotes (`echo 2026-10-31 18:30 deploy >>
  log.md`) is judged on what it prints. Before, the line began with the word `echo`, so no
  stamp was found. An echo's quoted words join with spaces as the shell prints them.
  tests/shell-forms.test.tsx fails on 5 cases without this. Not seen on a screen.
- A write behind `then`, `do`, `else`, `if`, `while`, `until`, `!` or `{` in its own part of a
  command is judged, and a comment is skipped, so an apostrophe in one (`# don't forget`) no
  longer hides the command after it. A compound command with its redirect after the closing
  word (`{ ...; } >> log.md`, `done >> log.md`) is still not read. tests/shell-forms.test.tsx
  fails on 5 cases without this. Not seen on a screen.
- A shell `$'...'` quote keeps its `\'` and any `;` inside it when the command is cut into
  parts, so what it writes is judged. tests/shell-forms.test.tsx fails on 2 cases without
  this. Not seen on a screen.
- A `sed -i` on a glob or a variable path (`*.md`, `"$HOME/log.md"`) is judged on the text it
  writes, when the path as written ends in a text file's name. Before, the path counted as a
  missing file and the write was dropped. A file behind a variable no longer counts as new, so
  its name is not refused. A quoted name that holds `[` or `$` (`'notes[1].md'`) is that one
  file, looked up like any other. tests/shell-unknown-paths.test.tsx fails on 5 cases without
  this, tests/literal-file-names.test.tsx on 7. Not seen on a screen.
- A `sed -i` script glued to its option (`-e's/a/b/'`, `-ne'...'`, `-Ee'...'`) is read.
  Before, it was skipped as an unknown option. tests/sed-forms.test.tsx fails on 4 cases
  without this. Not seen on a screen.
- A `-e` script beside a `sed -i -f` file is judged by the text it writes. Before, one `-f`
  dropped the whole command. tests/sed-forms.test.tsx fails on 4 cases without this. Not seen
  on a screen.
- The `a\`, `i\` and `c\` form of `sed -i` with its text on the next line, a text continued
  over lines ending in a backslash, and a text in the `-e` after `a\` are judged. Before, that
  text was lost, and the README says these lines are judged. tests/sed-forms.test.tsx fails on
  6 cases without this. Not seen on a screen.
- A Write or an Edit whose file cannot be read or looked at (over 4 MiB, a network location)
  is judged on the text it adds, as a shell write already was, and a shell command keeps
  judging its other files. Before, one failed look dropped the judgment on the whole call.
  tests/failed-reads.test.tsx fails on 5 cases without this; the failures there are mocked,
  not a real large file or share. Not seen on a screen.
- A line cut to 120 units for a refusal no longer splits an emoji in two, so the refusal
  Claude reads is well formed text. tests/long-lines.test.tsx fails on 3 cases without this.
  Not seen on a screen.
- A dated time range (`- 2026-10-31 10:00-11:30 standup`) is no longer read as a time with the
  offset -11:30 and refused as future. When the end is after the start, the text is judged
  both ways and called wrong only if wrong under both; a time with `T` or seconds keeps its
  offset. tests/time-ranges.test.tsx fails on 5 cases without this. Not seen on a screen.
- The judge and the placeholder fill read a code fence the same one way: closed only by the
  same mark, as long or longer, with nothing after it, and a line with inline ```` ```x```
  ```` opens none. Before, the judge toggled on any ``` or ~~~ line, so a stamp after such a
  line could go unjudged and a sample inside a fence could be refused.
  tests/code-fences.test.tsx fails on 6 cases without this. Not seen on a screen.
- A placeholder in an Edit is read where it lands in the file, so one that lands in a code
  block, a code span or an indented code line of the file is kept as written, as the README
  says. Before, only the new text was read. tests/fill-edit.test.tsx fails on 3 cases without
  this. Not seen on a screen.

## 0.1.6 (2026-11-03)

- A stamp put into a file with `sed -i` (or `--in-place`, `-i.bak`, BSD's `-i ''`) is judged
  like one written by `echo >>`: the text of an `s` command's replacement, and of an `a`, `i`
  or `c` line. Before, `sed -i` was not read at all, so a guessed time put into a log line
  that way went through unseen. A `sed` that only prints (no `-i`) is left alone.
- When the file exists, its `s` commands are applied to its text and the changed lines are
  judged as the same Edit would be, so a date put into the middle of a sentence
  (`s/TBD/2026-11-20/` on "planned for TBD.") is not taken for a stamp. Where the
  substitution cannot be read the way sed reads it (a line range, the Nth match, `w`),
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
