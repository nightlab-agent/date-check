import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { newStamps } from '../hooks/stamps'

// The judge and fill read a code fence the same way. Clock 2026-10-31 16:01 local.
type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]
const NOW = new Date(2026, 9, 31, 16, 1).getTime()
const world = (on: On) => {
  const calls: { content?: string }[] = []
  mock.clock(on, { now: NOW })
  on('fs.exists', () => ({ value: false }))
  on('tool.call', (_, e) => { calls.push(e as never); return { result: 'ok' } as never })
  return { calls }
}
const write = ($: $T, content: string) => $.tool.call({ tool: 'Write', file_path: 'n.md', content } as never) as Promise<{ deny?: string }>
const AFTER = '\n\n## 2027-01-15 Release\n'
const refuses = (name: string, content: string) =>
  test(name, async ($, on) => {
    world(on)
    expect((await write($, content)).deny).toContain('2027-')
  })
const passes = (name: string, content: string) =>
  test(name, async ($, on) => {
    world(on)
    expect((await write($, content)).deny).toBeUndefined()
  })

refuses('comparison: a heading after a line with inline `x`', '`x` is the form.' + AFTER)
refuses('comparison: a heading after a plain closed fence', '```\nx\n```' + AFTER)
refuses('a heading after a line that opens with inline ```x```', '```x``` is the form.' + AFTER)
refuses('a heading after a closed ``` fence that shows ~~~', '```\n~~~\n```' + AFTER)
refuses('a heading after a closed ~~~ fence that shows ```', '~~~\n```\n~~~' + AFTER)
passes('comparison: a sample in a plain fence is code', '```\n## 2027-02-02 sample\n```\n')
passes('comparison: a sample in a fence never closed is code', '```\n## 2027-02-02 sample\n')
passes('a sample after ~~~ inside a ``` fence is code', '```\n~~~\n## 2027-02-02 sample\n```\n')
passes('a sample in a ````md fence that shows ``` is code', '````md\n```\n## 2027-02-02 sample\n````\n')
passes('a closing mark with text after it does not close the fence', '```\n``` not a close\n## 2027-02-02 sample\n```\n')

// A fence inside a list item sits at the item's own text, up to three columns further.
const SAMPLE = '- 2027-01-15'
passes('comparison: a list-shaped date in a fence with no list', '```md\n' + SAMPLE + '\n```\n')
refuses('comparison: the same line under a list with no fence', '- Example:\n\n    ' + SAMPLE + '\n')
passes('a fence four spaces in under a list item', '- Example:\n\n    ```md\n    ' + SAMPLE + '\n    ```\n')
passes('a ~~~ fence four spaces in under a list item', '- Example:\n\n    ~~~\n    ' + SAMPLE + '\n    ~~~\n')
passes('a fence a tab in under a list item', '- Example:\n\n\t```md\n\t' + SAMPLE + '\n\t```\n')
passes('a fence under a numbered item', '10. Example:\n\n       ```md\n       ' + SAMPLE + '\n       ```\n')
passes('a fence on the line of the list marker', '- ```md\n  ' + SAMPLE + '\n  ```\n')
passes('a fence under an item of a nested list', '- a\n  - b\n\n      ```md\n      ' + SAMPLE + '\n      ```\n')
passes('a fence under the second item of a list', '- a\n- b\n\n    ```md\n    ' + SAMPLE + '\n    ```\n')
refuses('a heading after a closed fence in a list item', '- a\n\n    ```\n    x\n    ```' + AFTER)
refuses('a heading at the margin ends a fence left open in a list item', '- a\n\n    ```\n    x' + AFTER)
refuses('comparison: four spaces with no list is no fence', '    ```' + AFTER)
refuses('a list ended by text at the margin holds no fence', '- a\n\nText.\n\n    ```' + AFTER)
refuses('four columns past the list text is no fence', '- a\n\n      ```' + AFTER)
passes('a ``` four spaces in does not close a fence with no list', '```\n    ```\n## 2027-02-02 sample\n```\n')

// Fill on the same fences. The placeholder is built here so a live date-check does not fill this file.
const TIME = String.fromCodePoint(0x27e6) + 'TIME' + String.fromCodePoint(0x27e7)
test('comparison: fill keeps a placeholder in a ~~~ fence that shows ```', async ($, on) => {
  const w = world(on)
  await write($, `~~~\n\`\`\`\n${TIME}\n~~~\n`)
  expect(w.calls[0]!.content).toContain(TIME)
})
test('comparison: fill fills a placeholder after an inline ```x``` line', async ($, on) => {
  const w = world(on)
  await write($, `\`\`\`x\`\`\` is the form.\n${TIME}\n`)
  expect(w.calls[0]!.content).not.toContain(TIME)
})
test('fill keeps a placeholder in a fence under a list item', async ($, on) => {
  const w = world(on)
  await write($, `- Example:\n\n    \`\`\`\n    - ${TIME}\n    \`\`\`\n`)
  expect(w.calls[0]!.content).toContain(TIME)
})
test('a sample moved out of a fence that its list item ended is a new line', () => {
  const stamp = '  ## 2027-01-15 x\n'
  expect(newStamps('- a\n  ```\n' + stamp + 'End.\n', '- a\n' + stamp + 'End.\n')).toHaveLength(1)
})
