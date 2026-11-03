// sed -i, read the way the shell and sed read it: a command cut only at separators outside quotes,
// every command of one script, every file it edits, redirects left out. For a file that exists, the
// `s` commands are applied to its text, so a sed -i is judged on the lines it changes, as an Edit is.

/** One sed command: an `s` (pattern, replacement, flags) or the text an `a`, `i` or `c` adds. */
export type SedCmd =
  | { kind: 's'; addr?: string; delim: string; pattern: string; replacement: string; flags: string }
  | { kind: 'text'; text: string }
  | { kind: 'other'; addr?: string; letter: string }

/** The parts of a shell command between `&&`, `||`, `;` and new lines that sit outside quotes. */
export const shellParts = (command: string): string[] => {
  const parts: string[] = []
  let cur = ''
  let q: string | undefined
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    if (q) {
      if (c === '\\' && q === '"' && i + 1 < command.length) {
        cur += c + command[++i]
        continue
      }
      if (c === q) q = undefined
      cur += c
      continue
    }
    if (c === '\\' && i + 1 < command.length) {
      cur += c + command[++i]
      continue
    }
    if (c === "'" || c === '"') {
      q = c
      cur += c
      continue
    }
    const two = command.slice(i, i + 2)
    if (two === '&&' || two === '||') {
      parts.push(cur)
      cur = ''
      i++
      continue
    }
    if (c === ';' || c === '\n') {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  parts.push(cur)
  return parts
}

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

/**
 * The words of one part of a command up to its first `|`, as the shell reads them: pieces that touch
 * with no space between (`s/'a b'/"c"/`) are one word, quotes removed; `\ ` outside quotes is a space
 * in the word. `quoted` says the word began with a quote (then it is never an option or a redirect).
 * Outside quotes a backslash is dropped only before a space, a quote, a backslash or `|;&`, so a
 * Windows path (`E:\p\log.md`) keeps its separators.
 */
export const shellWords = (part: string): { text: string; quoted: boolean }[] => {
  const out: { text: string; quoted: boolean }[] = []
  let text: string | undefined
  let quoted = false
  const push = () => {
    if (text !== undefined) out.push({ text, quoted })
    text = undefined
  }
  for (let i = 0; i < part.length; i++) {
    const c = part[i]!
    if (c === '|') break
    if (/\s/.test(c)) {
      push()
      continue
    }
    if (text === undefined) {
      text = ''
      quoted = c === "'" || c === '"'
    }
    if (c === "'") {
      const end = part.indexOf("'", i + 1)
      const stop = end < 0 ? part.length : end
      text += part.slice(i + 1, stop)
      i = stop
    } else if (c === '"') {
      for (i++; i < part.length && part[i] !== '"'; i++) {
        if (part[i] === '\\' && i + 1 < part.length && '$`"\\\n'.includes(part[i + 1]!)) i++
        text += part[i]
      }
    } else if (c === '\\' && i + 1 < part.length) {
      const n = part[i + 1]!
      text += /[\s'"\\|;&]/.test(n) ? n : c + n
      i++
    } else text += c
  }
  push()
  return out
}

/** A `sed -i` in one part of a command: its scripts, whether they are extended, and every file it edits. */
export const sedInPlace = (part: string): { scripts: string[]; ere: boolean; z: boolean; files: string[] } | undefined => {
  const tokens = shellWords(part)
  if (tokens[0]?.text !== 'sed' || tokens[0].quoted) return undefined
  let inPlace = false
  let ere = false
  let z = false
  const scripts: string[] = []
  const rest: string[] = []
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]!
    if (!t.quoted && /^(?:\d*>>?|&>|<)/.test(t.text)) {
      if (/^(?:\d*>>?|&>|<)$/.test(t.text)) i++ // `2> err.txt`: the next word is the redirect's
      continue
    }
    if (!t.quoted && /^-[a-zA-Z]/.test(t.text)) {
      // GNU: what follows -i in one word is the backup suffix (`-iE` is -i with suffix "E", a basic pattern).
      const flags = t.text.slice(1).split('i')[0]!
      if (/[Er]/.test(flags)) ere = true
      if (flags.includes('z')) z = true
    }
    if (!t.quoted && t.text === '--regexp-extended') ere = true
    if (!t.quoted && t.text === '--null-data') z = true
    if (!t.quoted && /^--expression=/.test(t.text)) {
      // `--expression='s/a/b/'`: the script is glued, or is the quoted word that follows `=`.
      const glued = t.text.slice('--expression='.length)
      scripts.push(glued || (tokens[++i]?.text ?? ''))
      continue
    }
    if (!t.quoted && /^(?:-[a-zA-Z]*i|--in-place)/.test(t.text)) {
      inPlace = true
      if (t.text === '-i' && tokens[i + 1]?.quoted && tokens[i + 1]!.text === '') i++ // BSD: -i ''
    } else if (!t.quoted && (t.text === '-e' || t.text === '--expression')) scripts.push(tokens[++i]?.text ?? '')
    else if (!t.quoted && (t.text === '-f' || t.text === '--file')) return undefined // a script file: not read
    else if (!t.quoted && t.text.startsWith('-')) continue
    else rest.push(t.text)
  }
  if (!inPlace) return undefined
  if (!scripts.length && rest.length) scripts.push(rest.shift()!)
  const files = rest.filter(f => f !== '/dev/null')
  return files.length ? { scripts, ere, z, files } : undefined
}
