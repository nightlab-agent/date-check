// What a shell command writes: for each file it names, the text it sends there.

import { commandIn, commandName, sedCommands, sedInPlace, shellParts, writtenText } from './sed'
import { docOf, ESCAPE, escapeValue, IN_FORMAT, shellWords, stages, withoutRedirects } from './shell'
import type { Word } from './shell'

/** Files whose stamps are judged: Markdown and plain text, logs, and changelog-like names. Code is not. */
export const isText = (path: string) =>
  /\.(?:md|markdown|mdx|txt|text|rst|adoc|asciidoc|org|log)$/i.test(path) ||
  /(?:^|[/\\])(?:CHANGELOG|CHANGES|HISTORY|NEWS|RELEASES?|NOTES)$/i.test(path)

/** `%b` reads an octal escape with or without its leading 0 (up to three more digits after a 0), `echo -e` only with it; a format reads three digits in all. */
const IN_ARGUMENT = ESCAPE('0[0-7]{0,3}|[1-7][0-7]{0,2}')
const IN_ECHO = ESCAPE('0[0-7]{0,3}')

/** `text` with its escapes worked out; in a `%b` argument or an `echo -e`, a `\c` ends everything printed, which `ended` says. */
const unescaped = (text: string, reading = IN_FORMAT) => {
  const stops = reading !== IN_FORMAT
  let out = ''
  let at = 0
  for (const m of text.matchAll(reading)) {
    out += text.slice(at, m.index)
    at = m.index + m[0].length
    if (stops && m[5] === 'c') return { text: out, ended: true }
    out += stops && /["'?]/.test(m[5] ?? '') ? m[0] : escapeValue(m)
  }
  return { text: out + text.slice(at), ended: false }
}

/** A `printf` directive: flags, width, precision and kind, with `%(...)T`, which prints the clock. `%n` prints nothing and takes a variable's name; any other word stops printf. */
const DIRECTIVE = /%(?:\([^)]*\))?([-+ 0#]*)(\d*|\*)(?:\.(\d*|\*))?([diouxXeEfFgGaAcsbqTn%])/g

/** A whole number as `printf` reads it: decimal, `0x` hex or `0` octal, as far as it goes, so `2027x` is 2027 and `abc` is 0, each with an error bash prints elsewhere. A leading quote makes it the next character's number. */
const integer = (arg: string) => {
  if (/^['"]/.test(arg)) return BigInt(arg.codePointAt(1) ?? 0)
  const m = /^\s*([-+]?)(0[xX][\da-fA-F]+|0[0-7]*|[1-9]\d*)?/.exec(arg)!
  const digits = m[2] ?? '0'
  const value = BigInt(/^0[0-7]+$/.test(digits) ? `0o${digits.slice(1)}` : digits)
  return m[1] === '-' ? -value : value
}

/** The most padding worked out; past this a width only costs memory, and a string has a limit. */
const WIDEST = 2 ** 20
const UNSIGNED_MAX = 2n ** 64n - 1n
const SIGNED_MAX = 2n ** 63n - 1n

/** Past what its kind holds, bash stops at the limit; a negative number in an unsigned kind wraps at 64 bits. */
const inRange = (signed: boolean, value: bigint) => {
  if (signed) return value > SIGNED_MAX ? SIGNED_MAX : value < -SIGNED_MAX - 1n ? -SIGNED_MAX - 1n : value
  if (value > UNSIGNED_MAX || value < -UNSIGNED_MAX) return UNSIGNED_MAX
  return value < 0n ? value + UNSIGNED_MAX + 1n : value
}

/** A whole number as its directive prints it. */
const wholeNumber = (flags: string, width: number, precision: string | undefined, kind: string, value: bigint) => {
  const signed = /[di]/.test(kind)
  const n = inRange(signed, value)
  const size = n < 0n ? -n : n
  const text = size.toString(kind === 'o' ? 8 : /x/i.test(kind) ? 16 : 10)
  let digits = precision !== undefined && !Number(precision) && !size ? '' : text.padStart(Math.min(Number(precision ?? 0), WIDEST), '0')
  if (kind === 'X') digits = digits.toUpperCase()
  const prefix = !flags.includes('#') ? '' : kind === 'o' ? (digits.startsWith('0') ? '' : '0') : size && /x/i.test(kind) ? `0${kind}` : ''
  const sign = !signed ? '' : n < 0n ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : ''
  const zeros = flags.includes('0') && !flags.includes('-') && precision === undefined
  return sign + prefix + (zeros ? digits.padStart(width - sign.length - prefix.length, '0') : digits)
}

/** The first `count` UTF-8 bytes of `text`, which is how a precision counts in `%s` and `%b`. */
const firstBytes = (text: string, count: number) => new TextDecoder().decode(new TextEncoder().encode(text).slice(0, count))

/** One argument as its directive prints it: `%s`, `%b`, `%c` and whole numbers as bash does, other kinds as written. */
const shown = (flags: string, width: number, precision: string | undefined, kind: string, arg: string) => {
  const body = /[diouxX]/.test(kind) ? wholeNumber(flags, width, precision, kind, integer(arg))
    : kind === 'c' ? arg.slice(0, 1)
    : /[sb]/.test(kind) && precision !== undefined ? firstBytes(arg, Number(precision))
    : arg
  return flags.includes('-') ? body.padEnd(width) : body.padStart(width)
}

/**
 * What a `printf` prints: its format filled from the arguments, and used again while arguments
 * are left. A format the shell works out as it runs (`"$FORMAT"`) with no directive in sight can put
 * its arguments anywhere: each is read alone on a line, so a stamp among them is still judged.
 * The format's escapes are worked out around its directives, so `\x25d` stays text.
 */
const formatted = (format: Word | undefined, args: string[]) => {
  if (!format) return ''
  let next = 0
  let out = ''
  const once = () => {
    let at = 0
    for (const m of format.text.matchAll(DIRECTIVE)) {
      out += unescaped(format.text.slice(at, m.index)).text
      at = m.index + m[0].length
      const [, flags, width, precision, kind] = m as unknown as [string, string, string, string | undefined, string]
      if (kind === '%') {
        out += '%'
        continue
      }
      const size = width === '*' ? Number(integer(args[next++] ?? '')) : Number(width)
      // A negative `*` precision counts as no precision.
      const star = precision === '*' ? integer(args[next++] ?? '') : undefined
      const cut = star === undefined ? precision : star < 0n ? undefined : String(star)
      const arg = args[next++] ?? ''
      if (kind === 'n') {
        if (/^[A-Za-z_]\w*$/.test(arg)) continue
        return false
      }
      const b = kind === 'b' ? unescaped(arg, IN_ARGUMENT) : undefined
      out += shown(size < 0 ? `${flags}-` : flags, Math.min(Math.abs(size), WIDEST), cut, kind, b?.text ?? arg)
      if (b?.ended) return false
    }
    out += unescaped(format.text.slice(at)).text
    return true
  }
  let from: number
  do from = next
  while (once() && next > from && next < args.length)
  return next === 0 && format.expands ? [out, ...args].join('\n') : out
}

/** What an `echo` prints and whether it ends its line: the shell takes quotes off before echo reads its flags; escapes count when `-e` comes last of `-e` and `-E`, and `-n` or a read `\c` ends no line. */
const echoed = (args: Word[]) => {
  const words = withoutRedirects(args)
  const first = words.findIndex(w => !/^-[neE]+$/.test(w.text))
  const flags = words.slice(0, first < 0 ? words.length : first).flatMap(w => [...w.text])
  const text = (first < 0 ? [] : words.slice(first)).map(w => w.text).join(' ')
  const read = flags.findLast(c => /[eE]/.test(c)) === 'e' ? unescaped(text, IN_ECHO) : { text, ended: false }
  return { text: read.text, openLine: flags.includes('n') || read.ended }
}

/** The text an `echo` or `printf` prints, quoted or not; a `printf` as its format makes it (formatted). */
const printed = ([command, ...args]: Word[]) => {
  if (commandName(command!) === 'echo') return echoed(args).text
  const words = withoutRedirects(args)
  // The shell takes the quotes off before printf reads its `--`.
  const first = words.findIndex(w => w.text !== '--')
  const said = first < 0 ? [] : words.slice(first)
  return formatted(said[0], said.slice(1).map(w => w.text))
}

/** The file a `xargs sed -i` writes, which the pipe names when it runs: judged as a text file not read. */
export const PIPED = '(files from xargs).txt'

/** A `printf`, `echo -n`, an echo stopped by `\c`, or a `cat` or `tee` passing on its input adds no new line of its own: the next write to the file goes on the same line. */
const printsNoNewline = (stage: Word[]) => {
  const words = commandIn(stage)?.words ?? []
  if (!words[0]) return false
  const name = commandName(words[0])
  return /^(?:printf|cat|tee)$/.test(name) || (name === 'echo' && echoed(words.slice(1)).openLine)
}

/** One write a shell command makes: the file, whether the shell works its name out as it runs, the text, and for a sed -i its scripts. */
export type ShellWrite = { file: string; expands?: boolean; text: string; replaces?: boolean; joins?: boolean; sed?: { scripts: string[]; ere: boolean; z: boolean; scriptFile: boolean } }

/** A file as one spelling: `./notes.md`, `a/./notes.md` and `a//notes.md` are what the shell opens without the extras. */
const oneSpelling = (path: string) => path.replace(/\/{2,}/g, '/').replace(/(^|\/)(?:\.\/)+/g, '$1')

const named = (w: Word) => ({ file: w.expands ? w.text : oneSpelling(w.text), ...(w.expands ? { expands: true } : {}) })

const ASSIGNMENT = /^([A-Za-z_]\w*)=([\s\S]*)$/
/** Names a command sets, in step order: each holds a plain value until a step may have changed it. Inside a subshell, `if` or a loop a name is forgotten: that step may not run, or may not last. */
const nameKeeper = () => {
  const vars = new Map<string, string>()
  const assigned = new Set<string>()
  let depth = 0
  const note = (words: Word[], conditional: boolean, background: boolean) => {
    for (const w of words) {
      if (w.pipe && w.text === '(') depth++
      if (w.pipe && w.text === ')') depth = Math.max(0, depth - 1)
    }
    const body = [...words]
    while (body[0] && !body[0].quoted && /^(?:\(|then|else|elif|do)$/.test(body[0].text)) body.shift()
    const first = body[0]?.quoted ? '' : body[0]?.text
    if (first === 'for' && body[1]) { vars.delete(body[1]!.text); assigned.add(body[1]!.text) }
    if (/^(?:if|for|while|until|case)$/.test(first ?? '')) depth++
    // A loop after a pipe runs in a subshell, so its names never reach the next step.
    else if (words.some((w, i) => w.pipe && !words[i + 1]?.quoted && /^(?:if|for|while|until|case)$/.test(words[i + 1]?.text ?? ''))) depth++
    if (body[0]?.text === 'unset') for (const w of body.slice(1)) vars.delete(w.text)
    const set = body[0]?.text === 'export' ? body.slice(1) : body
    const only = set.length > 0 && set.every(w => !w.quoted && !w.redirect && !w.pipe && ASSIGNMENT.test(w.text))
    if (depth > 0) for (const w of set) { const m = w.quoted ? null : ASSIGNMENT.exec(w.text); if (m) { vars.delete(m[1]!); assigned.add(m[1]!) } }
    else if (only) for (const w of set) {
      const [, name, value] = ASSIGNMENT.exec(w.text)!
      // A conditional reassignment may leave the earlier value; a background assignment never lasts.
      // A first conditional assignment still names a possible write, as other optional writes do.
      if (w.expands || background || (conditional && assigned.has(name!))) vars.delete(name!)
      else vars.set(name!, value!)
      assigned.add(name!)
    }
    if (/^(?:fi|done|esac)$/.test(first ?? '')) depth = Math.max(0, depth - 1)
    return only
  }
  /** A word with the names filled in: all of them known, it reads as a file named outright. */
  const fill = (w: Word) => {
    if (!w.expands) return w
    const parameter = /\$(?:\{(\w+)\}|(\w+))/g
    const rest = w.text.replace(parameter, (whole, a, b) => vars.has(a ?? b) ? '' : whole)
    const text = w.text.replace(parameter, (whole, a, b) => vars.get(a ?? b) ?? whole)
    // Expansion does not re-read a value's $ or backtick; only an unquoted value can split or glob.
    const expands = /[$`]/.test(rest) || (!!w.expandsOutsideQuotes && /[\s*?[{]/.test(text))
    return expands ? w : { ...w, text, expands: false }
  }
  return { note, fill }
}

/** The text a `cat` or `tee` gets on its input: a here-string or the body of a heredoc, when that is the last redirect of descriptor 0, which is the one the shell keeps; `</dev/stdin` reopens the same input. */
const fedIn = (words: Word[], docs: string[]) => {
  const at = words.findLastIndex((w, i) => w.redirect && /^0?</.test(w.text) && words[i + 1]?.text !== '/dev/stdin')
  if (at < 0) return undefined
  const how = words[at]!.text
  if (/^0?<<<$/.test(how)) return `${words[at + 1]?.text ?? ''}\n`
  return /^0?<<-?$/.test(how) ? docOf(words[at + 1]?.text, docs) : undefined
}

/** The text a command of a pipeline makes itself: what an `echo` or `printf` prints, or a `cat` or `tee` heredoc. */
const madeBy = (stage: Word[], docs: string[]) => {
  const run = commandIn(stage)
  if (!run) return undefined
  const name = commandName(run.words[0]!)
  return /^(?:echo|printf)$/.test(name) ? printed(run.words) : /^(?:cat|tee)$/.test(name) ? fedIn(stage, docs) : undefined
}

/**
 * The files that get the text the first command of `pipeline` makes, read from its words so a quoted
 * `>` is text and a quoted name is one name: each `>`, `>>`, `>|`, `&>`, `&>>` or `1>` (not `2>`, which
 * sends only errors, nor `>&2`, a stream), and every file a `tee` further on names. The text stops
 * at the first command that sends its output off the pipe, and before one that makes its own.
 */
const outFiles = (pipeline: Word[][], docs: string[]) => {
  const files: (Word & { replaces?: boolean })[] = []
  for (const [at, stage] of pipeline.entries()) {
    if (at > 0 && madeBy(stage, docs) !== undefined) break
    let offPipe = false
    for (const [i, w] of stage.entries()) {
      const to = stage[i + 1]
      if (!w.redirect || !to || !/^(?:1?>|&>)/.test(w.text)) continue
      const stream = w.text.endsWith('&') && /^(?:\d+-?|-)$/.test(to.text)
      if (!stream) files.push({ ...to, replaces: !w.text.includes('>>') })
      if (to.text !== (stream ? '1' : '/dev/stdout')) offPipe = true
    }
    const run = commandIn(stage)
    if (run && commandName(run.words[0]!) === 'tee')
      files.push(...withoutRedirects(run.words.slice(1)).filter(w => w.quoted || !w.text.startsWith('-'))
        .map(w => ({ ...w, replaces: !run.words.some(a => /^-[a-z]*a|^--append$/.test(a.text)) })))
    if (offPipe) break
  }
  return files.filter(f => f.text !== '/dev/null')
}

/**
 * Every write in a shell command, in order: an `echo`, a `printf`, or a `cat` or `tee` with a heredoc
 * whose own part of the command (between `&&`, `||`, `;` and new lines, outside quotes) sends it to
 * a file, down the pipeline as far as the text goes (outFiles), and each file a `sed -i` edits.
 */
export const shellWrites = (command: string): ShellWrite[] => {
  const out: ShellWrite[] = []
  const docs: string[] = []
  const names = nameKeeper()
  const separators: string[] = []
  let conditional = false
  for (const [i, part] of shellParts(command, docs, separators).entries()) {
    const words = shellWords(part)
    const maybe = conditional
    // A newline after && or || does not end the condition.
    if (words.length) conditional = /^(?:&&|\|\|)$/.test(separators[i] ?? '')
    if (names.note(words, maybe, separators[i] === '&')) continue
    const sed = sedInPlace(part)
    if (sed) {
      // sed reads its scripts as one, a new line between them (`-e 'a\\' -e 'text'`).
      const text = sedCommands(sed.scripts.join('\n')).map(writtenText).filter((t): t is string => t !== undefined).join('\n')
      if (text) for (const file of sed.files) out.push({ ...named(names.fill(file)), text, sed: { scripts: sed.scripts, ere: sed.ere, z: sed.z, scriptFile: sed.scriptFile } })
      // Run by xargs: the files come from the pipe, so the text it writes is judged alone, when the
      // pipe's source names text files (`grep -l TBD log.md`, `git ls-files '*.md'`); code is not judged.
      if (text && sed.piped && sed.source.some(isText)) out.push({ file: PIPED, text })
      continue
    }
    const pipeline = stages(shellWords(part))
    for (const [at, stage] of pipeline.entries()) {
      const text = madeBy(stage, docs)
      if (text === undefined) continue
      const joins = printsNoNewline(stage)
      for (const file of outFiles(pipeline.slice(at), docs))
        out.push({ ...named(names.fill(file)), text, ...(file.replaces ? { replaces: true } : {}), ...(joins ? { joins: true } : {}) })
    }
  }
  return out
}
