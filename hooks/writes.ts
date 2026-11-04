// What a shell command writes: for each file it names, the text it sends there.

import { sedCommands, sedInPlace, shellParts, writtenText } from './sed'

/** Files whose stamps are judged: Markdown and plain text, logs, and changelog-like names. Code is not. */
export const isText = (path: string) =>
  /\.(?:md|markdown|mdx|txt|text|rst|adoc|asciidoc|org|log)$/i.test(path) ||
  /(?:^|[/\\])(?:CHANGELOG|CHANGES|HISTORY|NEWS|RELEASES?|NOTES)$/i.test(path)

const TARGET = String.raw`["']?([^\s"';|&<>()]+)`
const target = (part: string) =>
  (new RegExp(String.raw`(?:^|[^\d<>&])[&1]?>>?\|?\s*` + TARGET).exec(part) ?? new RegExp(String.raw`\btee\s+(?:-a\s+)?` + TARGET).exec(part))?.[1]

/** The file a `xargs sed -i` writes, which the pipe names when it runs: judged as a text file not read. */
export const PIPED = '(files from xargs).txt'

/** One write a shell command makes: the file, the text, and for a sed -i its scripts. */
export type ShellWrite = { file: string; text: string; sed?: { scripts: string[]; ere: boolean; z: boolean } }

/**
 * Every write in a shell command, in order: each `cat` or `tee` heredoc (at a line's start or after
 * `&&`, `||`, `;` or `|`) whose own line redirects to a file, an `echo`/`printf` whose own part of
 * the command (between `&&`, `||`, `;` and new lines, outside quotes) sends it to a file with `>>`,
 * `>` or `| tee`, and each file a `sed -i` edits.
 */
export const shellWrites = (command: string): ShellWrite[] => {
  const clean = command.replace(/\d?>&\d|&>\s*\/dev\/null|\d?>\s*\/dev\/null/g, '')
  const out: ShellWrite[] = []
  // Each heredoc is one write among the others: a second heredoc, a sed -i or an echo in the same command is read too.
  for (const doc of clean.matchAll(/(?:^|[;&|])[ \t]*(?:cat|tee)\b([^\n]*)<<-?\s*['"]?([^\s'"<>;&|()]+)['"]?([^\n]*)\n([\s\S]*?)\n\s*\2\s*$/gm)) {
    const file = target(`${doc[1]} ${doc[3]}`) ?? (/^[;&|]?[ \t]*tee\b/.test(doc[0]) ? target(doc[0].split('\n')[0]!) : undefined)
    if (file && file !== '/dev/null') out.push({ file, text: doc[4]! })
  }
  for (const part of shellParts(clean.replace(/<<-?\s*['"]?([^\s'"<>;&|()]+)['"]?[^\n]*\n[\s\S]*?\n\s*\1\s*$/gm, ''))) {
    const sed = sedInPlace(part)
    if (sed) {
      const text = sed.scripts.flatMap(sedCommands).map(writtenText).filter((t): t is string => t !== undefined).join('\n')
      if (text) for (const file of sed.files) out.push({ file, text, sed: { scripts: sed.scripts, ere: sed.ere, z: sed.z } })
      // Run by xargs: the files come from the pipe, so the text it writes is judged alone, when the
      // pipe's source names text files (`grep -l TBD log.md`, `git ls-files '*.md'`); code is not judged.
      if (text && sed.piped && sed.source.some(isText)) out.push({ file: PIPED, text })
      continue
    }
    if (!/^\s*(?:echo|printf)\b/.test(part)) continue
    const to = target(part.replace(/\|\s*tee\b/, ' tee'))
    if (!to || to === '/dev/null') continue
    const said = [...part.matchAll(/(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/g)].map(m => (m[1] ?? m[2] ?? '').replace(/\\n/g, '\n'))
    out.push({ file: to, text: said.length ? said.join('\n') : part })
  }
  return out
}
