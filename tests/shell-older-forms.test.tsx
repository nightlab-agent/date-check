import { expect, test } from 'claude-code/testing'
import { fillNow } from '../hooks/stamps'

test('a mixed fence mark leaves a sample placeholder alone', () => {
  const token = String.fromCodePoint(0x27e6) + 'TIME' + String.fromCodePoint(0x27e7)
  const sample = '```\n```~\n' + token + '\n```\n'
  expect(fillNow(sample, 0).text).toBe(sample)
})
test('comparison: a matching fence mark leaves a sample placeholder alone', () => {
  const token = String.fromCodePoint(0x27e6) + 'TIME' + String.fromCodePoint(0x27e7)
  const sample = '```\n' + token + '\n```\n'
  expect(fillNow(sample, 0).text).toBe(sample)
})
