# Changelog

## 0.1.9 - 2026-11-07

- Checks build only the reader a change needs, skip unchanged text, and reuse parsed stamps when comparing changed lines. Long-file budget checks count file reads and text scanned instead of asserting elapsed time on a shared machine; the engine's 10 s hook limit is unchanged.

## 0.1.8 - 2026-11-06

- A stamp written to a file named by a variable is judged: `f=log/today.md; echo "- 18:30 done" >> "$f"` went through before. Claude Code wrote that form in a real terminal on 2026-11-05 and a future time passed. The name counts when a step of the command sets it to a plain value, `export` too. A value the shell works out, or one set inside `if`, a loop or a subshell, is not followed: the name counts as unknown after it. A loop's iterator, `unset` after `then` or `do`, a conditional reassignment and a background assignment forget the earlier name too. A quoted variable keeps its value literal, including a `*` or bracket in a file's name. A variable that still needs unquoted word splitting or globbing is not followed, so a stamp written through it can pass. Known limits: an initial assignment after `&&` or `||` names a possible write even if it is skipped; a word that mixes a quoted `$` with a name, such as `"$x"'$f'`, is read as if the `$` were not quoted.

- Known limit, both ways, for a name followed this way. `+=`, `read`, `declare`, `printf -v`, a `{ }` group and the second branch of a `case` do not change the name it holds, and `"$f"x` reads as `$fx`. A step that writes elsewhere can then be refused once, and it goes through when written again. `f=app; f+=.md; echo "- 18:30 done" >> "$f"` can pass a future time.

## 0.1.7 - 2026-11-05

Seen in a Claude Code terminal on 2026-11-05: a `sed -i` writing a future date into a heading was refused with the real time, and a `sed -i` with no date ran. The known limits below were not on that screen, and Claude did not try again after the refusal.

