// sed -i, read the way the shell and sed read it: a command cut only at separators outside quotes,
// every command of one script, every file it edits, redirects left out. For a file that exists, the
// `s` commands are applied to its text, so a sed -i is judged on the lines it changes, as an Edit is.

import { shellWords } from './shell'
import type { Word } from './shell'
export { shellParts } from './shell'
/** One sed command: an `s` (pattern, replacement, flags) or the text an `a`, `i` or `c` adds. */
export type SedCmd =
  | { kind: 's'; addr?: string; delim: string; pattern: string; replacement: string; flags: string }
  | { kind: 'text'; text: string }
  | { kind: 'other'; addr?: string; letter: string }

const ADDRESS = /^\s*(\d+|\$|\/(?:[^/\\]|\\.)*\/)(\s*,\s*(?:\d+|\$|\/(?:[^/\\]|\\.)*\/))?\s*/

/** Read up to the next unescaped `d` from `i`; returns the raw text (escapes kept) and the index after `d`. */
const upTo = (s: string, i: number, d: string): [string, number] | undefined => {
  let out = ''
  for (; i < s.length; i++) {
    const c = s[i]!
    if (c === '\\' && i + 1 < s.length) {
      out += c + s[++i]
      continue
    }
    if (c === d) return [out, i + 1]
    out += c
  }
  return undefined
}

/** Every command in one sed script (`;` and new lines between them, `s` delimiters respected). */
export const sedCommands = (script: string): SedCmd[] => {
  const out: SedCmd[] = []
  let i = 0
  while (i < script.length) {
    while (i < script.length && /[\s;{}]/.test(script[i]!)) i++
    if (i >= script.length) break
    const a = ADDRESS.exec(script.slice(i))
    let addr: string | undefined
    if (a && a[0].trim()) {
      addr = a[2] ? `${a[1]}${a[2]}` : a[1]
      i += a[0].length
    }
    const letter = script[i]
    if (letter === undefined) break
    if (letter === 's' && i + 1 < script.length) {
      const delim = script[i + 1]!
      const p = upTo(script, i + 2, delim)
      const r = p && upTo(script, p[1], delim)
      if (!p || !r) break
      let j = r[1]
      while (j < script.length && !/[;\n}]/.test(script[j]!)) j++
      out.push({ kind: 's', addr, delim, pattern: p[0], replacement: r[0], flags: script.slice(r[1], j).trim() })
      i = j
      continue
    }
    if ('aic'.includes(letter)) {
      // GNU one-liner: the text runs to the end of the line, `;` included.
      const end = script.indexOf('\n', i)
      const text = script.slice(i + 1, end < 0 ? undefined : end).replace(/^\\?\s*/, '')
      out.push({ kind: 'text', text })
      i = end < 0 ? script.length : end
      continue
    }
    out.push({ kind: 'other', addr, letter })
    i++
  }
  return out
}

/** What one command writes when the file cannot be read: a replacement without its back-references, or the added text. */
export const writtenText = (c: SedCmd): string | undefined => {
  if (c.kind === 'text') return c.text
  if (c.kind !== 's') return undefined
  let out = ''
  for (let i = 0; i < c.replacement.length; i++) {
    const ch = c.replacement[i]!
    if (ch === '\\' && i + 1 < c.replacement.length) {
      const n = c.replacement[++i]!
      if (/[0-9]/.test(n)) continue // \1: what the group matched is unknown without the file
      out += n === 'n' ? '\n' : n
      continue
    }
    if (ch === '&') continue
    out += ch
  }
  return out
}

const CLASSES: Record<string, string> = {
  digit: '0-9', alpha: 'A-Za-z', alnum: 'A-Za-z0-9', upper: 'A-Z', lower: 'a-z',
  space: '\\s', blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f',
}

/** A sed pattern (basic, or extended with -E) as a JavaScript pattern; undefined when it is not one we read the same way. */
export const toRegExpSource = (pattern: string, ere: boolean, delim: string): string | undefined => {
  let out = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!
    if (!ere && c === '$') {
      // In a basic pattern `$` is the line's end only last or before \) or \| (GNU); elsewhere a letter.
      const next = pattern.slice(i + 1, i + 3)
      out += i === pattern.length - 1 || next === '\\)' || next === '\\|' ? '$' : '\\$'
      continue
    }
    if (!ere && c === '^') {
      const prev = pattern.slice(Math.max(0, i - 2), i)
      out += i === 0 || prev === '\\(' || prev === '\\|' ? '^' : '\\^'
      continue
    }
    if (c === '[') {
      let j = i + 1
      let body = ''
      if (pattern[j] === '^') body += pattern[j++]
      if (pattern[j] === ']') body += '\\' + pattern[j++]
      for (; j < pattern.length && pattern[j] !== ']'; j++) {
        const k = /^\[:(\w+):\]/.exec(pattern.slice(j))
        if (k) {
          const cls = CLASSES[k[1]!]
          if (!cls) return undefined
          body += cls
          j += k[0].length - 1
        } else body += pattern[j] === '\\' ? '\\\\' : pattern[j]
      }
      if (j >= pattern.length) return undefined
      out += `[${body}]`
      i = j
      continue
    }
    if (c === '\\' && i + 1 < pattern.length) {
      const n = pattern[++i]!
      if (n === delim) out += n.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
      else if (!ere && '(){}|+?'.includes(n)) out += n
      else if (n === '<' || n === '>') out += '\\b'
      else if (/[1-9]/.test(n) || /[nt.*[\]^$\\/wWsSb]/.test(n)) out += '\\' + n
      else return undefined
      continue
    }
    if (!ere && '(){}|+?'.includes(c)) out += '\\' + c
    else if (c === '/') out += '\\/'
    else out += c
  }
  return out
}

