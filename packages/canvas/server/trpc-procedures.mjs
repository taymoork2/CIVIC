import { parseSync } from 'vite'

const member = node => node?.type === 'MemberExpression' && !node.computed ? node.property.name : undefined
const key = row => !row.computed && row.type === 'Property' ? row.key.name ?? row.key.value : undefined

function importsFrom(body) {
  const bindings = new Map()
  for (const node of body) {
    if (node.type !== 'ImportDeclaration' || node.importKind === 'type') continue
    const source = node.source.value
    if (source !== '@trpc/server' && !(source.startsWith('.') && /(?:^|\/)trpc(?:\.[cm]?[jt]s)?$/u.test(source))) continue
    for (const spec of node.specifiers) if (spec.type === 'ImportSpecifier' && spec.importKind !== 'type') bindings.set(spec.local.name, spec.imported.name)
  }
  return bindings
}

function trpcInstance(node, bindings) {
  if (node?.type !== 'CallExpression' || !['create', 'context', 'meta'].includes(member(node.callee))) return false
  const base = node.callee.object
  return bindings.get(base.name) === 'initTRPC' || trpcInstance(base, bindings)
}

function routerObject(node, bindings, instances) {
  if (node?.type !== 'CallExpression') return
  const callee = node.callee
  const factory = ['router', 'createTRPCRouter'].includes(bindings.get(callee.name))
  if (!factory && !(member(callee) === 'router' && instances.has(callee.object.name))) return
  if (node.arguments[0]?.type === 'ObjectExpression') return node.arguments[0]
}

function collectRouter(object, prefix, state, seen = new Set()) {
  const rows = []
  if (!object || seen.has(object)) return rows
  const visited = new Set([...seen, object])
  for (const property of object.properties) {
    const name = key(property)
    if (typeof name !== 'string' || !name) continue
    const path = prefix ? `${prefix}.${name}` : name, value = property.value
    const nested = state.routers.get(value?.name) ?? routerObject(value, state.bindings, state.instances)
    if (nested) rows.push(...collectRouter(nested, path, state, visited))
    else if (value?.type === 'CallExpression' && ['query', 'mutation', 'subscription'].includes(member(value.callee))) rows.push({ id: `trpc:${path}`, file: state.file, export: path, kind: 'rpc', limits: ['Literal same-file router trees only. Relative trpc module imports use the conventional router/createTRPCRouter/t exports; their implementation is not resolved. Imported/merged routers, computed keys, spreads and custom router factories are not resolved. HTTP matching assumes the /trpc/ endpoint; a successful batch HTTP response does not prove each procedure succeeded.'] })
  }
  return rows
}

function nestedRouters(object, bindings, instances, routers, nested) {
  for (const property of object.properties) {
    if (!key(property)) continue
    if (routers.has(property.value?.name)) nested.add(property.value.name)
    const inline = routerObject(property.value, bindings, instances)
    if (inline) nestedRouters(inline, bindings, instances, routers, nested)
  }
}

export function trpcOperations(code, file) {
  if (!code.includes('trpc')) return []
  const parsed = parseSync(file, code)
  if (parsed.errors.length) throw Error(`Cannot inventory tRPC procedures in ${file}`)
  const body = parsed.program.body, bindings = importsFrom(body), instances = new Set()
  for (const [local, imported] of bindings) if (imported === 't') instances.add(local)
  const declarations = body.flatMap(node => (node.declaration ?? node)?.declarations ?? [])
  for (const row of declarations) {
    if (trpcInstance(row.init, bindings)) instances.add(row.id.name)
    if (member(row.init) === 'router' && instances.has(row.init.object.name)) bindings.set(row.id.name, 'router')
  }
  const routers = new Map()
  for (const row of declarations) {
    const object = routerObject(row.init, bindings, instances)
    if (object) routers.set(row.id.name, object)
  }
  const defaults = []
  for (const node of body) if (node.type === 'ExportDefaultDeclaration') {
    const object = routerObject(node.declaration, bindings, instances)
    if (object) defaults.push(object)
  }
  const nested = new Set()
  for (const object of [...routers.values(), ...defaults]) nestedRouters(object, bindings, instances, routers, nested)
  const roots = [...[...routers].flatMap(([name, object]) => nested.has(name) ? [] : [object]), ...defaults]
  return roots.flatMap(object => collectRouter(object, '', { routers, bindings, instances, file }))
}

export const trpcDetector = { name: 'trpc', detect: trpcOperations }
