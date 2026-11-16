import { parseSync } from 'vite'

const verbs = /^(?:get|head|post|put|patch|delete|options|connect|trace|all)$/u
const literal = node => node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined
const method = node => node?.type === 'MemberExpression' && !node.computed ? node.property.name : undefined

function expressImports(body) {
  const factories = new Set(), routers = new Set()
  for (const node of body) {
    if (node.type !== 'ImportDeclaration' || node.source.value !== 'express') continue
    for (const spec of node.specifiers) {
      if (spec.type === 'ImportDefaultSpecifier') factories.add(spec.local.name)
      if (spec.imported?.name === 'Router') routers.add(spec.local.name)
    }
  }
  return { factories, routers }
}

function expressBindings(body) {
  const { factories, routers } = expressImports(body), instances = new Set(), apps = new Set()
  for (const node of body) {
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
    for (const row of declaration?.declarations ?? []) {
      const call = row.init
      if (call?.type !== 'CallExpression') continue
      if (call.callee.name === 'require' && literal(call.arguments[0]) === 'express') factories.add(row.id.name)
      if (factories.has(call.callee.name)) { instances.add(row.id.name); apps.add(row.id.name) }
      if (routers.has(call.callee.name) || (factories.has(call.callee.object?.name) && method(call.callee) === 'Router')) instances.add(row.id.name)
    }
  }
  return { instances, apps }
}

function routeCall(object) {
  if (object?.type !== 'CallExpression') return
  if (method(object.callee) === 'route') return object
  if (verbs.test(method(object.callee) ?? '')) return routeCall(object.callee.object)
}

function mountCall(node, instances, mounts, unresolved) {
  const prefix = literal(node.arguments[0]), child = node.arguments.at(-1)?.name
  if (prefix !== undefined && instances.has(child)) {
    mounts.push({ parent: node.callee.object.name, child, prefix })
    return 0
  }
  if (!node.arguments.some(arg => arg.type === 'Identifier' || arg.type === 'Literal')) return 0
  if (instances.has(child)) unresolved.add(child)
  return 1
}

export function expressOperations(code, file) {
  if (!code.includes('express')) return []
  const parsed = parseSync(file, code)
  if (parsed.errors.length) throw Error(`Cannot inventory Express routes in ${file}`)
  const { instances, apps } = expressBindings(parsed.program.body)
  const mounts = [], routes = [], unresolved = new Set()
  let skipped = 0
  // Top-level registration only: nested scopes may shadow imported/router bindings.
  const calls = node => {
    if (node?.type !== 'CallExpression') return
    calls(node.callee.object)
    const verb = method(node.callee), object = node.callee.object
    if (verb === 'use' && instances.has(object?.name)) {
      skipped += mountCall(node, instances, mounts, unresolved)
      return
    }
    if (!verbs.test(verb ?? '')) return
    const chained = routeCall(object)
    const owner = chained ? chained.callee.object?.name : object?.name
    if (!instances.has(owner)) return
    if (node.arguments.length < (chained ? 1 : 2)) return
    const path = literal(chained ? chained.arguments[0] : node.arguments[0])
    if (path === undefined || !path.startsWith('/')) { skipped++; return }
    const handler = node.arguments.at(-1)
    routes.push({ owner, path, verb: verb === 'all' ? 'ALL' : verb.toUpperCase(), name: handler?.name ?? verb })
  }
  for (const node of parsed.program.body) if (node.type === 'ExpressionStatement') calls(node.expression)
  const prefixes = (owner, seen = new Set()) => {
    if (seen.has(owner) || unresolved.has(owner)) return []
    const parents = mounts.filter(row => row.child === owner)
    if (!parents.length) return ['']
    return parents.flatMap(row => prefixes(row.parent, new Set([...seen, owner])).map(prefix => prefix + row.prefix.replace(/\/$/u, '')))
  }
  return routes.flatMap(row => prefixes(row.owner).map(prefix => ({
    id: `${row.verb} ${prefix}${row.path}`, file, export: row.name, kind: 'route',
    limits: [`Skipped ${skipped} non-literal/regex paths or unresolved mounts in this file. Cross-file mounts, nested registration, middleware ordering and runtime registration are not resolved.${apps.has(row.owner) || prefix ? '' : ' Unmounted router path is relative; its external mount is unknown.'}`],
  })))
}

export const expressDetector = { name: 'express', detect: expressOperations }
