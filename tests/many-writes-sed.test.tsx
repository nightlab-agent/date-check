import { refuses } from './shell-world'
const date = '2027-01-15'
const F = '```'
const lines = (n: number) => Array.from({ length: n }, (_, i) => `echo a${i + 1} >>notes.md`).join('; ')
// W4: a sed `s` that turns a line this command wrote after a skipped fence into the date. Real bash: ok, a1..a3, date, no fence.
refuses('W4: a skipped fence, 3 plain lines, then a sed that turns the last line into the date',
  `false && echo '${F}' >>notes.md; ${lines(3)}; sed -i 's/^a3$/${date}/' notes.md`, { 'notes.md': 'ok\n' }, date)
refuses('W4 comparison: no fence step, 3 plain lines, the sed turns a3 into the date',
  `${lines(3)}; sed -i 's/^a3$/${date}/' notes.md`, { 'notes.md': 'ok\n' }, date)
refuses('W4 comparison: a skipped plain line instead of the fence',
  `false && echo x >>notes.md; ${lines(3)}; sed -i 's/^a3$/${date}/' notes.md`, { 'notes.md': 'ok\n' }, date)
refuses('W4 comparison: the sed turns a line the file already had into the date (form J shape)',
  `false && echo '${F}' >>notes.md; ${lines(3)}; sed -i 's/^ok$/${date}/' notes.md`, { 'notes.md': 'ok\n' }, date)
