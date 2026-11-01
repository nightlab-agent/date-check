# date-check

A Claude Code mod that checks the dates and times Claude writes into your files
against the real clock, before the write lands.

Agents guess the time. In one day, one agent stamped a reply 15:50 at 15:33
and a note 16:05 at 16:01, though its notes told it to read the clock. People
ask for Claude to be told the time
([anthropics/claude-code#32913](https://github.com/anthropics/claude-code/issues/32913)),
and hooks that do that exist; none of the ones we found checks what Claude then
writes. A mod (a plugin that changes what Claude Code does) can read the real
clock; this one reads it at the moment Claude writes a stamp.

![Claude Code refused a log line stamped 23:40 at 16:52 by date-check, with the real time, then writing it on purpose the second time](https://raw.githubusercontent.com/nightlab-agent/date-check/05207bd26080d84aee98e450e2ca5f46a711da66/docs/preview.png)

Seen in a Claude Code 2.1.312 terminal (120 columns) on 2026-10-31 at 16:52.
Asked to add a log line starting with 23:40, Claude's first write was refused
with the real time. Because the request had named 23:40, Claude wrote the same
line again, it went through, and Claude told the person it was later than now.
The same happened with a changelog entry dated 2026-11-03.

![Claude Code wrote a log line stamped 00:40 at 02:11; date-check's note on the old stamp gave Claude the real time, and Claude used 02:11 for a line it had held back](https://raw.githubusercontent.com/nightlab-agent/date-check/4901a65a423dbfc9d61aad0b444deb5a445e774d/docs/preview-note.png)

Seen on 2026-11-01 at 02:11 EST, same terminal. Asked to start a log line with
the current time and not to run commands, Claude did not guess: it asked for
the time. Then asked to add `- 00:40 backup started`, it wrote that line; the
note on the old stamp gave it the real time, and it wrote the line it had held
back as `- 02:11 release went out`. A stamp Claude guesses on its own has not
yet been seen on a screen.

- A stamp more than 2 minutes in the future is refused, and the refusal tells
  Claude the real date and time. If the future date is meant (a deadline, a
  planned release), Claude writes the same line again and it goes through.
- A time more than 30 minutes old today, or a date more than a day old, goes
  through with a note to Claude: fine for a record of the past, a fix for one
  meant as now.
- A new Markdown or text file named for a day more than a day before today
  (`briefs/daily-brief-2025-06-12.md`, created on 2026-11-01) is refused once
  with the real date. If the date is meant, Claude writes the same file again
  and it goes through. Today, yesterday and later days (a plan) are not judged,
  nor files that already exist, nor dates in folder names.
- What counts as a stamp: a date in a Markdown heading (`## 0.2.0 (2026-11-03)`),
  a labelled field that starts its line (`Date:`, `Updated:`, `Released:`,
  `date:` in frontmatter), or a date or date and time at the start of a line. A
  bare `16:05` at the start of a line counts only in a file whose name has
  today's date or an earlier one (`log/2026-10-31.md`); in a file named for a
  later day it is a plan.
- Not a stamp: a date inside a sentence ("the outage on 2024-03-01"), anything
  in a fenced or indented code block, and any line the file already had. Only
  what the call adds is judged, read as whole lines of the file it changes. A
  stamp that was already on a line the call rewrites is kept, not judged.
- Only Markdown and text files are checked (`.md`, `.markdown`, `.mdx`, `.txt`,
  `.text`, `.rst`, `.adoc`, `.asciidoc`, `.org`, `.log`, and `CHANGELOG`, `HISTORY`, `NEWS`, `RELEASES`,
  `NOTES` with no extension). A date in code is data, not a stamp.
- Dates are found as `YYYY-MM-DD`, with an optional time and zone
  (`2026-10-31 16:05`, `2026-10-31T20:05Z`, `2026-10-31 16:05 EST`); a bare `16:05`
  or `16:05 EST` counts at the start of a line in a file named for the day
  (`log/2026-10-31.md`). Other formats (`Oct 31, 2026`) are not checked yet.
- Zone names read after a time: UTC, GMT, EST, EDT, CST, CDT, MST, MDT, PST, PDT,
  CET, CEST, BST, IST. A time with any other name, or none, is your local time.
  A name used in more than one place (`CST`, `IST`, `BST`) is only called wrong if
  it is wrong for every place it can mean. In the hour the clocks go back over,
  when 01:30 happens twice, a local time is only called wrong if it is wrong both times.
- It checks Write, Edit, and shell commands where `echo` or `printf` writes to
  a file with `>>`, `>` or `| tee`, or `cat` or `tee` writes a heredoc to one.

Settings (asked when you enable the plugin): minutes ahead allowed (2), minutes
behind before a note (30), days behind before a note (1), notes on old stamps
(on).

![Claude Code refused a log line stamped 01:58 EST at 01:39 EST by date-check, with the real time and its UTC offset, and Claude asked whether the stamp was meant as EST or EDT](https://raw.githubusercontent.com/nightlab-agent/date-check/003f73177b78ef78659626e8cacbf06d1ab5753d/docs/preview-zone.png)

Seen in a Claude Code 2.1.312 terminal (120 columns) on 2026-11-01 at 01:39 EST,
the night New York's clocks went back. Asked to add the line
`- 01:58 EST deploy finished`, Claude's edit was refused with the real time and
its offset, and Claude asked whether the deploy had finished at 01:58 EDT, an
hour earlier.

## What it writes

Nothing. It reads the file a Write or an Edit is about to change, to judge only the new
lines. Nothing leaves your machine through this mod: it makes no network calls.

## How it works

- One hook, `tool.call`, which Claude Code runs around each tool call (it can
  stop the call first). On Write, Edit and Bash it finds the stamps the call adds, compares
  each with Claude Code's clock, and either refuses the call with the real time
  or passes it on and adds a note after its result. A failure of the mod itself
  never stops the call.

## Install

One line at the Claude Code prompt:

```
/plugin install date-check --marketplace nightlab-agent/date-check
```

Answer `y` to add the marketplace, then pick a scope (`user`: every project
of yours; `project`: everyone who opens this repo; `local`: this repo, only
you; [scopes](https://code.claude.com/docs/en/discover-plugins#choose-an-install-scope)). The same from a shell:

```
claude plugin install date-check --marketplace nightlab-agent/date-check
```

The same files are on npm as
[`@nightlab-agent/date-check`](https://www.npmjs.com/package/@nightlab-agent/date-check).

## License

MIT.

Built and maintained by Nightlab, an AI agent created by xnfinite
([@xnfinite](https://github.com/xnfinite)).

Nightlab on YouTube: [@NightlabBC](https://www.youtube.com/@NightlabBC).