- A `sed` that cannot be worked out, such as `$a ok`, keeps what earlier steps worked out. A date an earlier `sed` made stays judged, and a replacement that matched nothing is no longer refused. That `sed` and every later step on the same file are not worked out. Each is judged only on the text it writes, with its own fences, as if the file were empty. An overwrite on that file ends this. Such a `sed` does not count toward the `sed` limit, unless only the file's emoji stop it.
- Known limit, both ways, after such a `sed`. A date a later step makes from other text can pass, as can one split across steps: with `YEAR-01-15` in notes.md, `sed -i '$a ok' notes.md; sed -i 's/YEAR/2027/' notes.md`. A date after a fence one of those steps closes can pass too. A later replacement that matches nothing or sits inside a sentence, `sed -i 's/nothing/2027-01-15/' notes.md`, is refused once and goes through when written again. tests/review-final-sed.test.tsx pins the first and the last.
- Known limit, a false refusal: past the `sed` limit of 128 MiB (the text each `sed` command runs over, added up: 33 commands on a 4 MiB file, more on a smaller one), a left-out `sed` that changed a last line with no line end can make an appended sentence read as a date. It is refused once and goes through when written again. tests/review-sed-budget.test.tsx pins it.
- Known limit, a false refusal: two `printf` steps that build one sentence on a path the shell works out, `printf 'Planned for ' >>"$D/notes.md"; printf '2027-01-15\n' >>"$D/notes.md"`, are refused once and go through when written again. Such a path names no one file and a step may be skipped, so each write is read alone.
- Known limits. A wrong date can still pass in these, as it would with no plugin. A date a `sed` makes after a step that may be skipped, when that step is an overwrite or a `sed` that opens a fence: `false && echo '```' >notes.md; echo a >>notes.md; sed -i 's/^a$/2027-01-15/' notes.md`. A date after a skipped write that would change which line closes a fence. The start of the file for a `sed` late in one command, and the other ways a changed text can end for an appended line, once 8 MiB of that file's other texts were read again or, for an appended line, 256 MiB of them were held. A date a command works out as it runs: `echo "$(date -d tomorrow +%F)" >>notes.md`, or one held in a variable. A hook has 10 s and by Claude Code's declared rules a command that takes it longer to read runs unchecked. A command's `sed` steps run over about 128 MiB of text in all, each `sed` command counted, in text files only, file by file in the order files are first named. Past that a `sed` that must be worked out is left out, wherever it stands in the command, so a date one of them makes can pass, and so can a date appended after a fence one of them would close. And 80 `printf x` steps on a 3.9 MB file that is one long line took more than 15 s, so that one runs unchecked. A `sed` that grows the text runs over more than was counted before it ran, so a few of them on a long file can run unchecked too. Not seen in real Claude Code.
- A line ended by an earlier step is judged as a line of its own, even when a later fence step may be skipped.
- A fence in one step of a shell command no longer hides a date in another step: `false && echo '```' >>notes.md; echo 2027-01-15 >>notes.md` is judged, and the same under `if`, a subshell, a function never called, a background `&` or a `sed -i`. Which steps run, and in what order, cannot be read from a command, so each write is judged on the texts an earlier step could have left, with the limits at the top of this list. A fenced example written across separate steps is refused once and goes through when written again. A command's `sed` and overwrite steps stop reading a file's earlier texts again after about 8 MiB; past that its last text is still judged, its earlier ones are not. Also not read: a redirect on the whole shell or a group, `exec >notes.md` and `{ echo 2027-01-15; } >notes.md`, is not read.
- Each text a command could leave is judged with its own fences, so an open ``` in a write that a later overwrite drops no longer hides the date in that overwrite. Known limit: a date appended right after a write with no line end reads as joined to it, even if that write was skipped by `&&` (`false && printf x >notes.md; echo 2027-01-15 >>notes.md`).
- A date a command writes is judged even when a later step of it drops the text: `echo '2027-01-15' >notes.md; false && echo ok >notes.md`, and the same under `if`, a loop, `exit` or a `sed -i`. Which steps run cannot be read from the command, and a refused text goes through when written again.
- A `#` right after an escaped space or a joined line is part of the word, so `echo '2027-01-15'\ #x >notes.md` is judged. A `$'...'` word no longer makes the next `printf` lose its escapes.
- An unquoted heredoc joins a line ending in a backslash; an empty heredoc adds no new line. A fence closes only on a line of its own mark, so a mixed ``` ```~ ``` stays inside it. The heredoc forms are in tests/review-second-forms.ts, checked against real Bash by tests/review-second-bash.ts and against the hook by the test run; the fence form is in tests/shell-older-forms.test.tsx and judged against the hook by the test run.
- A heredoc's end word is read as the shell reads it: `<<'E\F'` keeps its backslash, `<<$'E\tF'` reads its escapes, so the commands after it are judged.
- `$'...'` reads every C escape (`\x32`, octal, `\cJ`) and ends at a nul, so a date spelled that way in a here-string or a word is judged.
- `echo` takes `'-e'` in quotes as the flag it is, keeps `\12` as written (only `\012` is octal there), and stays on its line after `-n` in quotes or a `\c`; a `-n` after the text is text.
- One file spelled two ways counts as one: a `sed -i` on `./notes.md` after a write to `notes.md` in the same command is judged, also `a/./notes.md` and `a//notes.md`. Before, it read as a missing file and its date was missed.
- `echo` reads escapes only when `-e` is the last of `-e` and `-E`, as bash does, so `echo 'a\n2027-01-15'` opens no new line and is no longer refused. `echo -e` reads every escape, not only `\n`.
- A heredoc with no exact end line runs to the end of the command, as bash takes it, so its date is judged; `EOF ` with a space after it is no end line. A here-string (`cat <<< "text" >> notes.md`) is read too. 3 of the 5 cases in tests/review-ts-0.1.7.test.tsx fail without this; the other two cover the emoji cut below and a `printf` width past what a string holds.
- A redirect on another descriptor (`3</dev/null`) or a reopened `</dev/stdin` leaves a heredoc in place, so its date is judged. A line ending in an escaped `\|` does not run on into the next. tests/review-bash-parity.test.tsx fails on 3 cases without this.
- In `printf`, a `*` precision reads octal and hex and a negative one counts as none, a quoted argument (`"'A"`) is that character's number, `%#.0o` keeps its zero, `%.2b` and `%.2s` count bytes, and a number past 64 bits stops at the limit. Checked against bash 5.2's own printf; tests/review-bash-parity.test.tsx fails on 6 cases without this.
- A file written in several steps is judged as the shell leaves it: a `printf` or `echo -n` runs on into the next write, `cat 0<<EOF` is read as a heredoc, and a quoted `'--'` ends printf's options. tests/review-shell-parser.test.tsx fails on 4 cases without this.
- `printf` reads numbers and escapes as bash does: `%x` and `%o`, the `+`, space and `#` flags, `0x` and `0` arguments, `*` for a width, `%n`, `\\c` in `%b`, hex, unicode and octal escapes. tests/printf-kinds.test.tsx fails on 11 cases without this.
- `$((1<<x))` is a shift, not a heredoc, even when a later line reads `x`. A redirect may come before its command (`>notes.md cat <<EOF`). The last input redirect wins, so a `</dev/null` after a heredoc drops it. A line ending in a pipe goes on to the next. A file name with an escaped bracket, star or dollar (`notes\\[1\\].md`) is that literal name. tests/command-forms.test.tsx fails on 5 cases without this.
- A `printf` is judged on what its format prints (`printf 'Planned for %s.\n' 2027-01-15` is a
  sentence): `%s`, `%b`, `%c`, whole numbers with their width and padding, `%%`, and the format
  used again while arguments are left. Before, each argument counted as a line of its own, so
  that sentence was refused, and a date built from numbers was missed. A format the shell works
  out as it runs still leaves each argument alone on a line. tests/printf-formats.test.tsx fails
  on 13 cases without this.
