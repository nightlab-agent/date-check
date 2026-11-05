import type { EngineInterface } from 'claude-code'
import { endKey, fencesFrom } from './fences'
import type { FenceEnd } from './fences'
import { applySed, sedCommands } from './sed'
import type { ShellWrite } from './writes'

// A shell command's writes to one file, worked out step by step: register.tsx judges the texts.

// The engine rejects a read over 4 MiB and an exists on a network location. The text a call adds
// is known all the same, so one file that cannot be looked at costs only what it held.
/** Whether a file exists; undefined when the engine cannot say. */
export async function existsAt($: EngineInterface, file: string) {
  try {
    return await $.fs.exists(file)
  } catch {
    return undefined
  }
}
/** A file's text; undefined when the engine cannot read it. */
export async function readAt($: EngineInterface, file: string) {
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
/** How much text a command's seds may run over, each sed command counted, file by file, one that crosses it left out wherever it stands: the hook has 10 s. */
const SED_BYTES = 128 * 1024 * 1024

/** Where a reading of `text` ends, going on from `start`. */
const fenceEnd = (text: string, start?: FenceEnd) => fencesFrom(text.split(/\r?\n/), start).end

/** One file's text before and after a shell command's writes to it; undefined when it cannot be read or applied. */
export async function applied($: EngineInterface, file: string, writes: ShellWrite[], exists: boolean, work: { sed: number }) {
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
  const alone: string[] = []
  let unknown = false
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
    // An overwrite says the whole text again, so the steps after it can be worked out.
    if (unknown && !w.replaces) {
      alone.push(w.text)
      continue
    }
    unknown = false
    const commands = w.sed ? Math.max(1, w.sed.scripts.reduce((n, s) => n + sedCommands(s).length, 0)) : 0
    if (w.sed) {
      // Past a sed that cannot be run the text is unknown: what was worked out stays judged, and this
      // step and the later ones are read alone, since no earlier text can be said to sit around them.
      if (w.sed.scriptFile || (after !== '' && applySed('x\n', w.sed.scripts, w.sed.ere, w.sed.z) === undefined)) {
        unknown = true
        alone.push(w.text)
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
      unknown = true
      alone.push(w.text)
      continue
    }
    after = next
    states.push(after)
    end = from && fenceEnd(line, from)
    if (end) endNow()
    if (!from || endKey(end!) === endKey(from)) plain = shared ? after : (step(plain) ?? plain)
  }
  return { file, before, after, also, alone }
}
