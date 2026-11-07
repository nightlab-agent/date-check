import { refuses } from './shell-world'
import { manyWrites } from './work-cases'
import { checkWorkCases } from './work-world'

// Each write is judged on every text an earlier step could have left, however long the command, and
// a long file costs one reading (the hook's own code runs under HookBudget.ms = 10_000).
const date = '2027-01-15'
const F = '```'
const lines = (n: number) => Array.from({ length: n }, (_, i) => `echo a${i + 1} >>notes.md`).join('; ')

// Real bash (a shell run): the file holds a1..a15 and the date, no fence anywhere.
refuses('W1: a fence under a failed gate, 15 plain lines, then the date: the date is judged',
  `false && echo '${F}' >>notes.md; ${lines(15)}; echo ${date} >>notes.md`, {}, date)
refuses('W1 comparison: the same with 14 plain lines between',
  `false && echo '${F}' >>notes.md; ${lines(14)}; echo ${date} >>notes.md`, {}, date)
refuses('W1 comparison: 15 plain lines, no fence step at all',
  `${lines(15)}; echo ${date} >>notes.md`, {}, date)
refuses('W2: the same hole under if, with a heredoc fence',
  `if false; then cat <<EOF >>notes.md\n${F}\nEOF\nfi; ${lines(15)}; echo ${date} >>notes.md`, {}, date)
refuses('W3: the same hole with a sed appending the date at the end',
  `false && echo '${F}' >>notes.md; ${lines(15)}; sed -i '$a ${date}' notes.md`, { 'notes.md': 'ok\n' }, date)
refuses('W3 comparison: 14 plain lines, then the sed',
  `false && echo '${F}' >>notes.md; ${lines(14)}; sed -i '$a ${date}' notes.md`, { 'notes.md': 'ok\n' }, date)

checkWorkCases(manyWrites)
