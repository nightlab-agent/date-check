import type { EngineInterface, Register } from 'claude-code'
import { clockText, dateOfFile, dayOf, fillNow, gapText, judge, judgeName, LIMITS, newStamps, unfill } from './stamps'
import type { Limits, Verdict } from './stamps'

// date-check, the hooks module. Before a Write, an Edit, or a shell command that appends to
// a file lands, it finds the date and time stamps the agent added (stamps.ts says which
// count) and compares each with the real clock, $.clock.now():
// - a stamp in the future is refused, and the refusal tells the agent the real date and time;
//   the same line written to the same file a second time goes through (a deadline or a plan
//   can be in the future on purpose), with a note;
// - a stamp older than the limits goes through with a note the agent reads after the result.
// - a new file whose name carries a day more than staleDays past (logs/2025-06-12.md written
//   on 2026-11-01) is refused once with the real date, the same way; a later day is a plan.
// Lines the file already had are never judged: only what this call adds. Only Markdown and
// text files (isText): a date in code is data, not a stamp.
// And before the agent writes anything: each prompt carries the clock (promptClock), the local
// weekday, date, time and zone, and how long ago the person's previous message came, so the
// agent has the real time instead of a guess.
// And so the agent need not type a time at all: ⟦NOW⟧, ⟦DATE⟧, ⟦TIME⟧ and ⟦NOW-ISO⟧ in what a
// call writes are filled from the clock as it lands (fill; fillNow says which spellings).

type Options = { aheadMinutes?: unknown; staleMinutes?: unknown; staleDays?: unknown; staleNotes?: unknown; promptClock?: unknown; fill?: unknown }
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
async function change($: EngineInterface, x: Call): Promise<{ file: string; before: string; after: string; created?: boolean }> {
  const none = { file: '', before: '', after: '' }
  if (x.tool === 'Write' && typeof x.content === 'string' && x.file_path) {
    const exists = await $.fs.exists(x.file_path)
    const before = exists ? await $.fs.read(x.file_path) : ''
    return { file: x.file_path, before, after: x.content, created: !exists }
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
    if (!w) return none
    // Whether the shell's file is new is only known when its path means one place: not under
    // `~` (the engine does not expand it) and not after a `cd` in the same command.
    const sure = !w.file.startsWith('~') && !/(?:^|[;&|\n]\s*)(?:cd|pushd)\s/.test(x.command)
    return { file: w.file, before: '', after: w.text, created: sure && !(await $.fs.exists(w.file)) }
  }
  return none
}

const quote = (v: Verdict) => `"${v.stamp.text}" (in: ${v.stamp.line})`

export const refusal = (vs: Verdict[]) =>
  `date-check: ${vs.map(quote).join('; ')} ${vs.length === 1 ? 'is' : 'are'} in the future. ` +
  `It is ${vs[0]!.real} now. Write the real date and time, or leave the stamp out. ` +
  `If a future date is meant (a deadline, a planned release), write the same text again and it goes through.`

export const nameRefusal = (file: string, n: { date: string; real: string }) =>
  `date-check: the new file's name says ${n.date} (${file.split(/[/\\]/).pop()}), a day that has passed. ` +
  `It is ${n.real} now. If the file is for today, name it for today. ` +
  `If that date is meant (a record of that day), write the same file again and it goes through.`

export const staleNote = (vs: Verdict[]) =>
  `date-check: ${vs.map(quote).join('; ')} ${vs.length === 1 ? 'is' : 'are'} older than now (${vs[0]!.real}). ` +
  `If ${vs.length === 1 ? 'it records' : 'they record'} something past, leave ${vs.length === 1 ? 'it' : 'them'}; if ${vs.length === 1 ? 'it was' : 'they were'} meant as now, correct ${vs.length === 1 ? 'it' : 'them'}.`

/** Prompts the person sent: typed, from Remote Control or Slack, or the SDK host's own turn. */
const PERSON = new Set(['composer', 'bridge', 'slack-ping', 'sdk'])

export const clockLine = (now: number, since?: number, fill = true) =>
  `date-check: it is ${clockText(now)}.` +
  (since === undefined ? '' : ` The person's previous message came ${gapText(now - since)} ago.`) +
  (fill ? ' To record the moment a file is written, write ⟦NOW⟧ (date and time), ⟦DATE⟧ (also in a file name) or ⟦TIME⟧: the clock fills it in as the write lands.' : '')

/** The call with its placeholders filled from the clock (the text it writes, and a Write's or Edit's file path), and which ones were. */
const filledCall = (x: Call, now: number): { call: Call; filled: string[] } => {
  const key = x.tool === 'Write' ? 'content' : x.tool === 'Edit' ? 'new_string' : 'command'
  const call: Call = { ...x }
  const filled = new Set<string>()
  const v = x[key]
  if (typeof v === 'string' && v.includes('⟦')) {
    const f = fillNow(v, now, x.tool !== 'Bash')
    if (f.filled.length) { call[key] = f.text; f.filled.forEach(t => filled.add(t)) }
  }
  if (x.tool !== 'Bash' && x.file_path?.includes('⟦')) {
    const f = fillNow(x.file_path, now, false)
    if (f.filled.length) { call.file_path = f.text; f.filled.forEach(t => filled.add(t)) }
  }
  return filled.size ? { call, filled: [...filled] } : { call: x, filled: [] }
}

