import path from 'node:path'
import { parseSync } from 'vite'

/** A plain JSX module id inside the project's sources. */
export const taggable = (id, project) => /\.[jt]sx$/u.test(id) && project.sources.some(root => id === root || id.startsWith(root + '/'))

export const tagSources = (input, id, project) => {
  const file = id.split('?')[0]
  if (!taggable(file, project)) return input
  return tagHostElements(input, file, project).code
}

/** Tag original JSX before lowering; no bundler context is required. */
export const tagHostElements = (input, file, { root }) => {
  let code = input
  const relative = path.relative(root, file)
  if (!/\.[jt]sx$/u.test(file) || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || relative.split(path.sep).includes('node_modules')) return { code, map: null }
  const ast = parseSync(file, code)
  if (ast.errors.length) throw Error(`Cannot tag source: ${file}`)
  const edits = []
  const visit = node => {
    if (!node || Object(node) !== node) return
    if (node.type === 'JSXOpeningElement' && node.name.type === 'JSXIdentifier' && /^[a-z]/u.test(node.name.name)) {
      const before = code.slice(0, node.start)
      const line = before.split('\n').length
      const column = node.start - before.lastIndexOf('\n')
      edits.push([node.end - (node.selfClosing ? 2 : 1), ` data-civic-source={${JSON.stringify(`${relative}:${line}:${column}`)}}`])
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const item of value) visit(item) }
      else visit(value)
    }
  }
  visit(ast.program)
  for (const [offset, text] of edits.toSorted((a, b) => b[0] - a[0])) code = code.slice(0, offset) + text + code.slice(offset)
  // shortcut: text edits have no composable map; add one when a declared map editor is available.
  return { code, map: null }
}
