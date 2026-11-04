// The shell side of reading a command: its parts between separators and the words of one part,
// cut only outside quotes, the way the shell itself reads them.

/** The parts of a shell command between `&&`, `||`, `;`, a single `&` and new lines that sit outside quotes, comments left out. */
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
    // A comment runs to the end of its line: an apostrophe in it opens no quote.
    if (c === '#' && /^$|[\s;&|(]/.test(command[i - 1] ?? '')) {
      while (i + 1 < command.length && command[i + 1] !== '\n') i++
      continue
    }
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


export type Word = { text: string; quoted: boolean; pipe?: boolean; redirect?: boolean }

const REDIRECT = /^(?:&>>?|>>|>\||>&|>|<<<|<<-?|<&|<>|<)/

/**
 * The words of one part of a command, as the shell reads them: pieces that touch with no space
 * between (`s/'a b'/"c"/`) are one word, quotes removed (`$'...'` with its C escapes read, `$(...)` kept whole); `\ `
 * outside quotes is a space in the word; a `|`, `(` or `)` outside quotes is a word of its own (`pipe`), and so
 * is a redirect (`redirect`: `>>`, `2>`, `&>`, its file the next word). `quoted` says the word began
 * with a quote (then it is never an option). Outside quotes a backslash is dropped only before a space, a
 * quote, a backslash or `|;&`, so a Windows path (`E:\p\log.md`) keeps its separators.
 */
export const shellWords = (part: string): Word[] => {
  const out: Word[] = []
  let text: string | undefined
  let quoted = false
  const push = () => {
    if (text !== undefined) out.push({ text, quoted })
    text = undefined
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
    if (/\s/.test(c)) {
      push()
      continue
    }
    if (text === undefined) {
      text = ''
      quoted = c === "'" || c === '"' || (c === '$' && part[i + 1] === "'")
    }
    if (c === '$' && part[i + 1] === '(') {
      let depth = 0
      let end = i + 1
      for (; end < part.length; end++) {
        if (part[end] === '(') depth++
        else if (part[end] === ')' && --depth === 0) break
      }
      text += part.slice(i, end + 1)
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
