import { parseSync } from 'vite'
import { routeExports, isFunction, routeRow } from './file-routes.mjs'

const literal = node => node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined
function configFile(kind, args, full, rows) {
  const file = literal(args[kind === 'route' ? 1 : 0])
  if (kind !== 'prefix' && file && !file.split('/').includes('..') && !file.startsWith('/')) rows.set('app/' + file, '/' + full)
}
function configEntries(node, parent, bindings, rows) {
  if (node?.type === 'SpreadElement') return configEntries(node.argument, parent, bindings, rows)
  if (node?.type === 'ArrayExpression') {
    for (const item of node.elements) configEntries(item, parent, bindings, rows)
    return
  }
  if (node?.type !== 'CallExpression' || node.callee.type !== 'Identifier') return
  const kind = bindings.get(node.callee.name), args = node.arguments
  if (!kind) return
  const path = kind === 'route' || kind === 'prefix' ? literal(args[0]) : ''
  if (path === undefined) return
  const full = [parent, path].filter(Boolean).join('/')
  configFile(kind, args, full, rows)
  if (kind === 'route') configEntries(args[2], full, bindings, rows)
  if (kind === 'layout') configEntries(args[1], parent, bindings, rows)
  if (kind === 'prefix') configEntries(args[1], full, bindings, rows)
}
export function reactRouterConfig(code) {
  const parsed = parseSync('app/routes.ts', code)
  if (parsed.errors.length) throw Error('Cannot inventory app/routes.ts')
  const bindings = new Map(), rows = new Map()
  for (const node of parsed.program.body) {
    if (node.type === 'ImportDeclaration' && node.source.value === '@react-router/dev/routes') {
      for (const spec of node.specifiers) if (spec.type === 'ImportSpecifier' && ['route', 'index', 'layout', 'prefix'].includes(spec.imported.name)) bindings.set(spec.local.name, spec.imported.name)
    }
    if (node.type === 'ExportDefaultDeclaration') configEntries(node.declaration.type === 'TSSatisfiesExpression' ? node.declaration.expression : node.declaration, '', bindings, rows)
  }
  return rows
}
function flatPath(file) {
  const match = /^app\/routes\/(?<path>.+?)(?:\/route)?\.[jt]sx?$/u.exec(file)
  if (!match || match[1].includes('/')) return
  if (/[()[\]]/u.test(match[1].replaceAll('[.]', ''))) return
  const segments = match[1].replaceAll('[.]', '\0').split('.').filter(part => part !== '_index' && !part.startsWith('_'))
  return '/' + segments.map(part => part.replace(/_$/u, '').replace(/^\$(?<param>.+)$/u, ':$<param>').replace(/^\$$/u, ':splat*').replaceAll('\0', '.')).join('/')
}
export function reactRouterOperations(code, file, context = {}) {
  const path = context.reactRouterRoutes ? context.reactRouterRoutes.get(file) : flatPath(file)
  if (path === undefined) return []
  return routeExports(code, file).filter(([name, value]) => ['loader', 'action'].includes(name) && isFunction(value)).flatMap(([name]) =>
    (name === 'loader' ? ['GET'] : ['POST', 'PUT', 'PATCH', 'DELETE']).map(method => routeRow(method, path, file, name,
      'Literal app/routes.ts or Remix flat routes only: basename, base, trailing slash, custom appDirectory, generated configs, optional flat segments and re-exports are not resolved.')))
}
export const reactRouterDetector = { name: 'react-router', detect: reactRouterOperations }
