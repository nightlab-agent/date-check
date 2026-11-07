import { refuses } from './shell-world'
import { manyWritesCost } from './work-cases'
import { checkWorkCases } from './work-world'
const date = '2027-01-15'
const F = '```'
const lines = (n: number) => Array.from({ length: n }, (_, i) => `echo a${i + 1} >>notes.md`).join('; ')
// W4: the window hole through a sed `s` that applies (not the `$a` form, which falls back to each text alone).
refuses('W4: a skipped fence, 15 plain lines, then a sed that turns the last line into the date',
  `false && echo '${F}' >>notes.md; ${lines(15)}; sed -i 's/^a15$/${date}/' notes.md`, { 'notes.md': 'ok\n' }, date)
refuses('W4 comparison: 14 plain lines, the sed turns a14 into the date',
  `false && echo '${F}' >>notes.md; ${lines(14)}; sed -i 's/^a14$/${date}/' notes.md`, { 'notes.md': 'ok\n' }, date)
checkWorkCases(manyWritesCost)
refuses('a sed past its reading allowance still reads the last text', `${Array.from({ length: 30 }, (_, i) => `sed -i 's/^x${i}$/y/' notes.md`).join('; ')}; sed -i 's/^ok$/${date}/' notes.md`, { 'notes.md': `ok\n${'z'.repeat(1024 * 1024)}\n` }, date)
