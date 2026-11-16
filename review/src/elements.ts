/// <reference lib="dom" />
export interface TaggedCapture {
  scenario: string
  elements: { tag: string; source: string; name?: string }[]
}

export const parseSource = (value: string) => {
  const match = /^(.+):(\d+):(\d+)$/.exec(value)
  if (!match || /^(\/|[A-Za-z]:)|\\|[\r\n]/.test(match[1]!) || match[1]!.split('/').includes('..')) return undefined
  const line = Number(match[2]), column = Number(match[3])
  return Number.isSafeInteger(line) && line > 0 && Number.isSafeInteger(column) && column > 0 ? { file: match[1]!, line, column } : undefined
}

export const elements = (captures: TaggedCapture[], file: string, lines?: readonly [number, number]) => captures.flatMap(capture => capture.elements.flatMap(element => {
  const source = parseSource(element.source)
  return source?.file === file && (!lines || source.line >= lines[0] && source.line <= lines[1]) ? [{ scenario: capture.scenario, ...element, source }] : []
}))

export const diffRanges = (diff: string): { file: string; from: number; to: number }[] => {
  let file: string | undefined
  const ranges = []
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) file = line.startsWith('+++ b/') ? line.slice(6) : undefined
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (file && hunk && Number(hunk[2] ?? 1) > 0) ranges.push({ file, from: Number(hunk[1]), to: Number(hunk[1]) + Number(hunk[2] ?? 1) - 1 })
  }
  return ranges
}

export const taggedCapture = async (page: { evaluate<T>(fn: () => T): Promise<T> }, scenario: string): Promise<TaggedCapture> => ({
  scenario,
  elements: await page.evaluate(() => Array.from(document.querySelectorAll('[data-civic-source]'), element => ({ tag: element.tagName.toLowerCase(), source: element.getAttribute('data-civic-source')!, name: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 300) }))),
})
