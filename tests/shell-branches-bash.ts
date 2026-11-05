// @ts-nocheck: standalone Bun oracle, like review-second-bash.ts; the plugin loader permits no Node imports.
// Run: bun tests/shell-branches-bash.ts. A nonzero result reports parser/Bash differences.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { shellWords } from '../hooks/shell'
import { shellWrites } from '../hooks/writes'
import { stampsIn } from '../hooks/stamps'

const date = '2027-01-15'
const forms = [
  ['printf comparison', `printf '\\n%s' '${date}' >notes.md`, `\n${date}`],
  ['printf ansi', `printf '\\n%s' $'${date}' >notes.md`, `\n${date}`],
  ['printf later', `printf '\\n%s' '${date}' >notes.md`, `\n${date}`],
  ['hash comparison', `echo '${date} #x' >notes.md`, `${date} #x\n`],
  ['hash', `echo '${date}'\\ #x >notes.md`, `${date} #x\n`],
] as const
let failures = 0
for (const [name, command, expected] of forms) {
  const dir = mkdtempSync('/tmp/date-check-parity-bash-')
  try {
    const bash = spawnSync('bash', ['--noprofile', '--norc', '-c', command], {
      cwd: dir, encoding: 'utf8', timeout: 10000,
      env: { PATH: '/usr/bin:/bin', LC_ALL: 'C.UTF-8' },
    })
    if (bash.status !== 0) throw new Error(bash.stderr || String(bash.error))
    const actual = readFileSync(`${dir}/notes.md`, 'utf8')
    if (actual !== expected) throw new Error(`${name}: Bash fixture differs: ${JSON.stringify(actual)}`)
    const predicted = shellWrites(command).filter(w => w.file === 'notes.md')
      .map(w => w.text + (w.joins ? '' : '\n')).join('')
    const matches = actual === predicted
    if (!matches) failures++
    console.log(`${matches ? 'PASS' : 'FAIL'} ${name}: Bash=${JSON.stringify(actual)}, parser=${JSON.stringify(predicted)}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

for (const raw of [`'a b'`, `"a"b`, `$'\\x32'027`, `"a\\$b"`, 'a\\\nb']) {
  const bash = spawnSync('bash', ['--noprofile', '--norc', '-c', `printf '%s\\0' ${raw}`], {
    encoding: 'utf8', timeout: 10000, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C.UTF-8' },
  })
  if (bash.status !== 0) throw new Error(bash.stderr || String(bash.error))
  const actual = bash.stdout.split('\0').slice(0, -1)
  const predicted = shellWords(raw).map(w => w.text)
  const matches = JSON.stringify(actual) === JSON.stringify(predicted)
  if (!matches) failures++
  console.log(`${matches ? 'PASS' : 'FAIL'} words ${JSON.stringify(raw)}: Bash=${JSON.stringify(actual)}, parser=${JSON.stringify(predicted)}`)
}
for (const run of ['false', 'true']) {
  const dir = mkdtempSync('/tmp/date-check-parity-flow-')
  try {
    const command = `echo '${date}' >notes.md; ${run} && echo ok >notes.md`
    const bash = spawnSync('bash', ['--noprofile', '--norc', '-c', command], {
      cwd: dir, encoding: 'utf8', timeout: 10000, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C.UTF-8' },
    })
    if (bash.status !== (run === 'false' ? 1 : 0)) throw new Error(bash.stderr || String(bash.error))
    const actual = readFileSync(`${dir}/notes.md`, 'utf8')
    const expected = run === 'false' ? `${date}\n` : 'ok\n'
    if (actual !== expected) throw new Error(`overwrite: Bash fixture differs: ${JSON.stringify(actual)}`)
    let predicted = ''
    for (const w of shellWrites(command).filter(w => w.file === 'notes.md'))
      predicted = (w.replaces && !(w.mayNotRun && predicted) ? '' : predicted) + w.text + (w.joins ? '' : '\n')
    // A skipped overwrite is read as maybe: both outcomes stay in the text, so Bash's must be among them.
    const matches = predicted.includes(actual.trimEnd())
    if (!matches) failures++
    console.log(`${matches ? 'PASS' : 'FAIL'} overwrite ${run}: Bash=${JSON.stringify(actual)}, parser=${JSON.stringify(predicted)}, Bash stamps=${stampsIn(actual).length}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
console.log(`Bash parity: ${12 - failures} pass, ${failures} fail`)
process.exitCode = failures ? 1 : 0
