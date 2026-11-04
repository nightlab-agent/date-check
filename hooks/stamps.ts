// Finding the date and time stamps in text an agent is about to write, and judging each one
// against the real clock. Pure: no file, no session; register.tsx feeds it text and the time.
//
// A stamp is a date or time in a place that says "this was written now": a heading that
// carries a date (a changelog release, a dated log section), a labelled field (Date:,
// Updated:, Released:, date: in frontmatter), or the opening of a line (a log line). A date
// inside a sentence ("the outage on 2024-03-01") is an event, not a stamp, and is left alone.

export type Stamp = {
  /** The text as written, e.g. `2024-06-12` or `2026-10-31 16:05`. */
  text: string
  /** The line it was found on, trimmed, for the message. */
  line: string
  /** Where it was: a heading, a labelled field, a line's opening. */
  where: 'heading' | 'field' | 'line-start'
  /** Its date, `YYYY-MM-DD`. */
  date: string
  /** Minutes after midnight when it carries a time. */
  minutes?: number
  /** A UTC offset in minutes when it carries one (`Z` is 0). */
  offset?: number
  /** A zone name written after the time (`EST`, `UTC`), when it carries one. */
  zone?: string
  /** The offset may be the end of a range (`10:00-11:30`): the time is then local too. */
  range?: boolean
}

export type Verdict = { stamp: Stamp; kind: 'future' | 'stale'; real: string }

const DATE = String.raw`(\d{4})-(\d{2})-(\d{2})`
const NAMED = String.raw`(?:(?:UTC|GMT)[+-]\d{1,2}(?::?\d{2})?(?![\d:])|(?:Z|UTC|GMT|CEST|CET|BST|IST|[ECMP][SD]T)(?![A-Za-z\d+-]))`
const ZONE = String.raw`([+-]\d{2}:?\d{2}|` + NAMED + ')'
const TIME = String.raw`(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s?` + ZONE + String.raw`?)?`
const STAMP = DATE + TIME
const LABEL = String.raw`(?:date|dated|updated|last[ _-]?updated|last[ _-]?modified|modified|released|release[ _-]?date|generated|written|created|as of|timestamp)`

const heading = new RegExp(String.raw`^\s{0,3}#{1,6}\s.*?(?<![\d-])` + STAMP + String.raw`(?![\d-])`)
const field = new RegExp(String.raw`^\s{0,3}(?:[-*+]\s+|>\s*|\|\s*)?[*_]*` + LABEL + String.raw`\**\s*[:=]\s*\**["'\x60]?(?:on\s)?` + STAMP + String.raw`(?![\d-])`, 'i')
const opening = new RegExp(String.raw`^\s*(?:[-*+]\s+|>\s*)?[\[(]?` + STAMP + String.raw`(?![\d-])`)
const timeOpening = new RegExp(String.raw`^\s*(?:[-*+]\s+|>\s*)?[\[(]?(\d{2}):(\d{2})(?::\d{2})?(?![\d:])(?:\s?(` + NAMED + String.raw`))?[\])]?(?:\s|$|[,;|-])`)

/**
 * The UTC offsets in minutes a zone name can mean. A name used for two zones (CST is
 * Chicago's winter and China's) has both: a stamp is only called wrong when it is wrong
 * under every reading.
 */
const ZONES: Record<string, number[]> = {
  UTC: [0], GMT: [0], EST: [-300], EDT: [-240], CST: [-360, 480], CDT: [-300], MST: [-420], MDT: [-360],
  PST: [-480], PDT: [-420], CET: [60], CEST: [120], BST: [60, 360], IST: [330, 60, 120],
}

const valid = (y: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** A UTC offset in minutes (`Z`, `+02:00`, `UTC+2`, `GMT-03:30`); undefined when it is not a real one. */
const offsetOf = (z: string) => {
  if (z === 'Z') return 0
  const m = /^(?:UTC|GMT)?([+-])(\d{1,2}):?(\d{2})?$/.exec(z)
  if (!m || Number(m[2]) > 14 || !['00', '15', '30', '45', undefined].includes(m[3])) return undefined
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0))
}

