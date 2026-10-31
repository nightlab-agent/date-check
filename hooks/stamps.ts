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
}

export type Verdict = { stamp: Stamp; kind: 'future' | 'stale'; real: string }

const DATE = String.raw`(\d{4})-(\d{2})-(\d{2})`
const TIME = String.raw`(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s?(Z|[+-]\d{2}:?\d{2})?)?`
const STAMP = DATE + TIME
const LABEL = String.raw`(?:date|dated|updated|last[ _-]?updated|last[ _-]?modified|modified|released|release[ _-]?date|generated|written|created|as of|timestamp)`

const heading = new RegExp(String.raw`^\s{0,3}#{1,6}\s.*?(?<![\d-])` + STAMP + String.raw`(?![\d-])`)
const field = new RegExp(String.raw`(?:^|[\s*_|>(])` + LABEL + String.raw`\**\s*[:=]\s*\**["'\x60]?(?:on\s)?` + STAMP + String.raw`(?![\d-])`, 'i')
const opening = new RegExp(String.raw`^\s*(?:[-*+]\s+|>\s*)?[\[(]?` + STAMP + String.raw`(?![\d-])`)
const timeOpening = /^\s*(?:[-*+]\s+|>\s*)?[\[(]?(\d{2}):(\d{2})(?::\d{2})?(?![\d:])[\])]?(?:\s|$|[,;|-])/

const valid = (y: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate()
}

const offsetOf = (z: string | undefined) => {
  if (z === undefined) return undefined
  if (z === 'Z') return 0
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(z)!
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}

const build = (m: RegExpExecArray, at: number, line: string, where: Stamp['where']): Stamp | undefined => {
  const [y, mo, d] = [Number(m[at]), Number(m[at + 1]), Number(m[at + 2])]
  if (!valid(y, mo, d)) return undefined
  const hh = m[at + 3], mm = m[at + 4]
  const minutes = hh !== undefined ? Number(hh) * 60 + Number(mm) : undefined
  if (minutes !== undefined && (Number(hh) > 23 || Number(mm) > 59)) return undefined
  const date = `${m[at]}-${m[at + 1]}-${m[at + 2]}`
  const text = m[0].slice(m[0].indexOf(date)).replace(/[\])"'\x60*]+$/, '').trim()
  return { text, line: line.trim().slice(0, 120), where, date, ...(minutes !== undefined ? { minutes } : {}), ...(m[at + 5] !== undefined ? { offset: offsetOf(m[at + 5]) } : {}) }
}

/** A `YYYY-MM-DD` date in a file's name (logs/2026-10-31.md), the day its bare line times belong to. */
export const dateOfFile = (path: string) => {
  const m = /(?:^|[^\d])(\d{4})-(\d{2})-(\d{2})(?!\d)[^/\\]*$/.exec(path)
  return m && valid(Number(m[1]), Number(m[2]), Number(m[3])) ? `${m[1]}-${m[2]}-${m[3]}` : undefined
}

/** The stamps in some lines of text. `fileDate` lets a bare `16:05` opening a line count as a stamp of that day. */
export const stampsIn = (text: string, fileDate?: string): Stamp[] => {
  const out: Stamp[] = []
  let fence = false
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue }
    if (fence) continue
    let m: RegExpExecArray | null
    let s: Stamp | undefined
    if ((m = heading.exec(line))) s = build(m, 1, line, 'heading')
    else if ((m = field.exec(line))) s = build(m, 1, line, 'field')
    else if ((m = opening.exec(line))) s = build(m, 1, line, 'line-start')
    else if (fileDate && (m = timeOpening.exec(line)) && Number(m[1]) < 24 && Number(m[2]) < 60) {
      s = { text: `${m[1]}:${m[2]}`, line: line.trim().slice(0, 120), where: 'line-start', date: fileDate, minutes: Number(m[1]) * 60 + Number(m[2]) }
    }
    if (s) out.push(s)
  }
  return out
}

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
/** The local time now as a person writes it: `2026-10-31 16:42`. */
export const nowText = (ms: number) => {
  const d = new Date(ms)
  return `${dayOf(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The moment a stamp names, in ms: its zone when it carries one, the local zone when not. */
const momentOf = (s: Stamp) => {
  const [y, m, d] = s.date.split('-').map(Number) as [number, number, number]
  const min = s.minutes ?? 0
  if (s.offset !== undefined) return Date.UTC(y, m - 1, d, 0, min) - s.offset * 60000
  return new Date(y, m - 1, d, 0, min).getTime()
}

export type Limits = { aheadMinutes: number; staleMinutes: number; staleDays: number }
export const LIMITS: Limits = { aheadMinutes: 2, staleMinutes: 30, staleDays: 1 }

/**
 * Each stamp against the clock. A date alone is in the future when it is after today both
 * locally and in UTC (a UTC date written in the evening west of Greenwich is not wrong); stale
 * when more than `staleDays` before today. A time is in the future when more than
 * `aheadMinutes` ahead of now; stale when more than `staleMinutes` behind it on the same day.
 */
export const judge = (stamps: Stamp[], now: number, limits: Limits = LIMITS): Verdict[] => {
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
    const at = momentOf(s)
    if (at > now + limits.aheadMinutes * 60000) out.push({ stamp: s, kind: 'future', real })
    else if (at < now - limits.staleMinutes * 60000) {
      const days = s.offset === undefined ? s.date === today : dayOf(at) === today
      if (days || (now - at) / 86400000 > limits.staleDays) out.push({ stamp: s, kind: 'stale', real })
    }
  }
  return out
}
