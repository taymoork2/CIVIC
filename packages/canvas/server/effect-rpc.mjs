import { parseSync } from 'vite'

const member = node => node?.type === 'MemberExpression' && !node.computed ? node.property.name : undefined
const modules = new Map([
  ['@effect/rpc', null], ['@effect/rpc/Rpc', 'Rpc'], ['@effect/rpc/RpcGroup', 'RpcGroup'],
  ['effect/rpc', null], ['effect/unstable/rpc', null],
  ['effect/rpc/Rpc', 'Rpc'], ['effect/rpc/RpcGroup', 'RpcGroup'],
  ['effect/unstable/rpc/Rpc', 'Rpc'], ['effect/unstable/rpc/RpcGroup', 'RpcGroup'],
])
const limits = ['Literal declarations and handler objects only; imported group implementations, prefixes, computed names and Effect-built handler objects are not resolved. Replay matching needs the RPC name recorded as rpc:<name>; generic HTTP endpoints and WebSocket traffic do not establish procedure reach.']

function bindings(body) {
  const result = new Map()
  for (const node of body) {
    if (node.type !== 'ImportDeclaration' || node.importKind === 'type') continue
    for (const spec of node.specifiers) {
      if (spec.importKind === 'type') continue
      if (modules.has(node.source.value)) result.set(spec.local.name, modules.get(node.source.value) ?? spec.imported?.name)
      else if (spec.type === 'ImportSpecifier') result.set(spec.local.name, 'imported-group')
    }
  }
  return result
}

function inspectCall(node, state) {
  const method = member(node.callee), receiver = state.bindings.get(node.callee.object?.name)
  if (method === 'make' && receiver === 'Rpc') {
    const name = node.arguments[0]
    if (name?.type === 'Literal' && typeof name.value === 'string' && name.value) state.rows.push({ id: `rpc:${name.value}`, file: state.file, export: name.value, kind: 'rpc', limits: [...limits] })
  }
  if (!['toLayer', 'toHandlers'].includes(method) || !['group', 'imported-group'].includes(receiver)) return
  const object = node.arguments[0]
  if (object?.type !== 'ObjectExpression') return
  for (const property of object.properties) {
    if (property.type !== 'Property' || property.computed) continue
    const name = property.key.name ?? property.key.value
    if (typeof name !== 'string' || !name) continue
    const line = state.code.slice(0, property.start).split('\n').length
    state.rows.push({ id: `rpc:${name}`, file: state.file, export: name, kind: 'rpc', handler: `${state.file}:${line}`, effectRpcHandler: true, limits: [...limits, 'Handler group import is not resolved; no matching RPC definition in this scan.'] })
  }
}

// Skip function scopes: their parameters can shadow imported RPC bindings.
function visit(node, state) {
  if (!node || typeof node !== 'object' || /Function/u.test(node.type ?? '')) return
  if (node.type === 'CallExpression') inspectCall(node, state)
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) { for (const child of value) visit(child, state) }
    else if (value && typeof value === 'object') visit(value, state)
  }
}

export function effectRpcOperations(code, file) {
  if (!code.includes('rpc') && !code.includes('toLayer') && !code.includes('toHandlers')) return []
  const parsed = parseSync(file, code)
  if (parsed.errors.length) throw Error(`Cannot inventory Effect RPC in ${file}`)
  const state = { code, file, bindings: bindings(parsed.program.body), rows: [] }
  for (const item of parsed.program.body) {
    const node = item.declaration ?? item
    const declarations = node.type === 'ClassDeclaration' ? [{ id: node.id, init: node.superClass }] : node.declarations ?? []
    for (const row of declarations) if (member(row.init?.callee) === 'make' && state.bindings.get(row.init.callee.object?.name) === 'RpcGroup') state.bindings.set(row.id.name, 'group')
    visit(node, state)
  }
  return state.rows
}

export function mergeEffectRpcHandlers(operations) {
  const definitions = new Map(operations.filter(row => row.detector === 'effect-rpc' && !row.effectRpcHandler).map(row => [row.id, row]))
  return operations.filter(row => {
    if (!row.effectRpcHandler) return true
    delete row.effectRpcHandler
    const definition = definitions.get(row.id)
    if (!definition) return true
    if (definition.handler) throw Error(`Duplicate Effect RPC handler: ${row.id}`)
    definition.handler = row.handler
    return false
  })
}

export const effectRpcDetector = { name: 'effect-rpc', detect: effectRpcOperations }
