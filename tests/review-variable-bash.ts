// @ts-nocheck: Bun oracle, outside the plugin's declarations, which have no Node built-ins.
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'

const L = '- 2026-10-31 18:30 deploy'

const check = (name: string, command: string, expected: Record<string, string>, files: Record<string, string> = {}) => {
  const dir = mkdtempSync('/tmp/date-check-variable-')
  try {
    for (const [file, text] of Object.entries(files)) writeFileSync(`${dir}/${file}`, text)
    const result = spawnSync('bash', ['--noprofile', '--norc', '-c', command], {
      cwd: dir, encoding: 'utf8', timeout: 10000,
      env: { PATH: '/usr/bin:/bin', LC_ALL: 'C.UTF-8' },
    })
    assert.equal(result.status, 0, result.stderr || result.error?.message)
    const actual = Object.fromEntries(readdirSync(dir).sort().map(file => [file, readFileSync(`${dir}/${file}`, 'utf8')]))
    assert.deepEqual(actual, expected, name)
    console.log(`PASS ${name}: ${JSON.stringify(actual)}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

check('loop iterator', `f=n.md; for f in app.py; do :; done; echo "${L}" >> "$f"`, { 'app.py': `${L}\n` })
check('loop assignment', `f=app.py; for i in 1; do f=n.md; done; echo "${L}" >> "$f"`, { 'n.md': `${L}\n` })
check('subshell', `f=n.md; (:; f=app.py; :); echo "${L}" >> "$f"`, { 'n.md': `${L}\n` })
check('one if branch', `f=app.py; if true; then f=n.md; fi; echo "${L}" >> "$f"`, { 'n.md': `${L}\n` })
check('unset in then', `f=.md; if true; then unset f; fi; echo "${L}" >> "app$f"`, { app: `${L}\n` })
check('top-level unset', `f=.md; unset f; echo "${L}" >> "app$f"`, { app: `${L}\n` })
check('two names', `f=n.md; g=n.md; echo "${L}" >> "$f"; echo "${L}" >> "$g"`, { 'n.md': `${L}\n${L}\n` })
check('quoted glob', `f='*.md'; sed -i 's/TBD/2027-01-15/' "$f"`, { '*.md': 'planned for 2027-01-15.\n' }, { '*.md': 'planned for TBD.\n' })
check('unquoted glob', `f='*.md'; sed -i 's/TBD/2027-01-15/' $f`, { 'n.md': 'ok\n' }, { 'n.md': 'ok\n' })
check('skipped reassignment', `f=app.py; false && f=n.md; echo "${L}" >> "$f"`, { 'app.py': `${L}\n` })
check('skipped reassignment chain', `f=app.py; false && f=n.md && f=other.md; echo "${L}" >> "$f"`, { 'app.py': `${L}\n` })
check('skipped reassignment after newline', `f=app.py; false &&\nf=n.md; echo "${L}" >> "$f"`, { 'app.py': `${L}\n` })
check('nested loop iterator', `f=n.md; for i in 1; do for f in app.py; do :; done; done; echo "${L}" >> "$f"`, { 'app.py': `${L}\n` })
check('background assignment', `f=app.py; f=n.md & wait; echo "${L}" >> "$f"`, { 'app.py': `${L}\n` })
check('two names join a stamp', `f=n.md; g=./n.md; printf '%s' '- 2026-' >> "$f"; printf '%s\\n' '10-31 18:30 deploy' >> "$g"`, { 'n.md': `${L}\n` })
check('future stamp through an unquoted glob', `f='*.md'; echo "${L}" >> $f`, { 'n.md': `${L}\n` }, { 'n.md': '' })
console.log('Variable Bash parity: 16 file sets matched')
