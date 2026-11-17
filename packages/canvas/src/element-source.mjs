/** Self-contained so browser captures and the standalone overlay use the same reader. */
export function readElementSource(element, build = {}) {
  function relativeFile(value) {
    if (typeof value !== 'string' || /[\\\r\n\0?#]/u.test(value)) return
    let file = value
    if (/^(?:\/|[A-Za-z]:)/u.test(file)) {
      // The overlay never learns the checkout root; its server makes absolute paths relative.
      if (build.absolute) return file.split('/').some(part => part === '..' || part === 'node_modules') ? undefined : file
      const root = build.root?.replace(/\/$/u, '')
      if (!root || !file.startsWith(root + '/')) return
      file = file.slice(root.length + 1)
    }
    const parts = file.split('/')
    if (parts.some(part => !part || part === '..' || part === 'node_modules' || part.includes(':'))) return
    return parts.filter(part => part !== '.').join('/') || undefined
  }
  function normalize(value, via) {
    let file, line, column
    if (via === 'svelte-inspector') {
      if (!value || typeof value !== 'object') return
      ;({ file, line, column } = value)
      if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column)) return
      line += 1; column += 1
    } else {
      const match = typeof value === 'string' && /^(?<file>.+):(?<line>\d+):(?<column>\d+)$/u.exec(value)
      if (!match) return
      file = match.groups.file; line = Number(match.groups.line); column = Number(match.groups.column)
      // Solid's JSX locator stores Babel's zero-based column plus two.
      if (via === 'solid-locator') column -= 1
    }
    file = relativeFile(file)
    if (!file || !Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(column) || column < 1) return
    return { file, line, column, via }
  }
  function own(node) {
    const readers = [
      ['civic', () => node.dataset?.civicSource],
      ['vue-inspector', () => node.dataset?.vInspector],
      ['svelte-inspector', () => node.__svelte_meta?.loc],
      ['solid-locator', () => node.dataset?.sourceLoc],
    ]
    for (const [via, read] of readers) {
      try { const source = normalize(read(), via); if (source) return source } catch {
        // Dev metadata can be unavailable.
      }
    }
  }
  let source, component
  for (let node = element; node; node = node.parentElement) {
    if (!source) {
      const location = own(node)
      if (location) source = { ...location, match: node === element ? 'exact' : 'ancestor' }
    }
    if (!component) {
      try { component = node.ownerDocument?.defaultView?.ng?.getComponent?.(node)?.constructor?.name } catch {
        // Angular debug API is optional.
      }
    }
    if (source && component) break
  }
  const evidence = source ? { location: `${source.file}:${source.line}:${source.column}`, ...source } : {}
  if (component) evidence.component = component
  return evidence
}
