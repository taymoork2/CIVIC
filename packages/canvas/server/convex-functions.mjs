import nodePath from 'node:path'
import { parseSync } from 'vite'

const { dirname, posix } = nodePath

function imports(body, file) {
  const factories = new Map(), routers = new Set()
  let module
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') continue
    const source = node.source.value
    if (/^(?:\.\.?\/)+_generated\/server(?:\.[cm]?[jt]s)?$/u.test(source)) {
      const root = posix.dirname(posix.dirname(posix.resolve('/', dirname(file), source)))
      module = posix.relative(root, '/' + file).replace(/\.[cm]?[jt]sx?$/u, '')
      for (const spec of node.specifiers) if (spec.type === 'ImportSpecifier' && /^(?:query|mutation|action|internalQuery|internalMutation|internalAction|httpAction)$/u.test(spec.imported.name)) factories.set(spec.local.name, spec.imported.name)
    }
    if (source === 'convex/server') for (const spec of node.specifiers) if (spec.imported?.name === 'httpRouter') routers.add(spec.local.name)
  }
  return { factories, routers, module }
}

function walk(node, visit) {
  if (!node?.type) return
  visit(node)
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) { for (const child of value) walk(child, visit) }
    else walk(value, visit)
  }
}

function bindings(body, factories, routers) {
  const instances = new Set(), functions = new Map()
  for (const node of body) {
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
    if (declaration?.type !== 'VariableDeclaration') continue
    for (const row of declaration.declarations) {
      if (routers.has(row.init?.callee?.name)) instances.add(row.id.name)
      const factory = factories.get(row.init?.callee?.name)
      if (factory) functions.set(row.id.name, factory)
    }
  }
  return { instances, functions }
}

export function convexOperations(code, file) {
  if (file.split('/').includes('_generated') || !code.includes('_generated/server')) return []
  const parsed = parseSync(file, code)
  if (parsed.errors.length) throw Error(`Cannot inventory Convex functions in ${file}`)
  const { factories, routers, module } = imports(parsed.program.body, file)
  if (!module) return []
  const { instances, functions } = bindings(parsed.program.body, factories, routers)
  const operations = []
  const add = (name, local, factory = functions.get(local)) => {
    if (!factory || factory === 'httpAction') return
    operations.push({ id: name === 'default' ? module : `${module}:${name}`, file, export: name, kind: factory.replace(/^internal/u, '').toLowerCase(), visibility: factory.startsWith('internal') ? 'internal' : 'public' })
  }
  for (const node of parsed.program.body) {
    if (node.type === 'ExportDefaultDeclaration') add('default', node.declaration.name, factories.get(node.declaration.callee?.name))
    if (node.type !== 'ExportNamedDeclaration') continue
    for (const row of node.declaration?.declarations ?? []) add(row.id.name, row.id.name)
    for (const spec of node.specifiers ?? []) add(spec.exported.name, spec.local.name)
  }
  walk(parsed.program, node => {
    if (node.type === 'CallExpression' && instances.has(node.callee.object?.name) && node.callee.property?.name === 'route') {
      const properties = node.arguments[0]?.properties ?? []
      const value = name => properties.find(row => (row.key?.name ?? row.key?.value) === name)?.value
      const path = value('path'), method = value('method'), handler = value('handler')
      // shortcut: only literal paths and methods are indexed, add static evaluation when dynamic routes need coverage.
      if (typeof path?.value === 'string' && typeof method?.value === 'string' && (functions.get(handler?.name) === 'httpAction' || factories.get(handler?.callee?.name) === 'httpAction')) operations.push({ id: `${method.value}:${path.value}`, file, export: handler.name ?? 'httpAction', kind: 'route', visibility: 'public' })
    }
  })
  return operations
}

export const convexDetector = { name: 'convex', detect: convexOperations }
