import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { judge, LIMITS, stampsIn } from '../hooks/stamps'

// A dated range (`2026-10-31 10:00-11:30`) has the shape of a time with a UTC offset.
// Clock 2026-10-31 16:01 local through the hook; below it, a fixed New York clock.
type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]
const NOW = new Date(2026, 9, 31, 16, 1).getTime()
const world = (on: On) => {
  mock.clock(on, { now: NOW })
  on('fs.exists', () => ({ value: false }))
  on('tool.call', () => ({ result: 'ok' }) as never)
}
const write = ($: $T, content: string) => $.tool.call({ tool: 'Write', file_path: 'log.md', content } as never) as Promise<{ deny?: string }>
const passes = (name: string, line: string) =>
  test(name, async ($, on) => {
    world(on)
    expect((await write($, `${line}\n`)).deny).toBeUndefined()
  })
const refuses = (name: string, line: string) =>
  test(name, async ($, on) => {
    world(on)
    expect((await write($, `${line}\n`)).deny).toContain('in the future')
  })

passes('comparison: spaces around the dash', '- 2026-10-31 15:00 - 16:30 standup')
passes('a past range is not in the future', '- 2026-10-31 10:00-11:30 standup')
passes('a past range with whole hours', '- 2026-10-31 12:00-13:00 lunch')
passes('a past range in a heading', '## 2026-10-31 10:00-11:30 standup')
passes('a past range in a field', 'Date: 2026-10-31 10:00-11:30')
refuses('comparison: a range on a later day is in the future', '- 2026-12-25 10:00-11:30 party')
refuses('comparison: a range later today is in the future', '- 2026-10-31 18:30-19:30 review')

// 2026-10-31 16:01 in New York, whatever zone the tests run in.
const CLOCK = Date.UTC(2026, 9, 31, 20, 1)
const newYork = () => -240
const verdicts = (line: string) => judge(stampsIn(line), CLOCK, LIMITS, newYork).map(v => v.kind)

test('both readings of a range are judged: past as a range, ahead as an offset, so not called wrong', () => {
  expect(verdicts('- 2026-10-31 10:00-11:30 standup')).toEqual([])
})
test('comparison: a time written with T keeps its offset', () => {
  expect(stampsIn('- 2026-10-31T10:00-11:30 x')[0]!.offset).toBe(-690)
  expect(verdicts('- 2026-10-31T10:00-11:30 x')).toEqual(['future'])
})
test('comparison: a time with seconds keeps its offset', () => {
  expect(verdicts('- 2026-10-31 10:00:00-11:30 x')).toEqual(['future'])
})
test('comparison: an end before the start cannot be a range, so it is an offset', () => {
  expect(verdicts('- 2026-10-31 20:00-04:00 x')).toEqual(['future'])
})
test('comparison: a plus sign is an offset', () => {
  expect(stampsIn('- 2026-10-31 10:00+11:30 x')[0]!.offset).toBe(690)
})
