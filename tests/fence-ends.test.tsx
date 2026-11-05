import { expect, test } from 'claude-code/testing'
import { endKey, fences, fencesFrom } from '../hooks/fences'
import { newStamps, stampReader } from '../hooks/stamps'

const texts: [string, string][] = [
  ['plain\n', 'more\n2026-10-31 note\n'],
  ['```\nopen\n', 'inside 2026-10-31\n'],
  ['```\nopen\n', '```\n2026-10-31 after\n'],
  ['- item\n  ```\n  code\n', '  2026-10-31 in\nout 2026-10-30\n'],
  ['1. one\n   - two\n', '     ~~~\n     2026-10-31\n     ~~~\n     2026-10-30\n'],
  ['', '2026-10-31 first\n'],
  ['a\r\n```\r\n', '2026-10-31\r\n```\r\n2026-10-30\r\n'],
  ['    indented\n', '    2026-10-31\n2026-10-30\n'],
]

for (const [i, [before, added]] of texts.entries()) {
  test(`reading on from an end marks the same code as reading the whole, ${i}`, () => {
    const whole = fences(`${before}${added}`.split(/\r?\n/))
    const first = before.split(/\r?\n/)
    const on = fencesFrom(added.split(/\r?\n/), fencesFrom(first).end).lines
    expect(on.map(l => l.code)).toEqual(whole.slice(first.length - 1).map(l => l.code))
  })
  test(`a reader finds what newStamps finds in a text that only adds lines, ${i}`, () => {
    const after = `${before}${added}`
    expect(stampReader(before)(after).map(s => s.text)).toEqual(newStamps(before, after).map(s => s.text))
  })
}

test('a text that changes the old lines is read whole', () => {
  const before = 'old 2026-10-30\n'
  const after = 'new 2026-10-31\nold 2026-10-30\n'
  expect(stampReader(before)(after).map(s => s.text)).toEqual(newStamps(before, after).map(s => s.text))
})

test('a before with no line end is read whole', () => {
  expect(stampReader('no end')('no end 2026-10-31\n').map(s => s.text)).toEqual(newStamps('no end', 'no end 2026-10-31\n').map(s => s.text))
})

test('ends alike give one key, open and closed two', () => {
  expect(endKey(fencesFrom(['a', 'b']).end)).toBe(endKey(fencesFrom(['c']).end))
  expect(endKey(fencesFrom(['```']).end)).not.toBe(endKey(fencesFrom(['c']).end))
})
