// @ts-nocheck: run by bun, outside the plugin's types, which have no Node built-ins.
// Standalone oracle: the plugin test loader permits no Node built-in imports.
// Run from the repo root: bun tests/review-second-bash.ts
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { characters, forms, prefix } from './review-second-forms'

const check = (name: string, command: string, text: string, file = 'notes.md') => {
  const dir = mkdtempSync('/tmp/date-check-second-review-')
  try {
    const result = spawnSync('bash', ['--noprofile', '--norc', '-c', command], {
      cwd: dir, encoding: 'utf8', timeout: 10000,
      env: { PATH: '/usr/bin:/bin', LC_ALL: 'C.UTF-8' },
    })
    assert.equal(result.status, 0, result.stderr || result.error?.message)
    const actual = readFileSync(`${dir}/${file}`, 'utf8')
    assert.equal(actual, text, name)
    console.log(`PASS ${name}: ${JSON.stringify(actual)}`)
    if (result.stderr) console.log(`  stderr: ${result.stderr.trim()}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

for (const [name, command, text, , file] of forms) check(name, command, text, file)
for (const character of characters) {
  const line = `${prefix}${character} tail`
  check(`whole character ${character}`, `printf '%s\\n' '${line}' >notes.md`, `${line}\n`)
}
console.log(`Bash parity: ${forms.length + characters.length} file contents matched`)
