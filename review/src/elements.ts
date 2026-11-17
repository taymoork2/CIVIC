/// <reference lib="dom" />
import { readElementSource, type ElementSource } from '../../packages/canvas/src/element-source.mjs'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { relative, resolve, sep, isAbsolute } from 'node:path'

export function elementQuery(root: string, file: string) {
  if (file.split(/[\\/]/).some(part => part === '..' || part === 'node_modules')) throw new Error('Element file must not contain .. or node_modules.')
  const inside = (path: string) => { const name = relative(realpathSync(root), path); return !isAbsolute(name) && name !== '..' && !name.startsWith(`..${sep}`) && !name.split(sep).includes('node_modules') }
  const path = resolve(root, file)
  if (!inside(path)) throw new Error('Element file must be inside the project checkout.')
  if (!existsSync(path)) throw new Error(`Element file does not exist: ${file}`)
  if (!inside(realpathSync(path))) throw new Error('Element file must be inside the project checkout and outside node_modules.')
  if (!statSync(path).isFile()) throw new Error(`Element path is not a file: ${file}`)
  return relative(realpathSync(root), realpathSync(path)).split(sep).join('/')
}
export interface TaggedCapture {
  scenario: string
  elements: ({ tag: string; source: string; name?: string } & ElementSource)[]
}

export const parseSource = (value: string) => {
  const match = /^(.+):(\d+):(\d+)$/.exec(value)
  if (!match || /^(\/|[A-Za-z]:)|\\|[\r\n]/.test(match[1]!) || match[1]!.split('/').some(part => part === '..' || part === 'node_modules')) return undefined
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

function collectTaggedElements(read: typeof readElementSource, root?: string) {
  return Array.from(document.querySelectorAll('*')).flatMap(element => {
    const evidence = read(element, { root })
    return evidence.location || evidence.component ? [{ ...evidence, tag: element.tagName.toLowerCase(), source: evidence.location ?? '', name: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 300) }] : []
  })
}

export const taggedCapture = async (page: { evaluate<T>(fn: string): Promise<T> }, scenario: string, root?: string): Promise<TaggedCapture> => ({
  scenario,
  elements: await page.evaluate(`(${collectTaggedElements.toString()})(${readElementSource.toString()}, ${JSON.stringify(root)})`),
})
