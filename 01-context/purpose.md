# Purpose

Agents write guessed dates and times into changelogs, logs, release notes and handoffs.
Asked for in anthropics/claude-code#32913 (open), #91224 (open) and #73800. Hooks that
exist (searched 2026-10-31, about 13) tell the agent the time; none checks a stamp the
agent is about to write. Proved on three real mistakes an agent made in one day: a stamp
33 minutes old, and two written 17 and 4 minutes ahead of the clock.

Never: block a write for any reason but a stamp in the future, and never twice for the
same stamp in the same file; judge text the file already had; write a file; send
anything off the machine.
