import type { EngineInterface, Register } from 'claude-code'
import { dateOfFile, dayOf, judge, LIMITS, newStamps } from './stamps'
import type { Limits, Verdict } from './stamps'

// date-check, the hooks module. Before a Write, an Edit, or a shell command that appends to
// a file lands, it finds the date and time stamps the agent added (stamps.ts says which
// count) and compares each with the real clock, $.clock.now():
// - a stamp in the future is refused, and the refusal tells the agent the real date and time;
//   the same line written to the same file a second time goes through (a deadline or a plan
//   can be in the future on purpose), with a note;
// - a stamp older than the limits goes through with a note the agent reads after the result.
// Lines the file already had are never judged: only what this call adds. Only Markdown and
// text files (isText): a date in code is data, not a stamp.

type Options = { aheadMinutes?: unknown; staleMinutes?: unknown; staleDays?: unknown; staleNotes?: unknown }
type Call = { tool: string; file_path?: string; content?: string; old_string?: string; new_string?: string; replace_all?: boolean; command?: string }

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d)

/** Files whose stamps are judged: Markdown and plain text, logs, and changelog-like names. Code is not. */
export const isText = (path: string) =>
  /\.(?:md|markdown|mdx|txt|text|rst|adoc|asciidoc|org|log)$/i.test(path) ||
  /(?:^|[/\\])(?:CHANGELOG|CHANGES|HISTORY|NEWS|RELEASES?|NOTES)$/i.test(path)

const TARGET = String.raw`["']?([^\s"';|&<>()]+)`
const target = (part: string) =>
  (new RegExp(String.raw`(?:^|[^\d<>&])>>?\s*` + TARGET).exec(part) ?? new RegExp(String.raw`\btee\s+(?:-a\s+)?` + TARGET).exec(part))?.[1]

/**
 * The file a shell command writes text to, and the text: a `cat` or `tee` heredoc whose own
 * line redirects to a file, or an `echo`/`printf` whose own part of the command (between
 * `&&`, `||`, `;` and new lines) sends it to a file with `>>`, `>` or `| tee`.
 */
export const shellWrite = (command: string): { file: string; text: string } | undefined => {
  const clean = command.replace(/\d?>&\d|&>\s*\/dev\/null|\d?>\s*\/dev\/null/g, '')
  const doc = /^[ \t]*(?:cat|tee)\b([^\n]*)<<-?\s*['"]?(\w+)['"]?([^\n]*)\n([\s\S]*?)\n\s*\2\s*$/m.exec(clean)
  if (doc) {
    const file = target(`${doc[1]} ${doc[3]}`) ?? (/^[ \t]*tee\b/m.test(doc[0]) ? target(doc[0].split('\n')[0]!) : undefined)
    if (file && file !== '/dev/null') return { file, text: doc[4]! }
  }
  let file: string | undefined
  const texts: string[] = []
  for (const part of clean.replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1\s*$/gm, '').split(/&&|\|\||;|\n/)) {
    if (!/^\s*(?:echo|printf)\b/.test(part)) continue
    const to = target(part.replace(/\|\s*tee\b/, ' tee'))
    if (!to || to === '/dev/null' || (file !== undefined && to !== file)) continue
    file = to
    const said = [...part.matchAll(/(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/g)].map(m => (m[1] ?? m[2] ?? '').replace(/\\n/g, '\n'))
    texts.push(said.length ? said.join('\n') : part)
  }
  return file === undefined ? undefined : { file, text: texts.join('\n') }
}

/** What a call changes in which file: the file's text before and after it. */
async function change($: EngineInterface, x: Call): Promise<{ file: string; before: string; after: string }> {
  const none = { file: '', before: '', after: '' }
  if (x.tool === 'Write' && typeof x.content === 'string' && x.file_path) {
    const before = (await $.fs.exists(x.file_path)) ? await $.fs.read(x.file_path) : ''
    return { file: x.file_path, before, after: x.content }
  }
  if (x.tool === 'Edit' && typeof x.new_string === 'string' && typeof x.old_string === 'string' && x.file_path) {
    const before = (await $.fs.exists(x.file_path)) ? await $.fs.read(x.file_path) : ''
    // The whole file after the edit, so a date inside a sentence or a code block reads as one.
    if (x.old_string && before.includes(x.old_string)) {
      const after = x.replace_all ? before.split(x.old_string).join(x.new_string) : before.replace(x.old_string, () => x.new_string!)
      return { file: x.file_path, before, after }
    }
    return { file: x.file_path, before: x.old_string, after: x.new_string }
  }
  if (x.tool === 'Bash' && typeof x.command === 'string') {
    const w = shellWrite(x.command)
    return w ? { file: w.file, before: '', after: w.text } : none
  }
  return none
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
  // A future stamp refused once, by file and line: written again after that refusal, it is
  // meant. Each refusal and each call's start take a number in order, so a call that began
  // before the refusal (two calls at once) is refused too.
  const meant = new Map<string, number>()
  let order = 0

  on('tool.call', async ($, e, next) => {
    const x = e as unknown as Call
    if (x.tool !== 'Write' && x.tool !== 'Edit' && x.tool !== 'Bash') return next(e)
    const began = ++order
    let verdicts: Verdict[] = []
    let file = ''
    try {
      const now = await $.clock.now()
      const w = await change($, x)
      file = w.file
      if (file && isText(file) && w.after) {
        // Bare times in a file named for a later day are a plan for that day, not stamps.
        const day = dateOfFile(file)
        verdicts = judge(newStamps(w.before, w.after, day && day <= dayOf(now) ? day : undefined), now, limits)
      }
    } catch {
      // A failure of this mod never stops the call.
      verdicts = []
    }
    const key = (v: Verdict) => `${file}\n${v.stamp.line}`
    const future = verdicts.filter(v => v.kind === 'future')
    const fresh = future.filter(v => !((meant.get(key(v)) ?? Infinity) < began))
    if (fresh.length) {
      for (const v of fresh) meant.set(key(v), ++order)
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
