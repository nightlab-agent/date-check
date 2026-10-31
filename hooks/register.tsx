import type { EngineInterface, Register } from 'claude-code'
import { addedLines, dateOfFile, judge, LIMITS, stampsIn } from './stamps'
import type { Limits, Verdict } from './stamps'

// date-check, the hooks module. Before a Write, an Edit, or a shell command that appends to
// a file lands, it finds the date and time stamps the agent added (stamps.ts says which
// count) and compares each with the real clock, $.clock.now():
// - a stamp in the future is refused, and the refusal tells the agent the real date and time;
//   the same stamp written to the same file a second time goes through (a deadline or a plan
//   can be in the future on purpose), with a note;
// - a stamp older than the limits goes through with a note the agent reads after the result.
// Lines the file or the edit already had are never judged: only what this call adds.

type Options = { aheadMinutes?: unknown; staleMinutes?: unknown; staleDays?: unknown; staleNotes?: unknown }
type Call = { tool: string; file_path?: string; content?: string; old_string?: string; new_string?: string; command?: string }

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d)

/** The file a shell command writes to with `>>`, `>` or `tee`, and the text it writes. */
export const shellWrite = (command: string): { file: string; text: string } | undefined => {
  const to = /(?:>>?|\btee\s+(?:-a\s+)?)\s*["']?([^\s"';|&<>]+)/.exec(command.replace(/\d?>&\d|&>\s*\/dev\/null|\d?>\s*\/dev\/null/g, ''))
  if (!to || to[1] === '/dev/null') return undefined
  // A heredoc's body, else what echo or printf print, else the command itself.
  const doc = /<<-?\s*['"]?(\w+)['"]?[^\n]*\n([\s\S]*?)\n\s*\1\s*$/m.exec(command)
  if (doc) return { file: to[1]!, text: doc[2]! }
  const said = [...command.matchAll(/\b(?:echo|printf)\s+(?:-[a-z]+\s+)*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/g)]
    .map(m => (m[1] ?? m[2] ?? '').replace(/\\n/g, '\n'))
  return { file: to[1]!, text: said.length ? said.join('\n') : command }
}

/** What a call adds to which file: a Write's new lines, an Edit's, a shell command's appended text. */
async function added($: EngineInterface, x: Call): Promise<{ file: string; text: string }> {
  if (x.tool === 'Write' && typeof x.content === 'string' && x.file_path) {
    const before = (await $.fs.exists(x.file_path)) ? await $.fs.read(x.file_path) : ''
    return { file: x.file_path, text: addedLines(before, x.content) }
  }
  if (x.tool === 'Edit' && typeof x.new_string === 'string' && x.file_path)
    return { file: x.file_path, text: addedLines(x.old_string ?? '', x.new_string) }
  if (x.tool === 'Bash' && typeof x.command === 'string') return shellWrite(x.command) ?? { file: '', text: '' }
  return { file: '', text: '' }
}

const quote = (v: Verdict) => `"${v.stamp.text}" (in: ${v.stamp.line})`

export const refusal = (vs: Verdict[]) =>
  `date-check: ${vs.map(quote).join('; ')} ${vs.length === 1 ? 'is' : 'are'} in the future. ` +
  `It is ${vs[0]!.real} now (local time). Write the real date and time, or leave the stamp out. ` +
  `If a future date is meant (a deadline, a planned release), write the same text again and it goes through.`

export const staleNote = (vs: Verdict[]) =>
  `date-check: ${vs.map(quote).join('; ')} ${vs.length === 1 ? 'is' : 'are'} older than now (${vs[0]!.real}, local time). ` +
  `If ${vs.length === 1 ? 'it records' : 'they record'} something past, leave ${vs.length === 1 ? 'it' : 'them'}; if ${vs.length === 1 ? 'it was' : 'they were'} meant as now, correct ${vs.length === 1 ? 'it' : 'them'}.`

export const register: Register = (on, options: Options = {}) => {
  const limits: Limits = {
    aheadMinutes: num(options.aheadMinutes, LIMITS.aheadMinutes),
    staleMinutes: num(options.staleMinutes, LIMITS.staleMinutes),
    staleDays: num(options.staleDays, LIMITS.staleDays),
  }
  const notes = options.staleNotes !== false
  // A future stamp refused once, by file and text: written again, it is meant.
  const meant = new Set<string>()

  on('tool.call', async ($, e, next) => {
    const x = e as unknown as Call
    if (x.tool !== 'Write' && x.tool !== 'Edit' && x.tool !== 'Bash') return next(e)
    let verdicts: Verdict[] = []
    let file = ''
    try {
      const w = await added($, x)
      file = w.file
      if (w.text) verdicts = judge(stampsIn(w.text, dateOfFile(file)), await $.clock.now(), limits)
    } catch {
      // A failure of this mod never stops the call.
      verdicts = []
    }
    const future = verdicts.filter(v => v.kind === 'future')
    const fresh = future.filter(v => !meant.has(`${file}\n${v.stamp.text}`))
    if (fresh.length) {
      for (const v of fresh) meant.add(`${file}\n${v.stamp.text}`)
      return { deny: refusal(fresh) }
    }
    const done = await next(e)
    if (done.deny !== undefined || done.isError) return done
    const said = [
      ...(future.length ? [`date-check: kept ${future.map(v => `"${v.stamp.text}"`).join(', ')} as written the second time (a date in the future on purpose).`] : []),
      ...(notes && verdicts.some(v => v.kind === 'stale') ? [staleNote(verdicts.filter(v => v.kind === 'stale'))] : []),
    ]
    return said.length ? { ...done, context: [...(done.context ?? []), ...said] } : done
  })
}