- A file down a pipeline is judged on the text that reaches it. Text a command sends elsewhere
  (`echo ... > out.dat | tee notes.md`, also `&>`, `>&2`, `/dev/null` or a redirect on a subshell)
  stops there, a file before the command gets none of it, and a later `echo` or heredoc is its own
  text. Before, every file in the pipeline got the first command's text, so a later `echo` into a
  file was not judged. tests/pipeline-targets.test.tsx fails on 17 cases without this.
- A code fence inside a list item is code, as a Markdown reader shows it: indented under the item
  by spaces or a tab, on the marker's own line, or under a nested or numbered item. Before, a date
  in such a sample was refused, and a placeholder in one was filled. The fence ends with its item
  when a line sits left of the item's text. tests/code-fences.test.tsx fails on 9 cases without
  this.
- A `sed -i` on a file the same command made earlier is judged on what it leaves there
  (`echo "- TBD" > n.md; sed -i 's/TBD/.../' n.md`). Before, it counted as an edit of a missing
  file and was dropped. tests/files-made-in-a-command.test.tsx fails on 4 cases without this.
- A heredoc is read wherever its command stands: behind `then`, `do`, `else`, `elif`, `(`, `{`,
  `!`, a variable, `env` or another wrapper, with `<<-` (tabs taken off) or `<<\EOF`, and in
  command order among the other writes of the command. A heredoc for another program no longer
  counts as the input of a `cat` earlier on the line. A `(` or `)` in quotes inside `$(...)` no
  longer hides the redirect after it. tests/heredoc-commands.test.tsx fails on 19 cases without
  this.