export const register: Register = (on, options: Options = {}) => {
  const limits: Limits = {
    aheadMinutes: num(options.aheadMinutes, LIMITS.aheadMinutes),
    staleMinutes: num(options.staleMinutes, LIMITS.staleMinutes),
    staleDays: num(options.staleDays, LIMITS.staleDays),
  }
  const notes = options.staleNotes !== false
  const fill = options.fill !== false
  // A future stamp refused once, by file and line: written again after that refusal, it is
  // meant. Each refusal and each call's start take a number in order, so a call that began
  // before the refusal (two calls at once) is refused too.
  const meant = new Map<string, number>()
  let order = 0

  if (options.promptClock !== false) {
    // The person's prompts in the order they entered, each with its clock reading once it
    // came back. A prompt measures its gap from the latest earlier one: not from a later one
    // whose reading came back first (two at once), and not from one dropped beneath.
    const sent: { at?: number; dropped?: boolean }[] = []
    on('prompt.submit', async ($, e, next) => {
      const me = PERSON.has(e.origin?.kind) ? { at: undefined as number | undefined, dropped: false } : undefined
      const earlier = sent.slice()
      if (me) sent.push(me)
      if (sent.length > 50) sent.splice(0, sent.length - 50)
      let line: string | undefined
      try {
        const now = await $.clock.now()
        let since: number | undefined
        if (me) {
          const before = earlier.filter(x => !x.dropped)
          // One still waiting for its reading entered with this one: under a minute.
          since = before.some(x => x.at === undefined) ? now : before.length ? Math.max(...before.map(x => x.at!)) : undefined
          me.at = now
        }
        line = clockLine(now, since, fill)
      } catch {
        // A failure of this mod never stops the prompt; a prompt with no reading is no one's previous one.
        if (me) me.dropped = true
      }
      const done = await next(line ? { ...e, context: [...(e.context ?? []), line] } : e)
      if (me && done.drop !== undefined) me.dropped = true
      return done
    })
  }

  on('tool.call', async ($, e, next) => {
    let x = e as unknown as Call
    if (x.tool !== 'Write' && x.tool !== 'Edit' && x.tool !== 'Bash') return next(e)
    const began = ++order
    let filled: string[] = []
    if (fill) {
      try {
        const f = filledCall(x, await $.clock.now())
        x = f.call
        filled = f.filled
      } catch {
        // No reading: the call goes on as written.
      }
    }
    const sent = (filled.length ? { ...e, ...x } : e) as typeof e
    let verdicts: Verdict[] = []
    let name: ReturnType<typeof judgeName>
    let file = ''
    try {
      const now = await $.clock.now()
      const w = await change($, x)
      file = w.file
      if (file && isText(file) && w.created) name = judgeName(file, now, limits)
      if (file && isText(file) && w.after) {
        // Bare times in a file named for a later day are a plan for that day, not stamps.
        const day = dateOfFile(file)
        verdicts = judge(newStamps(w.before, w.after, day && day <= dayOf(now) ? day : undefined), now, limits)
      }
    } catch {
      // A failure of this mod never stops the call.
      verdicts = []
      name = undefined
    }
    // Keyed by the line as the agent wrote it, so a retry with the same placeholder a minute later is the same line.
    const key = (v: Verdict) => `${file}\n${unfill(v.stamp.line, filled)}`
    const future = verdicts.filter(v => v.kind === 'future')
    const fresh = future.filter(v => !((meant.get(key(v)) ?? Infinity) < began))
    // By the file's name alone, so a retry spelled another way (relative, absolute) is the same file.
    const nameKey = `(name)\n${file.split(/[/\\]/).pop()}`
    const freshName = name && !((meant.get(nameKey) ?? Infinity) < began) ? name : undefined
    if (fresh.length || freshName) {
      // The first refusal's number is kept: an older call refused late must not move it past a retry.
      const mark = (k: string) => { const n = ++order; meant.set(k, Math.min(meant.get(k) ?? Infinity, n)) }
      for (const v of fresh) mark(key(v))
      if (freshName) mark(nameKey)
      return { deny: [...(freshName ? [nameRefusal(file, freshName)] : []), ...(fresh.length ? [refusal(fresh)] : [])].join('\n') }
    }
    const done = await next(sent)
    if (done.deny !== undefined || done.isError) return done
    const said = [
      ...(filled.length ? [`date-check: filled from the clock: ${filled.join(', ')}.`] : []),
      ...(name ? [`date-check: kept the date ${name.date} in the new file's name as written the second time.`] : []),
      ...(future.length ? [`date-check: kept ${future.map(v => `"${v.stamp.text}"`).join(', ')} as written the second time (a date in the future on purpose).`] : []),
      ...(notes && verdicts.some(v => v.kind === 'stale') ? [staleNote(verdicts.filter(v => v.kind === 'stale'))] : []),
    ]
    return said.length ? { ...done, context: [...(done.context ?? []), ...said] } : done
  })
}
