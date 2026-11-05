import type { EngineInterface, Register } from 'claude-code'
import { clockText, dateOfFile, dayOf, fillEdit, fillNow, gapText, judge, judgeName, LIMITS, stampReader, unfill } from './stamps'
import type { Limits, Verdict } from './stamps'
import { endKey, fencesFrom } from './fences'
import type { FenceEnd } from './fences'
import { applySed, sedCommands } from './sed'
import { isText, PIPED, shellWrites } from './writes'
import type { ShellWrite } from './writes'

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

// The engine rejects a read over 4 MiB and an exists on a network location. The text a call adds
// is known all the same, so one file that cannot be looked at costs only what it held.
/** Whether a file exists; undefined when the engine cannot say. */
const existsAt = async ($: EngineInterface, file: string) => {
  try {
    return await $.fs.exists(file)
  } catch {
    return undefined
  }
}
/** A file's text; undefined when the engine cannot read it. */
const readAt = async ($: EngineInterface, file: string) => {
  try {
    return await $.fs.read(file)
  } catch {
    return undefined
  }
}

const STATES = 16
/** How much of a file's earlier text in a command is read whole again, for its sed and overwrite steps: the hook has 10 s. */
const READ_BYTES = 8 * 1024 * 1024
/** How much text one file's appended lines in a command may hold, one copy for each way a text ends: a hook shares the machine. */
const KEPT_BYTES = 256 * 1024 * 1024
/** How much text a command's seds may run over, each sed command counted, the step that crosses it and the later ones left out: the hook has 10 s. */
const SED_BYTES = 128 * 1024 * 1024

/** Where a reading of `text` ends, going on from `start`. */
const fenceEnd = (text: string, start?: FenceEnd) => fencesFrom(text.split(/\r?\n/), start).end

