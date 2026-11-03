# Purpose

Agents write guessed dates and times into changelogs, logs, release notes and handoffs.
People ask for Claude to be told the time: anthropics/claude-code#32913 (open, 11
reactions) and #73800 (closed); #91224 (open) reports a wrong date written into a file.
About ten hooks found (searched 2026-10-31) tell the agent the time; none of those found
checks a stamp it writes. Tested on three wrong stamps one agent wrote on 2026-10-31: one
33 minutes old, and two written 17 and 4 minutes ahead of the clock.

Never: block a write for any reason but a stamp in the future or a new file named for a
day that has passed, and never twice for the same line or name in the same file; judge text the file already had; write a file; send
anything off the machine.