/** A sed replacement as a JavaScript replacement string. */
const toReplacement = (r: string): string => {
  let out = ''
  for (let i = 0; i < r.length; i++) {
    const c = r[i]!
    if (c === '\\' && i + 1 < r.length) {
      const n = r[++i]!
      out += /[0-9]/.test(n) ? (n === '0' ? '$&' : '$' + n) : n === 'n' ? '\n' : n === 't' ? '\t' : n === '$' ? '$$' : n
    } else out += c === '&' ? '$&' : c === '$' ? '$$' : c
  }
  return out
}

/**
 * The file's text after these scripts, as sed would leave it; undefined when a script holds anything
 * but `s` commands with no address, a line number, `$` or one /pattern/ (then the caller judges the
 * written text alone, as before).
 */
export const applySed = (text: string, scripts: string[], ere: boolean, z = false): string | undefined => {
  if (text === '') return '' // sed reads no line in an empty file and writes nothing
  const steps: { on: (line: string, n: number, last: boolean) => boolean; re: RegExp; rep: string }[] = []
  // `u`: sed's `.` (UTF-8) takes a whole character, an emoji included; JavaScript's takes half of one
  // without it. A pattern `u` refuses (a lone `]`, read by sed as a letter) is read without it, and
  // then a file with such characters is not applied (the written text is judged alone).
  let loose = false
  const rx = (src: string, flags: string) => {
    try {
      return new RegExp(src, flags + 'u')
    } catch {
      loose = true
      return new RegExp(src, flags)
    }
  }
  for (const script of scripts) {
    for (const c of sedCommands(script)) {
      if (c.kind !== 's' || !c.pattern) return undefined
      if (/[^gIip]/.test(c.flags)) return undefined
      if (c.addr?.includes(',')) return undefined
      const src = toRegExpSource(c.pattern, ere, c.delim)
      if (src === undefined) return undefined
      let re: RegExp
      let on: (line: string, n: number, last: boolean) => boolean = () => true
      try {
        // `s`: sed's `.` takes a CR (a CRLF file) and, with -z, a new line; JavaScript's takes neither without it.
        re = rx(src, 's' + (c.flags.includes('g') ? 'g' : '') + (/[Ii]/.test(c.flags) ? 'i' : ''))
        if (c.addr === '$') on = (_l, _n, last) => last
        else if (c.addr && /^\d+$/.test(c.addr)) {
          const want = Number(c.addr)
          on = (_l, n) => n === want
        } else if (c.addr) {
          const a = toRegExpSource(c.addr.slice(1, -1), ere, '/')
          if (a === undefined) return undefined
          const ar = rx(a, '')
          on = l => ar.test(l)
        }
      } catch {
        return undefined
      }
      steps.push({ on, re, rep: toReplacement(c.replacement) })
    }
  }
  if (!steps.length) return undefined
  if (loose && /[\uD800-\uDFFF]/.test(text)) return undefined
  const sep = z ? '\0' : '\n'
  const lines = text.split(sep)
  const ends = text.endsWith(sep)
  const count = ends ? lines.length - 1 : lines.length
  for (let i = 0; i < count; i++) {
    for (const s of steps) if (s.on(lines[i]!, i + 1, i === count - 1)) lines[i] = lines[i]!.replace(s.re, s.rep)
  }
  return lines.join(sep)
}

/** Commands that run the command after them, each with its options that take the next word as a value. */
const WRAPPERS: Record<string, string> = {
  env: 'uCS', command: '', sudo: 'ugCDhpUrtT', xargs: 'IiLlnPsdEa', timeout: 'ks', nice: 'n', time: 'fo', nohup: '',
}
/** Shell words a command can stand behind in its own part: `then echo ...`, `do sed -i ...`. */
const KEYWORDS = new Set(['if', 'then', 'elif', 'else', 'while', 'until', 'do', '!', '{'])
/** The name a word runs: `/usr/bin/sed` is sed; a quoted word runs none here. */
export const commandName = (w: Word) => (w.quoted ? '' : w.text.split(/[\\/]/).pop()!.replace(/\.exe$/i, ''))