/** One file's text before and after a shell command's writes to it; undefined when it cannot be read or applied. */
async function applied($: EngineInterface, file: string, writes: ShellWrite[], exists: boolean, work: { sed: number }) {
  const before = exists ? await readAt($, file) : ''
  if (before === undefined) return undefined
  let after: string | undefined = before
  // Which steps run, and in what order, cannot be read from a command (`&&`, `if`, `exit`, `&`, a
  // function never called), so each write is judged on every text an earlier step could have left,
  // each reading with its own fences: a fence in one step never hides another step's text. A
  // refusal only asks for the text again. An appended line reads the same after any two texts that
  // end alike, so it is judged once for each way they end, however long the command. A sed reads the
  // whole text: the start and the last STATES of them, up to READ_BYTES in all.
  const also: string[] = []
  const states = [before]
  let end: FenceEnd | undefined
  const ends = new Map<string, string>()
  // Where the last line starts and how the text reads up to there, so an append reads on from it.
  let lastLine: { cut: number; at: FenceEnd } | undefined
  const readEnd = (text: string) => {
    if (lastLine) return fenceEnd(text.slice(lastLine.cut), lastLine.at)
    const cut = text.lastIndexOf('\n') + 1
    lastLine = { cut, at: fencesFrom(text.slice(0, cut).split(/\r?\n/).slice(0, -1)).end }
    return fenceEnd(text.slice(cut), lastLine.at)
  }
  // A text with no line end joins the next line, so it does not read like one that has one.
  const textKey = (at: FenceEnd, text: string) => `${endKey(at)}${text === '' || text.endsWith('\n')}`
  // Read only for a step that appends: a run of seds on a long file never asks.
  const endNow = () => {
    end ??= readEnd(after!)
    if (!ends.has(textKey(end, after!))) ends.set(textKey(end, after!), after!)
    return end
  }
  let spent = 0
  let kept = 0
  // The text with each step that moved a fence left out: what a sed reads when those were skipped.
  let plain = before
  if (writes.some(w => !w.sed)) endNow()
  for (const w of writes) {
    const commands = w.sed ? Math.max(1, w.sed.scripts.reduce((n, s) => n + sedCommands(s).length, 0)) : 0
    if (w.sed) {
      // A sed that cannot be run is judged on its own text and leaves what was worked out; it spends nothing.
      if (w.sed.scriptFile || applySed('x\n', w.sed.scripts, w.sed.ere, w.sed.z) === undefined) {
        also.push(w.text)
        continue
      }
      if ((work.sed += after.length * commands) > SED_BYTES) continue
    }
    if (after !== before && (w.sed || w.replaces) && spent <= READ_BYTES) {
      spent += after.length
      also.push(after)
    }
    const line = `${w.text}${w.joins || w.text.endsWith('\n') ? '' : '\n'}`
    const step = (text: string) =>
      w.sed ? (w.sed.scriptFile ? undefined : applySed(text, w.sed.scripts, w.sed.ere, w.sed.z)) : w.replaces ? line : `${text}${line}`
    if (w.sed) {
      const earlier = states.slice(0, -1)
      for (const text of earlier.length < STATES ? earlier : [before, ...earlier.slice(2 - STATES)]) {
        if (spent > READ_BYTES || work.sed > SED_BYTES) break
        spent += text.length
        work.sed += text.length * commands
        const left = step(text)
        if (left !== undefined) also.push(left)
      }
      if (plain !== after && spent <= READ_BYTES && work.sed <= SED_BYTES) {
        work.sed += plain.length * commands
        const left = step(plain)
        if (left !== undefined) also.push(left)
      }
    } else if (!w.replaces && after.endsWith('\n')) {
      // Text with no line end joins what comes next, so a skipped step leaves the same words only then.
      const here = textKey(endNow(), after)
      for (const [key, text] of ends) {
        if (key === here) continue
        // A text that only grew is read from where it left the file; one a sed changed is read whole.
        if (!text.startsWith(before)) {
          if (spent > READ_BYTES) continue
          spent += text.length
        }
        if (kept > KEPT_BYTES) continue
        kept += text.length
        also.push(step(text)!)
      }
    }
    const appends = !w.sed && !w.replaces
    const at = appends ? endNow() : undefined
    const from = after === '' || after.endsWith('\n') ? at : undefined
    if (!appends) lastLine = undefined
    const shared = plain === after
    const next = step(after)
    if (next === undefined) {
      also.push(w.text)
      continue
    }
    after = next
    states.push(after)
    end = from && fenceEnd(line, from)
    if (end) endNow()
    if (!from || endKey(end!) === endKey(from)) plain = shared ? after : (step(plain) ?? plain)
  }
  return { file, before, after, also }
}

/** The directory changes in a shell command (`cd a`, `(pushd b`): after one, a relative path means no one place. */
const dirMoves = (command: string) =>
  [...command.matchAll(/(?:^|[;&|\n({]\s*)(cd|pushd)\s+([^;&|\n)}]*)/g)].map(m => `${m[1]} ${m[2]!.trim()}`)
const movesDir = (command: string) => dirMoves(command).length > 0

/** The file as one spelling, for remembering what was refused: a relative path joined to the
 * session's directory, `.` and `..` resolved, one separator, a drive letter's path in lower
 * case, a network path in lower case. A relative path after a `cd` in the same command is kept
 * with the `cd`s before it, so it is one file only with the same moves; `~` and a failed reading
 * stay as written. */