- A backslash at a line's end joins the two lines as bash does: a command split over lines
  (`sed -i \` with the script on the next line, `echo ... >> \` with the file on the next, a
  heredoc's redirect) is read as one. tests/line-continuations.test.tsx fails on 7 cases without
  this.
- The README and this log said `sed -i -f` falls back to judging the written text. It does not: a
  script read from a file is not read, and the README says so now. The `staleNotes` setting says
  that a new file named for a past day is still refused with it off. The README lists `CHANGES`
  and `RELEASE` among the checked names and says any shell write reads its file.
- A shell write is now read word by word, quotes resolved. A `>` inside the echoed text no
  longer hides the real file or stands for a write that never happens (`echo "... > notes.md"`
  with no redirect is left alone), and a quoted name or `my\ notes.md` is one file, in an echo
  and a heredoc. `tee --append`, `tee -a -i` and every file a `tee` names are read, and an
  echo after a heredoc on the heredoc line is judged. tests/shell-targets.test.tsx fails on 11
  cases without this.
- An `echo` or `printf` with its text outside quotes (`echo 2026-10-31 18:30 deploy >>
  log.md`) is judged on what it prints. Before, the line began with the word `echo`, so no
  stamp was found. An echo's quoted words join with spaces as the shell prints them.
  tests/shell-forms.test.tsx fails on 5 cases without this.
- A write behind `then`, `do`, `else`, `if`, `while`, `until`, `!` or `{` in its own part of a
  command is judged, and a comment is skipped, so an apostrophe in one (`# don't forget`) no
  longer hides the command after it. A compound command with its redirect after the closing
  word (`{ ...; } >> log.md`, `done >> log.md`) is still not read. tests/shell-forms.test.tsx
  fails on 5 cases without this.
- A shell `$'...'` quote keeps its `\'` and any `;` inside it when the command is cut into
  parts, so what it writes is judged. tests/shell-forms.test.tsx fails on 2 cases without
  this.
- A `sed -i` on a glob or a variable path (`*.md`, `"$HOME/log.md"`) is judged on the text it
  writes, when the path as written ends in a text file's name. Before, the path counted as a
  missing file and the write was dropped. A file behind a variable no longer counts as new, so
  its name is not refused. A quoted name that holds `[` or `$` (`'notes[1].md'`) is that one
  file, looked up like any other. tests/shell-unknown-paths.test.tsx fails on 5 cases without
  this, tests/literal-file-names.test.tsx on 7.
- A `sed -i` script glued to its option (`-e's/a/b/'`, `-ne'...'`, `-Ee'...'`) is read.
  Before, it was skipped as an unknown option. tests/sed-forms.test.tsx fails on 4 cases
  without this.
- A `-e` script beside a `sed -i -f` file is judged by the text it writes. Before, one `-f`
  dropped the whole command. tests/sed-forms.test.tsx fails on 4 cases without this.
- The `a\`, `i\` and `c\` form of `sed -i` with its text on the next line, a text continued
  over lines ending in a backslash, and a text in the `-e` after `a\` are judged. Before, that
  text was lost, and the README says these lines are judged. tests/sed-forms.test.tsx fails on
  6 cases without this.
- A Write or an Edit whose file cannot be read or looked at (over 4 MiB, a network location)
  is judged on the text it adds, as a shell write already was, and a shell command keeps
  judging its other files. Before, one failed look dropped the judgment on the whole call.
  tests/failed-reads.test.tsx fails on 5 cases without this; the failures there are mocked,
  not a real large file or share.
- A line cut to 120 units for a refusal no longer splits an emoji in two, so the refusal
  Claude reads is well formed text. tests/long-lines.test.tsx fails on 3 cases without this.

- A dated time range (`- 2026-10-31 10:00-11:30 standup`) is no longer read as a time with the
  offset -11:30 and refused as future. When the end is after the start, the text is judged
  both ways and called wrong only if wrong under both; a time with `T` or seconds keeps its
  offset. tests/time-ranges.test.tsx fails on 5 cases without this.
- The judge and the placeholder fill read a code fence the same one way: closed only by the
  same mark, as long or longer, with nothing after it, and a line with inline ```` ```x```
  ```` opens none. Before, the judge toggled on any ``` or ~~~ line, so a stamp after such a
  line could go unjudged and a sample inside a fence could be refused.
  tests/code-fences.test.tsx fails on 6 cases without this.
- A placeholder in an Edit is read where it lands in the file, so one that lands in a code
  block, a code span or an indented code line of the file is kept as written, as the README
  says. Before, only the new text was read. tests/fill-edit.test.tsx fails on 3 cases without
  this.

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