/**
 * The command in one stage of a pipeline, past shell keywords, `VAR=x` assignments and the wrappers env, command,
 * sudo, xargs, timeout (and its duration), nice, time and nohup (with their options); `piped`: xargs runs it,
 * so more files, not known here, come from the pipe.
 */
export const commandIn = (words: Word[]): { words: Word[]; piped: boolean } | undefined => {
  let i = 0
  let piped = false
  while (i < words.length) {
    const w = words[i]!
    if (!w.quoted && /^[A-Za-z_]\w*=/.test(w.text)) {
      i++
      continue
    }
    if (!w.quoted && KEYWORDS.has(w.text)) {
      i++
      continue
    }
    const name = commandName(w)
    if (!Object.hasOwn(WRAPPERS, name)) break
    if (name === 'xargs') piped = true
    for (i++; i < words.length && !words[i]!.quoted && words[i]!.text.startsWith('-'); i++) {
      const t = words[i]!.text
      if (t === '--') {
        i++
        break
      }
      // `-u root`: the value is the next word; `-I{}`, `--user=root`: glued.
      if (/^-[a-zA-Z]$/.test(t) && WRAPPERS[name]!.includes(t[1]!)) i++
    }
    // `timeout 5s sed ...`: the duration comes before the command.
    if (name === 'timeout' && i < words.length) i++
  }
  return i < words.length ? { words: words.slice(i), piped } : undefined
}

/** The sed in one command of a pipeline; `gsed` is sed. */
const sedWords = (words: Word[]) => {
  const run = commandIn(words)
  return run && /^g?sed$/.test(commandName(run.words[0]!)) ? run : undefined
}

/**
 * A `sed -i` in one part of a command (any command of a pipeline): its scripts, whether they are
 * extended, whether it also runs a script file (`-f`, not read: what it does to the text is not
 * known, so the scripts are only read for what they write), every file it names, and `piped` when xargs runs it (then more files come from the pipe,
 * and `source` is the words of the commands before it in the pipeline).
 */
export const sedInPlace = (part: string): { scripts: string[]; ere: boolean; z: boolean; scriptFile: boolean; files: string[]; piped: boolean; source: string[] } | undefined => {
  const all = shellWords(part)
  let found: ReturnType<typeof sedWords>
  let from = 0
  for (let start = 0; !found && start <= all.length; ) {
    const end = all.findIndex((w, k) => k >= start && w.pipe)
    found = sedWords(all.slice(start, end < 0 ? undefined : end))
    from = start
    if (end < 0) break
    start = end + 1
  }
  if (!found) return undefined
  const tokens = found.words
  let inPlace = false
  let ere = false
  let z = false
  let scriptFile = false
  const scripts: string[] = []
  const rest: string[] = []
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]!
    if (t.redirect) {
      i++ // `2> err.txt`: the next word is the redirect's
      continue
    }
    if (t.quoted || !t.text.startsWith('-')) {
      rest.push(t.text)
      continue
    }
    if (/^-[a-zA-Z]/.test(t.text)) {
      // One word can hold several short options. `e`, `f` and `l` take the rest of the word, or the
      // next word, as their value; GNU: what follows `i` is the backup suffix (`-iE` is -i with
      // suffix "E", a basic pattern).
      for (let k = 1; k < t.text.length; k++) {
        const o = t.text[k]!
        if (o === 'E' || o === 'r') ere = true
        else if (o === 'z') z = true
        else if (o === 'i') {
          inPlace = true
          if (t.text === '-i' && tokens[i + 1]?.quoted && tokens[i + 1]!.text === '') i++ // BSD: -i ''
          break
        } else if ('efl'.includes(o)) {
          const value = t.text.slice(k + 1) || (tokens[++i]?.text ?? '')
          if (o === 'e') scripts.push(value)
          if (o === 'f') scriptFile = true
          break
        }
      }
    } else if (t.text === '--regexp-extended') ere = true
    else if (t.text === '--null-data') z = true
    else if (t.text.startsWith('--expression=')) scripts.push(t.text.slice('--expression='.length))
    else if (t.text === '--expression') scripts.push(tokens[++i]?.text ?? '')
    else if (t.text.startsWith('--in-place')) inPlace = true
    else if (t.text === '--file') {
      scriptFile = true
      i++
    } else if (t.text.startsWith('--file=')) scriptFile = true
  }
  if (!inPlace) return undefined
  if (!scripts.length && !scriptFile && rest.length) scripts.push(rest.shift()!)
  const files = rest.filter(f => f !== '/dev/null')
  // The words of the pipeline before the sed's own command: where xargs gets its file names.
  const source = all.slice(0, from).filter(w => !w.pipe).map(w => w.text)
  return files.length || found.piped ? { scripts, ere, z, scriptFile, files, piped: found.piped, source } : undefined
}
