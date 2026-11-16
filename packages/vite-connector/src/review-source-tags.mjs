import path from 'node:path'
import { parseSync } from 'vite'

/** A plain JSX module id inside the project's sources. */
export const taggable = (id, project) => /\.[jt]sx$/u.test(id) && project.sources.some(root => id === root || id.startsWith(root + '/'))

export const tagSources = (input, id, project) => {
  let code = input
  const file = id.split('?')[0]
  if (!taggable(file, project)) return code
  const relative = path.relative(project.root, file)
  if (relative.startsWith('../')) return code
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
  return code
}