async function placed($: EngineInterface, file: string, moves: string[] = []): Promise<string> {
  if (!file || file.startsWith('~')) return file
  const absolute = /^(?:[\\/]|[A-Za-z]:[\\/])/.test(file)
  if (!absolute && moves.length) return `${moves.join('; ')}; ${file}`
  let full = file
  if (!absolute) {
    try {
      full = `${await $.session.cwd()}/${file}`
    } catch {
      return file
    }
  }
  const drive = /^[A-Za-z]:/.exec(full)?.[0] ?? ''
  const parts: string[] = []
  for (const part of full.slice(drive.length).split(/[\\/]+/)) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  const network = /^[\\/]{2}/.test(full)
  const one = `${network ? '//' : drive}/${parts.join('/')}`.replace(/^\/\/\//, '//')
  return drive || network ? one.toLowerCase() : one
}

type Change = { file: string; before: string; after: string; also?: string[]; created?: boolean }

/** What a call changes, file by file: each file's text before and after it (a shell command may write several). */
async function changes($: EngineInterface, x: Call): Promise<Change[]> {
  if (x.tool === 'Write' && typeof x.content === 'string' && x.file_path) {
    const exists = await existsAt($, x.file_path)
    const before = exists ? await readAt($, x.file_path) : undefined
    return [{ file: x.file_path, before: before ?? '', after: x.content, created: exists === false }]
  }
  if (x.tool === 'Edit' && typeof x.new_string === 'string' && typeof x.old_string === 'string' && x.file_path) {
    const before = ((await existsAt($, x.file_path)) && (await readAt($, x.file_path))) || ''
    // The whole file after the edit, so a date inside a sentence or a code block reads as one.
    if (x.old_string && before.includes(x.old_string)) {
      const after = x.replace_all ? before.split(x.old_string).join(x.new_string) : before.replace(x.old_string, () => x.new_string!)
      return [{ file: x.file_path, before, after }]
    }
    return [{ file: x.file_path, before: x.old_string, after: x.new_string }]
  }
  if (x.tool === 'Bash' && typeof x.command === 'string') {
    const all = shellWrites(x.command)
    // Whether a shell's file is new is only known when its path means one place: not a glob or a
    // variable, not under
    // `~` (the engine does not expand it) and not after a `cd` in the same command.
    const moved = movesDir(x.command)
    const out: Change[] = []
    const work = { sed: 0 }
    for (const file of [...new Set(all.map(v => v.file))]) {
      if (!isText(file)) continue
      let ws = all.filter(v => v.file === file)
      // A path the shell works out when it runs (`*.md`, `$HOME/log.md`): as written it names no file.
      const sure = !file.startsWith('~') && !ws.some(v => v.expands) && !moved && file !== PIPED
      const exists = sure ? await existsAt($, file) : undefined
      // sed -i edits only files that exist: on a missing one it writes nothing there (and goes on to
      // the next) until a write of this command has made it.
      const made = ws.findIndex(v => !v.sed)
      if (exists === false) ws = made < 0 ? [] : ws.slice(made)
      if (!ws.length) continue
      // A file that exists or is made here: its text after the command's writes in order, judged as an Edit is.
      const r = exists === undefined ? undefined : await applied($, file, ws, exists, work)
      const created = exists === false
      // No text could be worked out: each write's own text is one reading, as a skipped step leaves it.
      const also = ws.map(v => v.text)
      out.push(r ? { ...r, created } : { file, before: '', after: ws.map(v => v.text).join('\n'), also, created })
    }
    return out
  }
  return []
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
const filledCall = async ($: EngineInterface, x: Call, now: number): Promise<{ call: Call; filled: string[] }> => {
  const key = x.tool === 'Write' ? 'content' : x.tool === 'Edit' ? 'new_string' : 'command'
  const call: Call = { ...x }
  const filled = new Set<string>()
  if (x.tool !== 'Bash' && x.file_path?.includes('⟦')) {
    const f = fillNow(x.file_path, now, false)
    if (f.filled.length) { call.file_path = f.text; f.filled.forEach(t => filled.add(t)) }
  }
  const v = x[key]
  if (typeof v === 'string' && v.includes('⟦')) {
    // An Edit lands inside a file: what it lands in decides. Its old text not there, it is read alone.
    const path = call.file_path
    const old = x.tool === 'Edit' ? x.old_string : undefined
    const file = old && path && (await existsAt($, path)) ? await readAt($, path) : undefined
    const f = old && file?.includes(old) ? fillEdit(file, old, v, now) : fillNow(v, now, x.tool !== 'Bash')
    if (f.filled.length) { call[key] = f.text; f.filled.forEach(t => filled.add(t)) }
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
        const f = await filledCall($, x, await $.clock.now())
        x = f.call
        filled = f.filled
      } catch {
        // No reading: the call goes on as written.
      }
    }
    const sent = (filled.length ? { ...e, ...x } : e) as typeof e
    // Every file the call writes is judged on its own (a shell command may write several).
    type Judged = { file: string; at: string; verdicts: Verdict[]; name: ReturnType<typeof judgeName> }
    let judged: Judged[] = []
    try {
      const now = await $.clock.now()
      for (const w of await changes($, x)) {
        if (!w.file || !isText(w.file)) continue
        const name = w.created ? judgeName(w.file, now, limits) : undefined
        // Bare times in a file named for a later day are a plan for that day, not stamps.
        const day = dateOfFile(w.file)
        const texts = [...new Set([w.after, ...(w.also ?? [])])].filter(Boolean)
        const read = stampReader(w.before, day && day <= dayOf(now) ? day : undefined)
        const found = texts.flatMap(t => judge(read(t), now, limits))
        const verdicts = found.filter((v, i) => found.findIndex(o => o.stamp.text === v.stamp.text && o.stamp.line === v.stamp.line) === i)
        judged.push({ file: w.file, at: '', verdicts, name })
      }
    } catch {
      // A failure of this mod never stops the call.
      judged = []
    }
    // Keyed by the line as the agent wrote it, so a retry with the same placeholder a minute later is the same line.
    const moves = x.tool === 'Bash' && typeof x.command === 'string' ? dirMoves(x.command) : []
    for (const j of judged) j.at = await placed($, j.file, moves)
    const key = (j: Judged, v: Verdict) => `${j.at}\n${unfill(v.stamp.line, filled)}`
    // By the placed path, so a retry spelled another way (relative, absolute) is the same file
    // and a file of the same name in another folder is not.
    const nameKey = (j: Judged) => `(name)\n${j.at}`
    const verdicts = judged.flatMap(j => j.verdicts)
    const future = verdicts.filter(v => v.kind === 'future')
    const fresh = judged.flatMap(j => j.verdicts.filter(v => v.kind === 'future' && !((meant.get(key(j, v)) ?? Infinity) < began)).map(v => ({ j, v })))
    const named = judged.filter(j => j.name)
    const freshNames = named.filter(j => !((meant.get(nameKey(j)) ?? Infinity) < began))
    if (fresh.length || freshNames.length) {
      // The first refusal's number is kept: an older call refused late must not move it past a retry.
      const mark = (k: string) => { const n = ++order; meant.set(k, Math.min(meant.get(k) ?? Infinity, n)) }
      for (const f of fresh) mark(key(f.j, f.v))
      for (const j of freshNames) mark(nameKey(j))
      return { deny: [...freshNames.map(j => nameRefusal(j.file, j.name!)), ...(fresh.length ? [refusal(fresh.map(f => f.v))] : [])].join('\n') }
    }
    const done = await next(sent)
    if (done.deny !== undefined || done.isError) return done
    const said = [
      ...(filled.length ? [`date-check: filled from the clock: ${filled.join(', ')}.`] : []),
      ...named.map(j => `date-check: kept the date ${j.name!.date} in the new file's name as written the second time.`),
      ...(future.length ? [`date-check: kept ${future.map(v => `"${v.stamp.text}"`).join(', ')} as written the second time (a date in the future on purpose).`] : []),
      ...(notes && verdicts.some(v => v.kind === 'stale') ? [staleNote(verdicts.filter(v => v.kind === 'stale'))] : []),
    ]
    return said.length ? { ...done, context: [...(done.context ?? []), ...said] } : done
  })
}
