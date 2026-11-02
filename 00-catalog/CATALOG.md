# Catalog

| File | Holds |
|---|---|
| `CLAUDE.md` | What the mod is and its rules. |
| `01-context/purpose.md` | Who asked for it and what it must never do. |
| `04-memory/STATE.md` | What is true now: version, seen where, open questions. |
| `04-memory/log/` | One dated file per working session. |
| `hooks/stamps.ts` | Finding stamps in text and judging them against the clock (pure). |
| `hooks/register.tsx` | The hooks module. |
| `tests/*.test.tsx` | The tests (`date-check.test.tsx` holds the three real mistakes; `review*.test.tsx` and `*-review.test.tsx` each hold a reported bug as a case that failed before the fix, beside a comparison case). |
| `tests/release.sh` | The release check. |
| `.github/ISSUE_TEMPLATE/` | The bug report form: the line written, what date-check said, the local time and zone, the versions. |
| `preview/project/` | The sample project the screen preview opens. |
