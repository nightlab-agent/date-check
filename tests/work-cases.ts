// Shared by the engine's behavior tests and the standalone work counter.
export const big = (n = 65000, nl = true) => Array.from({ length: n }, (_, i) => `- note ${i} about something that happened, fifty characters`).join('\n') + (nl ? '\n' : '')
export const times = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join('; ')
export const C = 'CHANGELOG.md'
export const F = '```'
export const e = (s: string) => `echo '${s}' >>${C}`
export const appends = (n: number) => times(n, i => e(`- item ${i}`))
export const seds = (n: number) => times(n, i => `sed -i 's/note ${i} /item ${i} /' ${C}`)
const lines = (n: number) => times(n, i => `echo a${i + 1} >>notes.md`)
const printfs = (n: number) => times(n, () => `printf x >>${C}`)
const file = big()
const sed = `sed -i 's/note 5 /item 5 /' ${C}`
const files = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`f${i}.md`, file]))
export type WorkCase = { name: string; files: Record<string, string>; command: string; scans: number; deny?: string }
const onFile = (name: string, text: string, command: string, scans: number, deny?: string): WorkCase => ({ name, files: { [C]: text }, command, scans, deny })

// scans bounds characters split into lines, in multiples of the input size.
// A fixed allowance in work-budget.ts covers commands and appended text.
export const longFile: WorkCase[] = [
  onFile('a sed, a fence pair and 20 appends', file, `${sed}; ${e(F)}; ${e('code')}; ${e(F)}; ${appends(20)}`, 12),
  onFile('a sed then 40 nested list appends', file, `${sed}; ${times(40, i => e(`${' '.repeat((i % 4) * 2)}- item ${i}`))}`, 12),
  onFile('a hundred seds', file, seds(100), 42),
  onFile('a fence step then 100 seds', file, `false && ${e(F)}; ${seds(100)}`, 72),
  onFile('a plain append then 100 seds', file, `${e('x')}; ${seds(100)}`, 72),
  onFile('180 seds', file, seds(180), 42),
  { name: '33 seds on each of six files', files, command: Object.keys(files).map(f => times(33, i => `sed -i 's/note ${i} /item ${i} /' ${f}`)).join('; '), scans: 9 },
  onFile('33 seds of 40 scripts each', file, times(33, () => `sed -i ${Array.from({ length: 40 }, (_, i) => `-e 's/note ${i} /item ${i} /'`).join(' ')} ${C}`), 4),
]
export const manyWrites: WorkCase[] = [
  onFile('20 appends to 40,000 lines', big(40000), appends(20), 2),
  onFile('1 append to 40,000 lines', big(40000), appends(1), 2),
  onFile('20 appends to 65,000 lines', file, appends(20), 2),
  { name: '500 appends to a new file', files: {}, command: lines(500), scans: 0 },
  { name: '50 appends to a new file', files: {}, command: lines(50), scans: 0 },
]
const fenced = `${e(F)}; ${e('code')}; ${e(F)}; ${appends(20)}`
export const noEnd: WorkCase[] = [
  onFile('fences then 20 appends without a trailing newline', big(65000, false), fenced, 2),
  onFile('fences then 20 appends with a trailing newline', file, fenced, 2),
  onFile('80 appends without line ends', big(65000, false), printfs(80), 2),
  onFile('80 appends, an echo between each ten', big(65000, false), times(8, () => `${printfs(10)}; ${e('x')}`), 2),
]
export const manyWritesCost: WorkCase[] = [
  ...([[2000, 10], [4000, 20], [10000, 10], [10000, 30]] as const).map(([n, count]) => onFile(`${count} appends to ${n} lines`, big(n), appends(count), 2)),
  onFile('20 seds on 40,000 lines', big(40000), seds(20), 65),
  onFile('a fence among 20 appends', big(40000), `${appends(10)}; false && ${e(F)}; ${appends(10)}; ${e('2027-01-15')}`, 2, '2027-01-15'),
]
const scripts = (n: number) => Array.from({ length: n }, (_, i) => `s/note ${i} /item ${i} /`).join(';')
export const sedCost: WorkCase[] = [
  onFile('33 seds of one script holding 40 commands', file, times(33, () => `sed -i '${scripts(40)}' ${C}`), 4),
  onFile('41 commands just inside the sed limit', `TBD\n${file.slice(0, 2_900_000)}\n`, `sed -i '${scripts(40)};s/^TBD$/2027-01-15/' ${C}`, 6, '2027-01-15'),
]
const smaller = big(19000)
export const sedLarge: WorkCase[] = [
  onFile('eight appends then one sed inside the limit', smaller, `${times(8, i => `echo a${i} >>${C}`)}; sed -i '${scripts(110)}' ${C}`, 10),
  onFile('comparison: the same sed alone', smaller, `sed -i '${scripts(110)}' ${C}`, 6),
]
export const workCases = [...longFile, ...manyWrites, ...noEnd, ...manyWritesCost, ...sedCost, ...sedLarge]
