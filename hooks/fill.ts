// The clock's words: the local time as a person writes it, and the placeholders filled from it.
import { fences, indentedCode } from './fences'

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
 * the placeholder): a code span, a ``` or ~~~ fence (fences), and, in a file (`indented`), an indented code line, as the judge reads code.
 * `only` fills just that span of the text.
 * Exactly these spellings: `⟦now⟧`, `[NOW]` and `⟦NOW ⟧` are text. ⟦NOW⟧ has a space in
 * it: in a file name or an unquoted shell word, ⟦DATE⟧ is the one to use.
 */
export const fillNow = (text: string, ms: number, indented = true, only?: [number, number]): { text: string; filled: string[] } => {
  const d = new Date(ms)
  const o = -d.getTimezoneOffset()
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const iso = `${dayOf(ms)}T${time}:${pad(d.getSeconds())}${o < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)}`
  const value: Record<string, string> = { 'NOW-ISO': iso, NOW: `${dayOf(ms)} ${time}`, DATE: dayOf(ms), TIME: time }
  const filled = new Set<string>()
  const all = text.split('\n')
  const inFence = fences(all)
  let start = 0
  const lines = all.map((line, i) => {
    const at = start
    start += line.length + 1
    if (inFence[i]!.code || (indented && indentedCode(line))) return line
    return line.replace(/(?<!`)(`+)(?!`)[^]*?(?<!`)\1(?!`)|⟦(NOW-ISO|NOW|DATE|TIME)⟧/g, (m, code: string | undefined, tok: string | undefined, off: number) => {
      if (code !== undefined || !tok) return m
      if (only && (at + off < only[0] || at + off >= only[1])) return m
      filled.add(`⟦${tok}⟧ ${value[tok]}`)
      return value[tok]!
    })
  })
  return { text: lines.join('\n'), filled: [...filled] }
}

/**
 * An Edit's new text filled where it lands in the file, so one that lands in a fence or a code span
 * of the file is kept. The file's other lines are read and left as they are. With `replace_all` it
 * is the first place that decides, the one text going to every place.
 */
export const fillEdit = (file: string, old: string, text: string, ms: number) => {
  const at = file.indexOf(old)
  const tail = file.length - at - old.length
  const f = fillNow(file.slice(0, at) + text + file.slice(at + old.length), ms, true, [at, at + text.length])
  return { text: f.text.slice(at, f.text.length - tail), filled: f.filled }
}

/** A line as written before filling: each filled value back to its placeholder, longest first. */
export const unfill = (line: string, filled: string[]) =>
  filled.map(f => [f.slice(0, f.indexOf('⟧') + 1), f.slice(f.indexOf('⟧') + 2)] as const)
    .sort((x, y) => y[1].length - x[1].length)
    .reduce((l, [tok, v]) => l.split(v).join(tok), line)
