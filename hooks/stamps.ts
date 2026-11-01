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

const build = (m: RegExpExecArray, at: number, line: string, where: Stamp['where']): Stamp | undefined => {
  const [y, mo, d] = [Number(m[at]), Number(m[at + 1]), Number(m[at + 2])]
  if (!valid(y, mo, d)) return undefined
  const hh = m[at + 3], mm = m[at + 4]
  const minutes = hh !== undefined ? Number(hh) * 60 + Number(mm) : undefined
  if (minutes !== undefined && (Number(hh) > 23 || Number(mm) > 59)) return undefined
  const date = `${m[at]}-${m[at + 1]}-${m[at + 2]}`
  const text = m[0].slice(m[0].indexOf(date)).replace(/[\])"'\x60*]+$/, '').trim()
  return { text, line: line.trim().slice(0, 120), where, date, ...(minutes !== undefined ? { minutes } : {}), ...zoneOf(m[at + 5]) }
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
    return { text: `${m[1]}:${m[2]}${m[3] ? ` ${m[3]}` : ''}`, line: line.trim().slice(0, 120), where: 'line-start', date: fileDate, minutes: Number(m[1]) * 60 + Number(m[2]), ...zoneOf(m[3]) }
  return undefined
}

/**
 * The stamps a change adds: the stamps on lines of `after` that `before` did not have, read
 * in the whole of `after` (so a line inside a code block the file already had is seen as
 * code). A stamp whose text was on a line the change removes is carried over, not added.
 */
export const newStamps = (before: string, after: string, fileDate?: string): Stamp[] => {
  const had = new Map<string, number>()
  for (const l of before.split(/\r?\n/)) had.set(l, (had.get(l) ?? 0) + 1)
  const out: Stamp[] = []
  let fence = false
  for (const line of after.split(/\r?\n/)) {
    const n = had.get(line) ?? 0
    const isNew = n === 0
    if (!isNew) had.set(line, n - 1)
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue }
    if (fence || !isNew || indentedCode(line)) continue
    const s = lineStamp(line, fileDate)
    if (s) out.push(s)
  }
  const removed = [...had.entries()].filter(([, n]) => n > 0).map(([l]) => l).join('\n')
  return out.filter(s => !removed.includes(s.text))
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
 * 2026-11-01T06:20:41-05:00, all local. One inside backticks or a fenced code block is kept
 * as written (a README that shows the placeholder). Exactly these spellings: `⟦now⟧`, `[NOW]`
 * and `⟦NOW ⟧` are text.
 */
export const fillNow = (text: string, ms: number): { text: string; filled: string[] } => {
  const d = new Date(ms)
  const o = -d.getTimezoneOffset()
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const iso = `${dayOf(ms)}T${time}:${pad(d.getSeconds())}${o < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)}`
  const value: Record<string, string> = { 'NOW-ISO': iso, NOW: `${dayOf(ms)} ${time}`, DATE: dayOf(ms), TIME: time }
  const filled: string[] = []
  const out = text.replace(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)|⟦(NOW-ISO|NOW|DATE|TIME)⟧/g, (m, code: string | undefined, tok: string | undefined) => {
    if (code !== undefined || !tok) return m
    filled.push(`⟦${tok}⟧ ${value[tok]}`)
    return value[tok]!
  })
  return { text: out, filled: [...new Set(filled)] }
}

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
 * The moments a stamp can name, in ms: one for an offset; one per reading of a zone name; and
 * for a local time, both when it falls in the hour the clocks go back over (01:30 happens twice
 * that night in New York), one otherwise.
 */
const momentsOf = (s: Stamp, zoneAt: ZoneAt) => {
  const [y, m, d] = s.date.split('-').map(Number) as [number, number, number]
  const wall = Date.UTC(y, m - 1, d, 0, s.minutes ?? 0)
  if (s.offset !== undefined) return [wall - s.offset * 60000]
  if (s.zone) {
    // "EST" is often written for Eastern time all year: in summer it can also mean EDT.
    const loose = /^[ECMP]ST$/.test(s.zone) && usDaylight(s.date) ? [ZONES[s.zone]![0]! + 60] : []
    return [...ZONES[s.zone]!, ...loose].map(o => wall - o * 60000)
  }
  const offsets = [...new Set([zoneAt(wall - 12 * 3600000), zoneAt(wall + 12 * 3600000)])]
  const fits = offsets.filter(o => zoneAt(wall - o * 60000) === o)
  return (fits.length ? fits : offsets.slice(0, 1)).map(o => wall - o * 60000)
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
