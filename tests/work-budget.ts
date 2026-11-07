// @ts-nocheck: run by Bun, outside the plugin's types, which have no Node built-ins.
// The plugin realm freezes built-in prototypes. This standalone check invokes the
// same register function with an in-memory filesystem, and counts its line scans.
import { strict as assert } from 'node:assert'
import { register } from '../hooks/register'
import { stampReader, newStamps } from '../hooks/stamps'
import { workCases } from './work-cases'

const count = async (run: () => unknown) => {
  const split = String.prototype.split
  const replace = String.prototype.replace
  let units = 0, replaced = 0
  String.prototype.split = new Proxy(split, {
    apply(target, text, args) { units += text.length; return Reflect.apply(target, text, args) },
  })
  String.prototype.replace = new Proxy(replace, {
    apply(target, text, args) { replaced += text.length; return Reflect.apply(target, text, args) },
  })
  try { return { result: await run(), get units() { return units }, get replaced() { return replaced } } }
  finally { String.prototype.split = split; String.prototype.replace = replace }
}

const before = '- ordinary note\n'.repeat(65000)
const reader = await count(() => {
  const read = stampReader(before)
  assert.deepEqual(read(`${before}2027-01-15\n`).map(s => s.text), ['2027-01-15'])
  assert.deepEqual(read(`${before}plain text\n`), [])
})
assert(reader.units < before.length + 100, `append reader: ${reader.units} characters split; expected one scan`)
const oldText = `2027-01-15\n${before}`
const diff = await count(() => {
  const read = stampReader(oldText)
  assert.deepEqual(read(`2027-01-15\na new note\n${before}`), [])
})
assert(diff.units < 2 * oldText.length + 100, `changed reader: ${diff.units} characters split; expected two scans`)
const changed = '2027-01-15\nordinary note\n'
assert.deepEqual(stampReader('YEAR-01-15\nordinary note\n')(changed), newStamps('YEAR-01-15\nordinary note\n', changed))

for (const c of workCases) {
  // Check outside the hook: its failure recovery must not swallow a bad fixture.
  for (const text of Object.values(c.files))
    assert(new TextEncoder().encode(text).length <= 4 * 1024 * 1024, `${c.name}: fixture exceeds engine read limit`)
  let hook
  register((event, fn) => { if (event === 'tool.call') hook = fn }, { promptClock: false })
  let reads = 0, passed = false
  const $ = {
    clock: { now: async () => new Date(2026, 9, 31, 16, 1).getTime() },
    session: { cwd: async () => '/project' },
    fs: {
      exists: async path => Object.hasOwn(c.files, path),
      read: async path => {
        reads++
        const text = c.files[path]
        return text
      },
    },
  }
  const work = await count(() => hook($, { tool: 'Bash', command: c.command }, async () => { passed = true; return { result: 'ok' } }))
  const bytes = Object.values(c.files).reduce((sum, text) => sum + text.length, 0)
  const limit = c.scans * bytes + 1024 * 1024
  console.log(`${c.name}: split=${work.units}/${limit}, replace=${work.replaced}, reads=${reads}`)
  assert.equal(reads, Object.keys(c.files).length, `${c.name}: file reads`)
  assert(work.units < limit, `${c.name}: too much text split into lines`)
  assert(work.replaced < 400 * 1024 * 1024, `${c.name}: too much sed replacement work`)
  if (c.deny) assert(work.result.deny?.includes(c.deny), `${c.name}: expected refusal`)
  else { assert.equal(work.result.deny, undefined, c.name); assert(passed, `${c.name}: tool never ran`) }
}
console.log(`work budget: reader and ${workCases.length} registered-hook cases passed`)
