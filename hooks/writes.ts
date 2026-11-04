// What a shell command writes: for each file it names, the text it sends there.

import { commandIn, commandName, sedCommands, sedInPlace, shellParts, writtenText } from './sed'
import { docOf, shellWords, stages, withoutRedirects } from './shell'
import type { Word } from './shell'

/** Files whose stamps are judged: Markdown and plain text, logs, and changelog-like names. Code is not. */
export const isText = (path: string) =>
  /\.(?:md|markdown|mdx|txt|text|rst|adoc|asciidoc|org|log)$/i.test(path) ||
  /(?:^|[/\\])(?:CHANGELOG|CHANGES|HISTORY|NEWS|RELEASES?|NOTES)$/i.test(path)

/** The backslash escapes of a `printf` format or `%b` argument that can matter to a stamp. */
const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'" }
const unescaped = (text: string) => text.replace(/\\(.)/g, (m, c: string) => ESCAPES[c] ?? m)

/** A `printf` directive: flags, width, precision and kind, with `%(...)T`, which prints the clock. Used only with `replace`. */
const DIRECTIVE = /%(?:\([^)]*\))?([-+ 0#]*)(\d*)(?:\.(\d*))?([diouxXeEfFgGaAcsbqT%])/g

/** One argument as its directive prints it: `%s`, `%b`, `%c` and whole numbers as bash does, other kinds as written. */
const shown = (flags: string, width: string, precision: string | undefined, kind: string, arg: string) => {
  const digits = /[diu]/.test(kind) && /^\d*$/.test(arg)
  const text = kind === 'b' ? unescaped(arg) : arg
  const body = digits ? (arg || '0').padStart(Number(precision ?? 0), '0')
    : kind === 'c' ? text.slice(0, 1)
    : /[sb]/.test(kind) && precision !== undefined ? text.slice(0, Number(precision))
    : text
  if (flags.includes('-')) return body.padEnd(Number(width))
  return body.padStart(Number(width), digits && flags.includes('0') ? '0' : ' ')
}

/**
 * What a `printf` prints: its format filled from the arguments, and used again while arguments
 * are left. A format the shell works out as it runs (`"$FORMAT"`) with no directive in sight can put
 * its arguments anywhere: each is read alone on a line, so a stamp among them is still judged.
 */
const formatted = (format: Word | undefined, args: string[]) => {
  if (!format) return ''
  const template = unescaped(format.text)
  let next = 0
  let out = ''
  let from: number
  do {
    from = next
    out += template.replace(DIRECTIVE, (_, flags: string, width: string, precision: string | undefined, kind: string) =>
      kind === '%' ? '%' : shown(flags, width, precision, kind, args[next++] ?? ''))
  } while (next > from && next < args.length)
  return next === 0 && format.expands ? [out, ...args].join('\n') : out
}

/**
 * The text an `echo` or `printf` prints, quoted or not: an `echo`'s words as one line after its
 * flags, where a written `\\n` is a new line as `echo -e` makes it, and a `printf` as its format
 * makes it (formatted).
 */
const printed = ([command, ...args]: Word[]) => {
  const echo = commandName(command!) === 'echo'
  const words = withoutRedirects(args)
  // The shell takes the quotes off before printf reads its `--`; an echo flag in quotes is the same, but stays text here.
  const first = words.findIndex(w => (echo && w.quoted) || !(echo ? /^-[neE]+$/ : /^--$/).test(w.text))
  const said = first < 0 ? [] : words.slice(first)
  if (echo) return said.map(w => w.text).join(' ').replace(/\\n/g, '\n')
  return formatted(said[0], said.slice(1).map(w => w.text))
}

/** The file a `xargs sed -i` writes, which the pipe names when it runs: judged as a text file not read. */
export const PIPED = '(files from xargs).txt'

/** A `printf` or `echo -n` adds no new line of its own: the next write to the file goes on the same line. */
const printsNoNewline = (stage: Word[]) => {
  const words = commandIn(stage)?.words ?? []
  if (!words[0]) return false
  const name = commandName(words[0])
  return name === 'printf' || (name === 'echo' && withoutRedirects(words.slice(1)).some(w => !w.quoted && /^-[eE]*n[neE]*$/.test(w.text)))
}

/** One write a shell command makes: the file, whether the shell works its name out as it runs, the text, and for a sed -i its scripts. */
export type ShellWrite = { file: string; expands?: boolean; text: string; replaces?: boolean; joins?: boolean; sed?: { scripts: string[]; ere: boolean; z: boolean; scriptFile: boolean } }

const named = (w: Word) => ({ file: w.text, ...(w.expands ? { expands: true } : {}) })

/** The text a `cat` or `tee` gets on its input: the body of its last heredoc, as the shell gives it. */
const heredocIn = (words: Word[], docs: string[]) => {
  const at = words.findLastIndex(w => w.redirect && /^0?<<-?$/.test(w.text))
  return at < 0 ? undefined : docOf(words[at + 1]?.text, docs)
}

/** The text a command of a pipeline makes itself: what an `echo` or `printf` prints, or a `cat` or `tee` heredoc. */
const madeBy = (stage: Word[], docs: string[]) => {
  const run = commandIn(stage)
  if (!run) return undefined
  const name = commandName(run.words[0]!)
  return /^(?:echo|printf)$/.test(name) ? printed(run.words) : /^(?:cat|tee)$/.test(name) ? heredocIn(run.words, docs) : undefined
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
  for (const part of shellParts(command, docs)) {
    const sed = sedInPlace(part)
    if (sed) {
      // sed reads its scripts as one, a new line between them (`-e 'a\\' -e 'text'`).
      const text = sedCommands(sed.scripts.join('\n')).map(writtenText).filter((t): t is string => t !== undefined).join('\n')
      if (text) for (const file of sed.files) out.push({ ...named(file), text, sed: { scripts: sed.scripts, ere: sed.ere, z: sed.z, scriptFile: sed.scriptFile } })
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
        out.push({ ...named(file), text, ...(file.replaces ? { replaces: true } : {}), ...(joins ? { joins: true } : {}) })
    }
  }
  return out
}
