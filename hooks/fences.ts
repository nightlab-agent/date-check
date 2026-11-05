// Which lines of a text sit in a code fence, the one reading the judge and fill share. Pure.

/** The column `text` reaches past the white space that opens it, from column `from`: a tab runs to the next stop of four. */
const columnAfterSpace = (text: string, from: number) => {
  let column = from
  for (const c of /^[ \t]*/.exec(text)![0]) column = c === '\t' ? column + 4 - (column % 4) : column + 1
  return column
}

/**
 * Each line's place in a code fence. A fence opens with ``` or ~~~ up to three columns past the text
 * of the list item it is in, or past the margin with none (a ``` line with another ` on it is inline
 * code). It closes with a line of the same mark, as long or longer, with nothing after it, or where
 * a line left of the item's text ends the item. `code`: a fence's own lines and those between;
 * `closed`: the same, in a fence that closes. Two forms are not read as Markdown reads them, and both
 * leave the line judged: a line under a list item's text with no indent ends the item here, and a
 * fence in a `>` quote is no fence.
 */
export const fences = (lines: string[]) => {
  const out = lines.map(() => ({ code: false, closed: false }))
  let fence: { mark: string; from: number; margin: number } | undefined
  /** The column of the text of each list item the line is in, innermost last. */
  const items: number[] = []
  const close = (to: number) => {
    for (let k = fence!.from; k <= to; k++) out[k]!.closed = true
    fence = undefined
  }
  for (const [i, line] of lines.entries()) {
    let column = columnAfterSpace(line, 0)
    let rest = line.trimStart()
    if (fence !== undefined) {
      if (!rest || column >= fence.margin) {
        out[i]!.code = true
        const mark = /^(`{3,}|~{3,})/.exec(rest)?.[1]
        if (column - fence.margin < 4 && mark && mark[0] === fence.mark[0] && mark.length >= fence.mark.length && rest.trimEnd() === mark) close(i)
        continue
      }
      close(i - 1)
    }
    if (!rest) continue
    while (column < (items.at(-1) ?? 0)) items.pop()
    for (;;) {
      const marker = column - (items.at(-1) ?? 0) < 4 ? /^(?:[-*+]|\d{1,9}[.)])(?=\s|$)/.exec(rest)?.[0] : undefined
      if (!marker) break
      const after = rest.slice(marker.length)
      column = after.trim() ? columnAfterSpace(after, column + marker.length) : column + marker.length + 1
      items.push(column)
      rest = after.trimStart()
    }
    const margin = items.at(-1) ?? 0
    const mark = column - margin < 4 ? /^(`{3,}|~{3,})/.exec(rest)?.[1] : undefined
    if (mark && !(mark[0] === '`' && rest.slice(mark.length).includes('`'))) {
      out[i]!.code = true
      fence = { mark, from: i, margin }
    }
  }
  return out
}