/** Daylight time in the United States: the second Sunday of March to the first Sunday of November. */
const usDaylight = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const sunday = (month: number, nth: number) => { const first = new Date(Date.UTC(y, month, 1)).getUTCDay(); return 1 + ((7 - first) % 7) + 7 * (nth - 1) }
  return (m > 3 || (m === 3 && d >= sunday(2, 2))) && (m < 11 || (m === 11 && d < sunday(10, 1)))
}

/** A line for a message: trimmed, cut at 120 units, never through the middle of an emoji. */
const shortLine = (line: string) => {
  const cut = line.trim().slice(0, 120)
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut
}

const build = (m: RegExpExecArray, at: number, line: string, where: Stamp['where']): Stamp | undefined => {
  const [y, mo, d] = [Number(m[at]), Number(m[at + 1]), Number(m[at + 2])]
  if (!valid(y, mo, d)) return undefined
  const hh = m[at + 3], mm = m[at + 4]
  const minutes = hh !== undefined ? Number(hh) * 60 + Number(mm) : undefined
  if (minutes !== undefined && (Number(hh) > 23 || Number(mm) > 59)) return undefined
  const date = `${m[at]}-${m[at + 1]}-${m[at + 2]}`
  const text = m[0].slice(m[0].indexOf(date)).replace(/[\])"'\x60*]+$/, '').trim()
  // `2026-10-31 10:00-11:30` reads as a time and offset, or as a range if the end is after the
  // start. With `T` or seconds it is the first: that is how a clock prints a time.
  const end = / \d\d:\d\d\s?-(\d\d):(\d\d)$/.exec(m[0])
  const range = end && minutes! < Number(end[1]) * 60 + Number(end[2]) ? { range: true } : {}
  return { text, line: shortLine(line), where, date, ...(minutes !== undefined ? { minutes } : {}), ...zoneOf(m[at + 5]), ...range }
}

const zoneOf = (written: string | undefined) => {
  if (written === undefined) return {}
  const z = written.toUpperCase()
  if (ZONES[z]) return { zone: z }
  const offset = offsetOf(z)
  return offset === undefined ? {} : { offset }
}

/** A `YYYY-MM-DD` date in a file's name (logs/2026-10-31.md), the day its bare line times belong to. */
export const dateOfFile = (path: string) => {
  const m = /(?:^|[^\d])(\d{4})-(\d{2})-(\d{2})(?!\d)[^/\\]*$/.exec(path)
  return m && valid(Number(m[1]), Number(m[2]), Number(m[3])) ? `${m[1]}-${m[2]}-${m[3]}` : undefined
}

/** A line inside an indented code block: four spaces or a tab, not a list item. */
const indentedCode = (line: string) => /^(?: {4}|\t)/.test(line) && !/^\s*(?:[-*+]|\d+[.)])\s/.test(line)

/** The stamp a line carries, if any. `fileDate` lets a bare `16:05` opening a line count as a stamp of that day. */
const lineStamp = (line: string, fileDate?: string): Stamp | undefined => {
  let m: RegExpExecArray | null
  if ((m = heading.exec(line))) return build(m, 1, line, 'heading')
  if ((m = field.exec(line))) return build(m, 1, line, 'field')
  if ((m = opening.exec(line))) return build(m, 1, line, 'line-start')
  if (fileDate && (m = timeOpening.exec(line)) && Number(m[1]) < 24 && Number(m[2]) < 60)
    return { text: `${m[1]}:${m[2]}${m[3] ? ` ${m[3]}` : ''}`, line: shortLine(line), where: 'line-start', date: fileDate, minutes: Number(m[1]) * 60 + Number(m[2]), ...zoneOf(m[3]) }
  return undefined
}

