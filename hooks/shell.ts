// The shell side of reading a command: its parts between separators and the words of one part,
// cut only outside quotes, the way the shell itself reads them.

/** The named backslash escapes of a `printf` format, a `%b` argument or a `$'...'` word. */
export const ESCAPES: Record<string, string> = { a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', '"': '"', "'": "'", '?': '?' }
/** One backslash escape: hex, the two unicode forms, octal, or a single character. */
export const ESCAPE = (octal: string) => new RegExp(`\\\\(?:x([\\da-fA-F]{1,2})|u([\\da-fA-F]{1,4})|U([\\da-fA-F]{1,8})|(${octal})|([\\s\\S]))`, 'g')
export const IN_FORMAT = ESCAPE('[0-7]{1,3}')
export const escapeValue = ([whole, hex, short, long, octal, c]: RegExpMatchArray) => {
  const code = hex ?? short ?? long ? parseInt((hex ?? short ?? long)!, 16) : octal ? parseInt(octal, 8) & 0xff : undefined
  return code !== undefined ? String.fromCodePoint(Math.min(code, 0x10ffff)) : ESCAPES[c!] ?? whole
}
/** Stepped by hand through `lastIndex`, so it is never the shared IN_FORMAT, whose position a later `matchAll` would copy. */
const IN_ANSI = ESCAPE('[0-7]{1,3}')
/** The inside of a `$'...'` word: every C escape read, `\cX` a control character, and the word ends at a nul, as bash takes it. */
const ansiC = (body: string) => {
  let out = ''
  let at = 0
  while (at < body.length) {
    const control = /^\\c([\s\S])/.exec(body.slice(at))
    IN_ANSI.lastIndex = at
    const m = body[at] === '\\' && !control ? IN_ANSI.exec(body) : null
    const one = control ? String.fromCharCode(control[1]!.toUpperCase().charCodeAt(0) ^ 64) : m ? escapeValue(m) : body[at]!
    if (one === '\0') return out
    out += one
    at += (control ?? m)?.[0].length ?? 1
  }
  return out
}
/** Where the `'` closing a `$'...'` body that starts at `from` is, or the end of the text. */
const ansiEnd = (text: string, from: number) => {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') i++
    else if (text[i] === "'") return i
  }
  return text.length
}
/** A heredoc's end word as the shell compares it: quotes off, a backslash kept in single quotes and before anything it does not escape in double quotes. */
const docEnd = (word: string) =>
  word.replace(/\$'((?:[^'\\]|\\[\s\S])*)'|'([^']*)'|"((?:[^"\\]|\\[\s\S])*)"|\\([\s\S])/g, (_, ansi, single, double, bare) =>
    ansi !== undefined ? ansiC(ansi) : single ?? bare ?? double.replace(/\\([$`"\\])/g, '$1'))

/** A heredoc's place in a part: `<<` and this word, whose number is its body's in `docs`. */
const docMark = (n: number) => `${n}`
/** The body in `docs` that a redirect's word stands for. */
export const docOf = (word: string | undefined, docs: string[]) => docs[Number(/^(\d+)$/.exec(word ?? '')?.[1] ?? NaN)]

/** The text of a heredoc whose body starts at `from`, each line with its new line, and where the line after its end starts. With no end line it runs to the end of the command, as bash takes it. With `continues`, an end word with no quoting, a backslash at a line's end joins the next line. */
const docBody = (command: string, from: number, end: string, tabs: boolean, continues: boolean) => {
  let text = ''
  for (let at = from; at <= command.length; ) {
    let stop = command.indexOf('\n', at)
    // Joined as pieces, read at each one's end: a joined line copied whole at each join costs the square of the lines.
    const pieces = [command.slice(at, stop < 0 ? undefined : stop)]
    while (continues && stop >= 0 && escapedAt(pieces[pieces.length - 1]!, pieces[pieces.length - 1]!.length)) {
      const more = command.indexOf('\n', stop + 1)
      pieces[pieces.length - 1] = pieces[pieces.length - 1]!.slice(0, -1)
      pieces.push(command.slice(stop + 1, more < 0 ? undefined : more))
      stop = more
    }
    const raw = pieces.join('')
    const line = tabs ? raw.replace(/^\t+/, '') : raw
    if (line === end) return { text, next: stop < 0 ? command.length : stop + 1 }
    text += `${line}\n`
    if (stop < 0) return { text, next: command.length }
    at = stop + 1
  }
  return undefined
}

/** Where the `$((...))` or `((...))` at `i` ends, on one line; -1 when none starts there. Its `<<` is a shift, never a heredoc. */
const arithmetic = (command: string, i: number) => {
  if (!command.startsWith('((', command[i] === '$' ? i + 1 : i)) return -1
  let depth = 0
  for (let at = i; at < command.length && command[at] !== '\n'; at++) {
    if (command[at] === '(') depth++
    if (command[at] === ')' && --depth === 0) return command[at - 1] === ')' ? at + 1 : -1
  }
  return -1
}

/** Whether `text` ends in an odd run of backslashes before `at`, so what stands at `at` is escaped. */
const escapedAt = (text: string, at: number) => {
  let run = 0
  while (text[at - 1 - run] === '\\') run++
  return run % 2 === 1
}
/** Whether a `#` after `text` starts a word: a line continuation is no gap, and an escaped space or tab is part of the word. Reads from the end, so a long part costs nothing. */
const atWordStart = (text: string) => {
  let at = text.length
  while (text[at - 1] === '\n' && escapedAt(text, at - 1)) at -= 2
  return at === 0 || (/[\s;&|(]/.test(text[at - 1]!) && !escapedAt(text, at - 1))
}

/**
 * The parts of a shell command between `&&`, `||`, `;`, a single `&` and new lines that sit outside
 * quotes, comments left out. A heredoc's body is no part: it goes in `docs`, and `<<` keeps a word
 * that names it (docOf), so each heredoc stays in its place among the commands. As bash does, the
 * body starts on the line after the `<<` and ends at a line that is exactly the word (`<<-` takes
 * the tabs off). With no such line it runs to the end of the command; a `$((1<<2))` is a shift (arithmetic), never a heredoc.
 * When supplied, `separators` receives the operator after each part except the last.
 */
export const shellParts = (command: string, docs: string[] = [], separators: string[] = []): string[] => {
  const parts: string[] = []
  let cur = ''
  let q: string | undefined
  let waiting: { n: number; end: string; tabs: boolean; continues: boolean }[] = []
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    if (q) {
      if (c === '\\' && q !== "'" && i + 1 < command.length) {
        cur += c + command[++i]
        continue
      }
      if (c === (q === '$' ? "'" : q)) q = undefined
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
    // `$'...'`: a backslash escapes in it, as in double quotes, and `'` ends it.
    if (c === '$' && command[i + 1] === "'") {
      q = '$'
      cur += command[i] + command[++i]!
      continue
    }
    // A comment runs to the end of its line: an apostrophe in it opens no quote.
    if (c === '#' && atWordStart(cur)) {
      while (i + 1 < command.length && command[i + 1] !== '\n') i++
      continue
    }
    const sum = arithmetic(command, i)
    if (sum > i) {
      cur += command.slice(i, sum)
      i = sum - 1
      continue
    }
    const doc = c === '<' ? /^<<(-?)[ \t]*((?:\$'(?:[^'\\\n]|\\.)*'|'[^'\n]*'|"[^"\n]*"|\\.|[^\s'"\\<>;&|()])+)/.exec(command.slice(i)) : null
    if (doc) {
      const n = docs.push('') - 1
      waiting.push({ n, end: docEnd(doc[2]!), tabs: doc[1] === '-', continues: !/['"\\]/.test(doc[2]!) })
      cur += `<<${docMark(n)}`
      i += doc[0].length - 1
      continue
    }
    if (command.startsWith('<<<', i)) {
      cur += '<<<'
      i += 2
      continue
    }
    if (c === '\n' && waiting.length) {
      let at = i + 1
      for (const w of waiting) {
        const body = docBody(command, at, w.end, w.tabs, w.continues)
        if (!body) continue
        docs[w.n] = body.text
        at = body.next
      }
      waiting = []
      i = at - 1
    }
    // A line that ends in a pipe goes on to the next; a `\\|` is text.
    if (c === '\n' && /(?<!\\)(?:\\\\)*\|\s*$/.test(cur)) continue
    const two = command.slice(i, i + 2)
    if (two === '&&' || two === '||') {
      parts.push(cur)
      separators.push(two)
      cur = ''
      i++
      continue
    }
    // A single `&` (run in the background) ends a command too; not the `&` of `>&2`, `2>&1`, `&>`, `&>>` or `|&`.
    if (c === ';' || c === '\n' || (c === '&' && !/[>|]/.test(command[i - 1] ?? '') && command[i + 1] !== '>')) {
      parts.push(cur)
      separators.push(c)
      cur = ''
      continue
    }
    cur += c
  }
  parts.push(cur)
  return parts
}


export type Word = { text: string; quoted: boolean; pipe?: boolean; redirect?: boolean; expands?: boolean; expandsOutsideQuotes?: boolean }

const REDIRECT = /^(?:&>>?|>>|>\||>&|>|<<<|<<-?|<&|<>|<)/

/** The `)` that closes the `(` at `from`, quotes and escapes skipped as bash skips them; the text's end when none does. */
const substitutionEnd = (part: string, from: number) => {
  let depth = 0
  for (let i = from; i < part.length; i++) {
    const c = part[i]!
    if (c === '\\') i++
    else if (c === "'") {
      const end = part.indexOf("'", i + 1)
      i = end < 0 ? part.length : end
    } else if (c === '"') {
      for (i++; i < part.length && part[i] !== '"'; i++) if (part[i] === '\\') i++
    } else if (c === '(') depth++
    else if (c === ')' && --depth === 0) return i
  }
  return part.length
}

/**
 * The words of one part of a command, as the shell reads them: pieces that touch with no space
 * between (`s/'a b'/"c"/`) are one word, quotes removed (`$'...'` read by ansiC, `$(...)` kept whole); `\ `
 * outside quotes is a space in the word; a `|`, `(` or `)` outside quotes is a word of its own (`pipe`), and so
 * is a redirect (`redirect`: `>>`, `2>`, `&>`, its file the next word). `quoted` says the word began
 * with a quote (then it is never an option). Outside quotes a backslash is dropped only before a space, a
 * quote, a backslash or `|;&`, so a Windows path (`E:\p\log.md`) keeps its separators; a backslash and a
 * new line, outside quotes or in double quotes, are both dropped. `expands`: the shell works out the word
 * when it runs: a `*?[{` outside quotes, a `$` or backtick outside single quotes.
 * `expandsOutsideQuotes` keeps whether a filled value may still split into words or glob.
 */
export const shellWords = (part: string): Word[] => {
  const out: Word[] = []
  let text: string | undefined
  let quoted = false
  let expands = false
  let expandsOutsideQuotes = false
  const push = () => {
    if (text !== undefined) out.push({ text, quoted, ...(expands ? { expands } : {}), ...(expandsOutsideQuotes ? { expandsOutsideQuotes } : {}) })
    text = undefined
    expands = false
    expandsOutsideQuotes = false
  }
  for (let i = 0; i < part.length; i++) {
    const c = part[i]!
    // `(` and `)` of a subshell end a command as a pipe does; `$(...)` below stays inside its word.
    if (c === '|' || c === '(' || c === ')') {
      push()
      out.push({ text: c, quoted: false, pipe: true })
      if (c === '|' && part[i + 1] === '&') i++
      continue
    }
    const op = c === '>' || c === '<' || (c === '&' && part[i + 1] === '>') ? REDIRECT.exec(part.slice(i))?.[0] : undefined
    if (op) {
      // `2>`: digits touching the redirect name a stream, they are not a word.
      const fd = text !== undefined && !quoted && /^\d+$/.test(text) ? text : ''
      if (fd) text = undefined
      else push()
      out.push({ text: fd + op, quoted: false, redirect: true })
      i += op.length - 1
      continue
    }
    // A backslash at a line's end joins the lines: it is no word and no character.
    if (c === '\\' && part[i + 1] === '\n') {
      i++
      continue
    }
    if (/\s/.test(c)) {
      push()
      continue
    }
    if (text === undefined) {
      text = ''
      quoted = c === "'" || c === '"' || (c === '$' && part[i + 1] === "'")
    }
    if (c === '$' && part[i + 1] === '(') {
      const end = substitutionEnd(part, i + 1)
      text += part.slice(i, end + 1)
      expands = true
      expandsOutsideQuotes = true
      i = end
    } else if (c === '$' && part[i + 1] === "'") {
      // `$'...'`: quoted, with its C escapes read.
      const end = ansiEnd(part, i + 2)
      text += ansiC(part.slice(i + 2, end))
      i = end
    } else if (c === "'") {
      const end = part.indexOf("'", i + 1)
      const stop = end < 0 ? part.length : end
      text += part.slice(i + 1, stop)
      i = stop
    } else if (c === '"') {
      for (i++; i < part.length && part[i] !== '"'; i++) {
        if (part[i] === '\\' && part[i + 1] === '\n') {
          i++
          continue
        }
        if (part[i] === '\\' && i + 1 < part.length && '$`"\\'.includes(part[i + 1]!)) i++
        else if (part[i] === '$' || part[i] === '`') expands = true
        text += part[i]
      }
    } else if (c === '\\' && i + 1 < part.length) {
      const n = part[i + 1]!
      text += /[\s'"\\|;&*?[\]{}$`]/.test(n) ? n : c + n
      i++
    } else {
      if (/[*?[{$`]/.test(c)) expands = expandsOutsideQuotes = true
      text += c
    }
  }
  push()
  return out
}

/** The commands of a pipeline: the words between pipes. */
export const stages = (words: Word[]): Word[][] => {
  const out: Word[][] = [[]]
  for (const w of words) {
    if (w.pipe) out.push([])
    else out[out.length - 1]!.push(w)
  }
  return out
}

/** A command's words less its redirects and the file each one names. */
export const withoutRedirects = (words: Word[]) => words.filter((w, i) => !w.redirect && !words[i - 1]?.redirect)
