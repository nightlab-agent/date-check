import { passes, refuses } from './shell-world'
const date = '2027-01-15'
const F = '```'
// K1: a file whose last line has no line end. `echo '' >>` ends that line; a skipped fence; the date.
// Real bash (fence skipped): "x\n2027-01-15\n", the date opens a line. The ends map stores "x" under the
// no-fence key, so the date is judged only as "x2027-01-15" (joined) and inside the fence.
refuses('K1: no line end at the file end, echo "" ends it, a skipped fence, then the date',
  `echo '' >>notes.md; false && echo '${F}' >>notes.md; echo ${date} >>notes.md`, { 'notes.md': 'x' }, date)
refuses('K1 comparison: the file ends with a line end',
  `echo '' >>notes.md; false && echo '${F}' >>notes.md; echo ${date} >>notes.md`, { 'notes.md': 'x\n' }, date)
refuses('K1 comparison: no fence step at all',
  `echo '' >>notes.md; echo ${date} >>notes.md`, { 'notes.md': 'x' }, date)
refuses('K1 comparison: the fence step runs (the date is refused on the fence-less reading)',
  `echo '' >>notes.md; echo a >>notes.md; echo ${date} >>notes.md`, { 'notes.md': 'x' }, date)
// K1b: the same through a plain line, not an empty one: "notes" + "\n" ... no: a plain echo joins the last line.
refuses('K1b: a joined first line, then a line that ends it, a skipped fence, the date',
  `echo ' more' >>notes.md; echo '' >>notes.md; false && echo '${F}' >>notes.md; echo ${date} >>notes.md`, { 'notes.md': 'notes' }, date)
// S1 (pre-existing?): a fence close joined to a skipped no-line-end write. Real bash (printf skipped): "```\n```\n2027-01-15\n", the date is outside.
refuses('S1: a fence open, a skipped printf with no line end, a fence close, the date',
  `echo '${F}' >>notes.md; false && printf x >>notes.md; echo '${F}' >>notes.md; echo ${date} >>notes.md`, {}, date)
refuses('S1 comparison: the printf has a line end',
  `echo '${F}' >>notes.md; false && printf 'x\\n' >>notes.md; echo '${F}' >>notes.md; echo ${date} >>notes.md`, {}, date)