/** For each line, whether it sits in a code fence that is closed (a fence left open to the end is not counted). */
const closedFences = (lines: string[]): boolean[] => {
  const inside: boolean[] = []
  let open = -1
  for (const [i, l] of lines.entries()) {
    if (/^\s*(```|~~~)/.test(l)) open = open < 0 ? i : -1
    inside.push(open >= 0 || (/^\s*(```|~~~)/.test(l) && open < 0))
  }
  if (open >= 0) for (let i = open; i < lines.length; i++) inside[i] = false
  return inside
}

/**
 * The stamps a change adds: the stamps on lines of `after` that `before` did not have, read
 * in the whole of `after` (so a line inside a code block the file already had is seen as
 * code). A stamp whose text was on a line the change removes is carried over, not added.
 */
export const newStamps = (before: string, after: string, fileDate?: string): Stamp[] => {
  // A line is the same line only in the same place: inside a closed code fence or out of one,
  // so a sample moved out of a fence into the text is a new line, and closing a fence left open
  // does not make every line under it new.
  const had = new Map<string, number>()
  const beforeIn = closedFences(before.split(/\r?\n/))
  before.split(/\r?\n/).forEach((l, i) => {
    const k = `${beforeIn[i] ? '`' : ' '}${l}`
    had.set(k, (had.get(k) ?? 0) + 1)
  })
  const out: Stamp[] = []
  const kept: string[] = []
  const lines = after.split(/\r?\n/)
  const afterIn = closedFences(lines)
  let fence = false
  for (const [i, line] of lines.entries()) {
    const isFence = /^\s*(```|~~~)/.test(line)
    if (isFence) fence = !fence
    const k = `${afterIn[i] ? '`' : ' '}${line}`
    const n = had.get(k) ?? 0
    const isNew = n === 0
    if (!isNew) had.set(k, n - 1)
    if (isFence) continue
    if (fence || indentedCode(line)) continue
    const s = lineStamp(line, fileDate)
    if (s) (isNew ? out.push(s) : kept.push(s.text))
  }
  // Only a stamp the old text itself had carries over, read in the old text's own context (a
  // date named in a removed sentence or code block is not one): the old text's stamps less those
  // still on its unchanged lines.
  const carried = new Map<string, number>()
  if (before) {
    for (const s of newStamps('', before, fileDate)) carried.set(s.text, (carried.get(s.text) ?? 0) + 1)
    for (const s of kept) carried.set(s, (carried.get(s) ?? 0) - 1)
  }
  return out.filter(s => {
    const n = carried.get(s.text) ?? 0
    if (n <= 0) return true
    carried.set(s.text, n - 1)
    return false
  })
}

/** The stamps in some lines of text. */
export const stampsIn = (text: string, fileDate?: string): Stamp[] => newStamps('', text, fileDate)

/** The lines of `after` that are not lines of `before`: what an edit adds. */
export const addedLines = (before: string, after: string) => {
  const had = new Map<string, number>()
  for (const l of before.split(/\r?\n/)) had.set(l, (had.get(l) ?? 0) + 1)
  const added: string[] = []
  for (const l of after.split(/\r?\n/)) {
    const n = had.get(l) ?? 0
    if (n > 0) had.set(l, n - 1)
    else added.push(l)
  }
  return added.join('\n')
}

const pad = (n: number) => String(n).padStart(2, '0')
/** `YYYY-MM-DD` of a moment in local time, or at a fixed UTC offset in minutes. */
export const dayOf = (ms: number, offset?: number) => {
  const d = offset === undefined ? new Date(ms) : new Date(ms + offset * 60000)
  return offset === undefined
    ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    : `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
/**
 * The local time now as a person writes it, with its offset so that the hour the clocks go back
 * over is not read twice: `2026-10-31 16:42 local time, UTC-04:00`.
 */
export const nowText = (ms: number) => {
  const d = new Date(ms)
  const o = -d.getTimezoneOffset()
  const zone = `UTC${o < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)}`
  return `${dayOf(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())} local time, ${zone}`
}

/**
 * Placeholders the agent writes instead of typing a time, filled from the clock as the call
 * lands: `⟦NOW⟧` 2026-11-01 06:20, `⟦DATE⟧` 2026-11-01, `⟦TIME⟧` 06:20, `⟦NOW-ISO⟧`
 * 2026-11-01T06:20:41-05:00, all local. One in code is kept as written (a README that shows
 * the placeholder): a code span, a ``` or ~~~ fence (closed by the same mark, as long or
 * longer), and, in a file (`indented`), an indented code line, as the judge reads code.
 * Exactly these spellings: `⟦now⟧`, `[NOW]` and `⟦NOW ⟧` are text. ⟦NOW⟧ has a space in
 * it: in a file name or an unquoted shell word, ⟦DATE⟧ is the one to use.
 */
export const fillNow = (text: string, ms: number, indented = true): { text: string; filled: string[] } => {
  const d = new Date(ms)
  const o = -d.getTimezoneOffset()
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const iso = `${dayOf(ms)}T${time}:${pad(d.getSeconds())}${o < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)}`
  const value: Record<string, string> = { 'NOW-ISO': iso, NOW: `${dayOf(ms)} ${time}`, DATE: dayOf(ms), TIME: time }
  const filled = new Set<string>()
  let fence: string | undefined
  const lines = text.split('\n').map(line => {
    const mark = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence !== undefined) {
      if (mark && mark[0] === fence[0] && mark.length >= fence.length && /^ {0,3}[`~]+\s*$/.test(line)) fence = undefined
      return line
    }
    if (mark && !(mark[0] === '`' && line.slice(line.indexOf(mark) + mark.length).includes('`'))) { fence = mark; return line }
    if (indented && indentedCode(line)) return line
    return line.replace(/(?<!`)(`+)(?!`)[^]*?(?<!`)\1(?!`)|⟦(NOW-ISO|NOW|DATE|TIME)⟧/g, (m, code: string | undefined, tok: string | undefined) => {
      if (code !== undefined || !tok) return m
      filled.add(`⟦${tok}⟧ ${value[tok]}`)
      return value[tok]!
    })
  })
  return { text: lines.join('\n'), filled: [...filled] }
}

/** A line as written before filling: each filled value back to its placeholder, longest first. */
export const unfill = (line: string, filled: string[]) =>
  filled.map(f => [f.slice(0, f.indexOf('⟧') + 1), f.slice(f.indexOf('⟧') + 2)] as const)
    .sort((x, y) => y[1].length - x[1].length)
    .reduce((l, [tok, v]) => l.split(v).join(tok), line)

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/** The zone's name where the runtime knows it (`America/New_York, EST`); '' where it does not. */
const zoneName = (ms: number) => {
  try {
    const iana = Intl.DateTimeFormat().resolvedOptions().timeZone
    const short = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date(ms)).find(p => p.type === 'timeZoneName')?.value
    return [...new Set([iana, short && !/^GMT[+-]/.test(short) ? short : ''].filter(Boolean))].join(', ')
  } catch {
    return ''
  }
}
/**
 * The clock a prompt carries: weekday, date, local time and offset, and the zone's name:
 * `Sunday 2026-11-01 05:58 local time, UTC-05:00 (America/New_York, EST)`.
 */
export const clockText = (ms: number) => {
  const name = zoneName(ms)
  return `${DAYS[new Date(ms).getDay()]} ${nowText(ms)}${name ? ` (${name})` : ''}`
}
/** A span of time as a person says it: `under a minute`, `12 min`, `3 h 5 min`, `2 days 4 h`. */
export const gapText = (ms: number) => {
  const m = Math.floor(Math.max(0, ms) / 60000)
  if (m < 1) return 'under a minute'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'}${h % 24 ? ` ${h % 24} h` : ''}`
}

/** The local zone's UTC offset in minutes at a moment (New York in winter: -300). */
export type ZoneAt = (ms: number) => number
const localZone: ZoneAt = ms => -new Date(ms).getTimezoneOffset()

/**
 * The moments a stamp can name, in ms: one for an offset; one per reading of a zone name; for a
 * local time, both when it falls in the hour the clocks go back over (01:30 happens twice that
 * night in New York), one otherwise; and for what may be a range, the offset and the local time.
 */
const momentsOf = (s: Stamp, zoneAt: ZoneAt) => {
  const [y, m, d] = s.date.split('-').map(Number) as [number, number, number]
  const wall = Date.UTC(y, m - 1, d, 0, s.minutes ?? 0)
  if (s.offset !== undefined && !s.range) return [wall - s.offset * 60000]
  if (s.zone) {
    // "EST" is often written for Eastern time all year: in summer it can also mean EDT.
    const loose = /^[ECMP]ST$/.test(s.zone) && usDaylight(s.date) ? [ZONES[s.zone]![0]! + 60] : []
    return [...ZONES[s.zone]!, ...loose].map(o => wall - o * 60000)
  }
  const offsets = [...new Set([zoneAt(wall - 12 * 3600000), zoneAt(wall + 12 * 3600000)])]
  const fits = offsets.filter(o => zoneAt(wall - o * 60000) === o)
  return [...(s.offset !== undefined ? [s.offset] : []), ...(fits.length ? fits : offsets.slice(0, 1))].map(o => wall - o * 60000)
}

export type Limits = { aheadMinutes: number; staleMinutes: number; staleDays: number }
export const LIMITS: Limits = { aheadMinutes: 2, staleMinutes: 30, staleDays: 1 }

/**
 * Each stamp against the clock. A date alone is in the future when it is after today both
 * locally and in UTC (a UTC date written in the evening west of Greenwich is not wrong); stale
 * when more than `staleDays` before today. A time is in the future when more than
 * `aheadMinutes` ahead of now; stale when more than `staleMinutes` behind it on the same day.
 * A time that can mean two moments is judged by both: future only when both are ahead, stale
 * only when both are behind.
 */
export const judge = (stamps: Stamp[], now: number, limits: Limits = LIMITS, zoneAt: ZoneAt = localZone): Verdict[] => {
  const real = nowText(now)
  const today = dayOf(now)
  const todayUtc = dayOf(now, 0)
  const out: Verdict[] = []
  for (const s of stamps) {
    if (s.minutes === undefined) {
      const latest = today > todayUtc ? today : todayUtc
      if (s.date > latest) out.push({ stamp: s, kind: 'future', real })
      else {
        const [y, m, d] = today.split('-').map(Number) as [number, number, number]
        const oldest = dayOf(new Date(y, m - 1, d - limits.staleDays, 12).getTime())
        if (s.date < oldest) out.push({ stamp: s, kind: 'stale', real })
      }
      continue
    }
    const moments = momentsOf(s, zoneAt)
    const at = Math.max(...moments)
    if (Math.min(...moments) > now + limits.aheadMinutes * 60000) out.push({ stamp: s, kind: 'future', real })
    else if (at < now - limits.staleMinutes * 60000) {
      const days = s.offset === undefined && !s.zone ? s.date === today : dayOf(at) === today
      if (days || (now - at) / 86400000 > limits.staleDays) out.push({ stamp: s, kind: 'stale', real })
    }
  }
  return out
}

/**
 * The date in a new file's name, when it is more than `staleDays` before today: the agent
 * named the file for the day it guessed, often one near its training. A later day is a plan
 * (an agenda for 2026-11-05), not judged. `undefined` when the name carries no date or the
 * date can be today.
 */
export const judgeName = (path: string, now: number, limits: Limits = LIMITS): { date: string; real: string } | undefined => {
  const date = dateOfFile(path)
  if (!date) return undefined
  const v = judge([{ text: date, line: path, where: 'field', date }], now, limits)[0]
  return v?.kind === 'stale' ? { date, real: v.real } : undefined
}
