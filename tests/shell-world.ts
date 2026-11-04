import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// The world the shell-command test files share. Clock 2026-10-31 16:01 local; 18:30 that day is in the future.
export type On = Parameters<TestBody>[1]
export type $T = Parameters<TestBody>[0]
export const NOW = new Date(2026, 9, 31, 16, 1).getTime()
export const L = '- 2026-10-31 18:30 deploy'
export const world = (on: On, files: Record<string, string> = {}) => {
  const fs = new Map(Object.entries(files))
  mock.clock(on, { now: NOW })
  const at = (p: string) => (fs.has(p) ? p : p.split(/[/\\]/).pop()!)
  on('fs.exists', (_, e) => ({ value: fs.has(at(e.path)) }))
  on('fs.read', (_, e) => {
    const t = fs.get(at(e.path))
    if (t === undefined) throw new Error('ENOENT')
    return { value: t }
  })
  on('tool.call', () => ({ result: 'ok' }) as never)
}
export const bash = ($: $T, command: string) => $.tool.call({ tool: 'Bash', command } as never) as Promise<{ deny?: string }>
export const write = ($: $T, file_path: string, content: string) => $.tool.call({ tool: 'Write', file_path, content } as never) as Promise<{ deny?: string; context?: string[] }>
export const refuses = (name: string, command: string, files: Record<string, string> = {}, what = '2026') =>
  test(name, async ($, on) => {
    world(on, files)
    expect((await bash($, command)).deny ?? '').toContain(what)
  })
export const passes = (name: string, command: string, files: Record<string, string> = {}) =>
  test(name, async ($, on) => {
    world(on, files)
    expect((await bash($, command)).deny).toBeUndefined()
  })
