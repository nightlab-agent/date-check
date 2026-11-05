// @ts-nocheck: Bun oracle, outside the plugin's declarations, which have no Node built-ins.
// Run from the repo root: bun tests/review-final-sed-bash.ts
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const check = (name: string, before: string, command: string, expected: string) => {
  const dir = mkdtempSync('/tmp/date-check-final-sed-')
  try {
    writeFileSync(`${dir}/notes.md`, before)
    const result = spawnSync('bash', ['--noprofile', '--norc', '-c', command], {
      cwd: dir, encoding: 'utf8', timeout: 10000,
      env: { PATH: '/usr/bin:/bin', LC_ALL: 'C.UTF-8' },
    })
    assert.equal(result.status, 0, result.stderr || result.error?.message)
    const actual = readFileSync(`${dir}/notes.md`, 'utf8')
    assert.equal(actual, expected, name)
    console.log(`PASS ${name}: ${JSON.stringify(actual)}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

check('R1', '```\n', "sed -i '$a ```' notes.md; echo 2027-01-15 >>notes.md", '```\n```\n2027-01-15\n')
check('R1 comparison', '```\n```\n', "sed -i '$a ok' notes.md; echo 2027-01-15 >>notes.md", '```\n```\nok\n2027-01-15\n')
check('R2', '2027-01-15\n', "sed -i '$a 2027-01-15' notes.md", '2027-01-15\n2027-01-15\n')
check('R2 comparison', 'ok\n', "sed -i '$a 2027-01-15' notes.md", 'ok\n2027-01-15\n')
check('R3', 'YEAR-01-15\n', "sed -i '1,1s/^/Planned for /' notes.md; sed -i 's/YEAR/2027/' notes.md", 'Planned for 2027-01-15\n')
check('R3 comparison', 'YEAR-01-15\n', "sed -i 's/^/Planned for /;s/YEAR/2027/' notes.md", 'Planned for 2027-01-15\n')
