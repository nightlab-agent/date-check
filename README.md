# date-check

A Claude Code mod that checks the dates and times Claude writes into your files
against the real clock, before the write lands.

Agents guess the time. A changelog entry dated two days ahead, a log line
stamped 15:50 when it is 15:33, a handoff "updated" an hour ago that was written
now. Asked for in
[anthropics/claude-code#32913](https://github.com/anthropics/claude-code/issues/32913).
A mod (a plugin that changes what Claude Code does) can read the real clock;
this one reads it at the moment Claude writes a stamp.

![Claude Code refused a log line stamped 23:40 at 16:52 by date-check, with the real time, then writing it on purpose the second time](https://raw.githubusercontent.com/nightlab-agent/date-check/05207bd26080d84aee98e450e2ca5f46a711da66/docs/preview.png)

Seen in a Claude Code 2.1.312 terminal (120 columns) on 2026-10-31 at 16:52.
Asked to add a log line starting with 23:40, Claude's first write was refused
with the real time. Because the request had named 23:40, Claude wrote the same
line again, it went through, and Claude told the person it was later than now.
The same happened with a changelog entry dated 2026-11-03. A stamp Claude
guesses on its own, and the note on an old stamp, have not yet been seen on a
screen.

- A stamp more than 2 minutes in the future is refused, and the refusal tells
  Claude the real date and time. If the future date is meant (a deadline, a
  planned release), Claude writes the same text again and it goes through.
- A time more than 30 minutes old today, or a date more than a day old, goes
  through with a note to Claude: fine for a record of the past, a fix for one
  meant as now.
- What counts as a stamp: a date in a Markdown heading (`## 0.2.0 (2026-11-03)`),
  a labelled field (`Date:`, `Updated:`, `Released:`, `date:` in frontmatter),
  or a date or date and time at the start of a line. A bare `16:05` at the start
  of a line counts only in a file whose name has a date (`log/2026-10-31.md`).
- Not a stamp: a date inside a sentence ("the outage on 2024-03-01"), anything
  in a code block, and any line the file already had. Only what the call adds
  is judged.
- Dates are found as `YYYY-MM-DD`, with an optional time and zone
  (`2026-10-31 16:05`, `2026-10-31T20:05Z`). Other formats (`Oct 31, 2026`) are
  not checked yet.
- It checks Write, Edit, and shell commands that write to a file with `>>`,
  `>` or `tee`.

Settings (asked when you enable the plugin): minutes ahead allowed (2), minutes
behind before a note (30), days behind before a note (1), notes on old stamps
(on).

## What it writes

Nothing. It reads the file a Write is about to replace, to judge only the new
lines. Nothing leaves your machine through this mod: it makes no network calls.

## How it works

- `tool.call` on Write, Edit and Bash: finds the stamps the call adds, compares
  each with Claude Code's clock, and either refuses the call with the real time
  or passes it on and adds a note after its result. A failure of the mod itself
  never stops the call.

## Install

One line at the Claude Code prompt:

```
/plugin install date-check --marketplace nightlab-agent/date-check
```

Answer `y` to add the marketplace, then pick a scope. The same from a shell:

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
