// The shell side of reading a command: its parts between separators and the words of one part,
// cut only outside quotes, the way the shell itself reads them.

/** A heredoc's place in a part: `<<` and this word, whose number is its body's in `docs`. */
const docMark = (n: number) => `${n}`
/** The body in `docs` that a redirect's word stands for. */
export const docOf = (word: string | undefined, docs: string[]) => docs[Number(/^(\d+)$/.exec(word ?? '')?.[1] ?? NaN)]

/** The text of a heredoc whose body starts at `from`, and where the line after its end starts; undefined with no end line. */
const docBody = (command: string, from: number, end: string, tabs: boolean) => {
  const lines: string[] = []
  for (let at = from; at <= command.length; ) {
    const stop = command.indexOf('\n', at)
    const raw = command.slice(at, stop < 0 ? undefined : stop)
    const line = tabs ? raw.replace(/^\t+/, '') : raw
    if (line === end) return { text: lines.join('\n'), next: stop < 0 ? command.length : stop + 1 }
    if (stop < 0) return undefined
    lines.push(line)
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

/**
 * The parts of a shell command between `&&`, `||`, `;`, a single `&` and new lines that sit outside
 * quotes, comments left out. A heredoc's body is no part: it goes in `docs`, and `<<` keeps a word
 * that names it (docOf), so each heredoc stays in its place among the commands. As bash does, the
 * body starts on the line after the `<<` and ends at a line that is exactly the word (`<<-` takes
 * the tabs off). With no such line it is no heredoc: `$((1<<2))` is a shift.
 */
export const shellParts = (command: string, docs: string[] = []): string[] => {
  const parts: string[] = []
  let cur = ''
  let q: string | undefined
  let waiting: { n: number; end: string; tabs: boolean }[] = []
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
    if (c === '#' && /^$|[\s;&|(]/.test(command[i - 1] ?? '')) {
      while (i + 1 < command.length && command[i + 1] !== '\n') i++
      continue
    }
    const sum = arithmetic(command, i)
    if (sum > i) {
      cur += command.slice(i, sum)
      i = sum - 1
      continue
    }
    const doc = c === '<' ? /^<<(-?)[ \t]*((?:'[^'\n]*'|"[^"\n]*"|\\.|[^\s'"\\<>;&|()])+)/.exec(command.slice(i)) : null
    if (doc) {
      const n = docs.push('') - 1
      waiting.push({ n, end: doc[2]!.replace(/['"\\]/g, ''), tabs: doc[1] === '-' })
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
        const body = docBody(command, at, w.end, w.tabs)
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
      cur = ''
      i++
      continue
    }
    // A single `&` (run in the background) ends a command too; not the `&` of `>&2`, `2>&1`, `&>`, `&>>` or `|&`.
    if (c === ';' || c === '\n' || (c === '&' && !/[>|]/.test(command[i - 1] ?? '') && command[i + 1] !== '>')) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  parts.push(cur)
  return parts
}


export type Word = { text: string; quoted: boolean; pipe?: boolean; redirect?: boolean; expands?: boolean }

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
 * between (`s/'a b'/"c"/`) are one word, quotes removed (`$'...'` with its C escapes read, `$(...)` kept whole); `\ `
 * outside quotes is a space in the word; a `|`, `(` or `)` outside quotes is a word of its own (`pipe`), and so
 * is a redirect (`redirect`: `>>`, `2>`, `&>`, its file the next word). `quoted` says the word began
 * with a quote (then it is never an option). Outside quotes a backslash is dropped only before a space, a
 * quote, a backslash or `|;&`, so a Windows path (`E:\p\log.md`) keeps its separators; a backslash and a
 * new line, outside quotes or in double quotes, are both dropped. `expands`: the shell works out the word
 * when it runs: a `*?[{` outside quotes, a `$` or backtick outside single quotes.
 */
export const shellWords = (part: string): Word[] => {
  const out: Word[] = []
  let text: string | undefined
  let quoted = false
  let expands = false
  const push = () => {
    if (text !== undefined) out.push({ text, quoted, ...(expands ? { expands } : {}) })
    text = undefined
    expands = false
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
      i = end
    } else if (c === '$' && part[i + 1] === "'") {
      // `$'...'`: quoted, with C escapes (`\n`, `\t`, `\'`, `\\`); any other backslash stays as written.
      const esc: Record<string, string> = { n: '\n', t: '\t', r: '\r', "'": "'", '\\': '\\', '"': '"' }
      for (i += 2; i < part.length && part[i] !== "'"; i++) {
        if (part[i] === '\\' && i + 1 < part.length) {
          const n = part[++i]!
          text += esc[n] ?? `\\${n}`
        } else text += part[i]
      }
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
      if (/[*?[{$`]/.test(c)) expands = true
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
