// What a shell command writes: for each file it names, the text it sends there.

import { commandIn, commandName, sedCommands, sedInPlace, shellParts, writtenText } from './sed'
import { shellWords, stages, withoutRedirects } from './shell'
import type { Word } from './shell'

/** Files whose stamps are judged: Markdown and plain text, logs, and changelog-like names. Code is not. */
export const isText = (path: string) =>
  /\.(?:md|markdown|mdx|txt|text|rst|adoc|asciidoc|org|log)$/i.test(path) ||
  /(?:^|[/\\])(?:CHANGELOG|CHANGES|HISTORY|NEWS|RELEASES?|NOTES)$/i.test(path)

/**
 * The files a part of a command sends its output to, read from its words so a quoted `>` is text
 * and a quoted name is one name: each `>`, `>>`, `>|`, `&>`, `&>>` or `1>` (not `2>`, which sends
 * only errors, nor `>&2`, a stream), and every file a `tee` in the pipeline names.
 */
const outFiles = (part: string) => {
  const files: string[] = []
  for (const stage of stages(shellWords(part))) {
    for (const [i, w] of stage.entries()) {
      const to = stage[i + 1]
      if (!w.redirect || !to || !/^(?:1?>|&>)/.test(w.text)) continue
      if (!(w.text.endsWith('&') && /^(?:\d+-?|-)$/.test(to.text))) files.push(to.text)
    }
    const run = commandIn(stage)
    if (run && commandName(run.words[0]!) === 'tee')
      files.push(...withoutRedirects(run.words.slice(1)).filter(w => w.quoted || !w.text.startsWith('-')).map(w => w.text))
  }
  return files.filter(f => f !== '/dev/null')
}

/**
 * The text an `echo` or `printf` prints, quoted or not: an `echo`'s words as one line after its
 * flags, a `printf`'s format and arguments as a line each (the format decides what goes where).
 * A written `\\n` is a new line, as `echo -e` and `printf` make it.
 */
const printed = ([command, ...args]: Word[]) => {
  const echo = commandName(command!) === 'echo'
  const words = withoutRedirects(args)
  const first = words.findIndex(w => w.quoted || !(echo ? /^-[neE]+$/ : /^--$/).test(w.text))
  return (first < 0 ? [] : words.slice(first)).map(w => w.text).join(echo ? ' ' : '\n').replace(/\\n/g, '\n')
}

/** The file a `xargs sed -i` writes, which the pipe names when it runs: judged as a text file not read. */
export const PIPED = '(files from xargs).txt'

/** One write a shell command makes: the file, the text, and for a sed -i its scripts. */
export type ShellWrite = { file: string; text: string; sed?: { scripts: string[]; ere: boolean; z: boolean; scriptFile: boolean } }

/**
 * Every write in a shell command, in order: each `cat` or `tee` heredoc (at a line's start or after
 * `&&`, `||`, `;` or `|`) whose own line sends it to a file, an `echo`/`printf` whose own part of
 * the command (between `&&`, `||`, `;` and new lines, outside quotes) sends it to a file
 * (outFiles), and each file a `sed -i` edits.
 */
export const shellWrites = (command: string): ShellWrite[] => {
  const out: ShellWrite[] = []
  // Each heredoc is one write among the others: a second heredoc, a sed -i or an echo in the same command is read too.
  for (const doc of command.matchAll(/(?:^|[;&|])[ \t]*(cat|tee)\b([^\n]*)<<-?\s*['"]?([^\s'"<>;&|()]+)['"]?([^\n]*)\n([\s\S]*?)\n\s*\3\s*$/gm)) {
    // What follows the heredoc's own command on that line (`&& echo ...`) is read with the other parts below.
    for (const file of outFiles(`${doc[1]}${doc[2]} ${shellParts(doc[4]!)[0]}`)) out.push({ file, text: doc[5]! })
  }
  for (const part of shellParts(command.replace(/<<-?\s*['"]?([^\s'"<>;&|()]+)['"]?([^\n]*)\n[\s\S]*?\n\s*\1\s*$/gm, '$2'))) {
    const sed = sedInPlace(part)
    if (sed) {
      // sed reads its scripts as one, a new line between them (`-e 'a\\' -e 'text'`).
      const text = sedCommands(sed.scripts.join('\n')).map(writtenText).filter((t): t is string => t !== undefined).join('\n')
      if (text) for (const file of sed.files) out.push({ file, text, sed: { scripts: sed.scripts, ere: sed.ere, z: sed.z, scriptFile: sed.scriptFile } })
      // Run by xargs: the files come from the pipe, so the text it writes is judged alone, when the
      // pipe's source names text files (`grep -l TBD log.md`, `git ls-files '*.md'`); code is not judged.
      if (text && sed.piped && sed.source.some(isText)) out.push({ file: PIPED, text })
      continue
    }
    const first = stages(shellWords(part)).find(stage => stage.length)
    const run = first && commandIn(first)
    if (!run || !/^(?:echo|printf)$/.test(commandName(run.words[0]!))) continue
    const text = printed(run.words)
    for (const file of outFiles(part)) out.push({ file, text })
  }
  return out
}
