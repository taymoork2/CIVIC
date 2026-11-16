/* oxlint-disable eslint/no-use-before-define -- The bounded expression and statement walkers are mutually recursive. */
import { parseSync } from 'vite'

const verbs = /^(?:get|head|post|put|patch|delete|options|connect|trace|all)$/u
const literal = node => node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined
const member = node => node?.type === 'MemberExpression' && !node.computed ? node.property.name : undefined
const property = (node, name) => node?.properties?.some(row => row.type === 'SpreadElement' || row.computed) ? undefined : node?.properties?.find(row => (row.key?.name ?? row.key?.value) === name)?.value
const pathJoin = (prefix, path) => prefix.replace(/\/$/u, '') + path
const strings = node => node?.type === 'ArrayExpression' ? node.elements.map(literal) : [literal(node)]

function optionsPrefix(node) {
  if (!node) return ''
  if (node.type !== 'ObjectExpression' || node.properties.some(row => row.type === 'SpreadElement' || row.computed)) return
  const prefix = property(node, 'prefix')
  return prefix ? literal(prefix) : ''
}

function factories(body, framework) {
  const result = new Set()
  for (const node of body) {
    if (node.type !== 'ImportDeclaration' || node.importKind === 'type') continue
    for (const spec of node.specifiers) {
      const name = spec.imported?.name
      if (framework === 'hono' && ((node.source.value === 'hono' && name === 'Hono') || (node.source.value === '@hono/zod-openapi' && name === 'OpenAPIHono'))) result.add(spec.local.name)
      if (framework === 'fastify' && node.source.value === 'fastify' && (spec.type === 'ImportDefaultSpecifier' || ['fastify', 'Fastify'].includes(name))) result.add(spec.local.name)
      if (framework === 'elysia' && node.source.value === 'elysia' && (name === 'Elysia' || spec.type === 'ImportDefaultSpecifier')) result.add(spec.local.name)
    }
  }
  return result
}

function routeArguments(framework, verb, args) {
  if (verb === 'on' || (verb === 'route' && framework === 'elysia')) return { methods: strings(args[0]), paths: strings(args[1]), handler: args.at(-1) }
  if (verb === 'route' && framework === 'fastify') return { methods: strings(property(args[0], 'method')), paths: [literal(property(args[0], 'url'))], handler: property(args[0], 'handler') }
  return { methods: [verb.toUpperCase()], paths: framework === 'hono' ? strings(args[0]) : [literal(args[0])], handler: args.length >= 2 ? args.at(-1) : undefined }
}

function addRoute(instance, route, state) {
  const { methods, paths, handler } = route
  if (!handler || methods.some(value => !/^(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS|CONNECT|TRACE|ALL)$/u.test(value ?? '')) || paths.some(value => !value?.startsWith('/'))) { state.skipped++; return }
  for (const method of methods) for (const path of paths) instance.routes.push({ method, path: pathJoin(instance.prefix, path), name: handler.name ?? method.toLowerCase() })
}

function visitPlugin(fn, instance, env, state) {
  if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(fn?.type) || fn.params[0]?.type !== 'Identifier') { state.skipped++; return }
  const local = new Map(env)
  for (const param of fn.params) if (param.name) local.delete(param.name)
  local.set(fn.params[0].name, instance)
  if (fn.body.type === 'BlockStatement') statements(fn.body.body, local, state)
  else expression(fn.body, local, state)
}

function compose(instance, verb, args, env, state) {
  const { framework } = state
  if (verb === 'register' && framework === 'fastify') {
    const prefix = optionsPrefix(args[1])
    if (prefix === undefined) { state.skipped++; return }
    const child = { prefix: pathJoin(instance.prefix, prefix), routes: instance.routes }
    visitPlugin(env.get(args[0]?.name) ?? args[0], child, env, state)
    return
  }
  if (verb === 'group' && framework === 'elysia') {
    const prefix = literal(args[0])
    if (prefix === undefined) { state.skipped++; return }
    visitPlugin(args.at(-1), { prefix: pathJoin(instance.prefix, prefix), routes: instance.routes }, env, state)
    return
  }
  const child = expression(args.at(-1), env, state)
  const prefix = verb === 'route' ? literal(args[0]) : ''
  if (!child?.routes || prefix === undefined) {
    for (const candidate of state.instances) if (candidate.routes === child?.routes) candidate.hidden = true
    state.skipped++; return
  }
  for (const candidate of state.instances) if (candidate.routes === child.routes) candidate.hidden = true
  instance.routes.push(...child.routes.map(row => ({ ...row, path: pathJoin(pathJoin(instance.prefix, prefix), row.path) })))
}

function registration(instance, verb, args, env, state) {
  if (verb === 'basePath' && state.framework === 'hono') {
    const prefix = literal(args[0])
    if (prefix === undefined) { state.skipped++; return }
    const clone = { prefix: pathJoin(instance.prefix, prefix), routes: instance.routes }
    state.instances.push(clone)
    return clone
  }
  const composition = (state.framework === 'hono' && verb === 'route') || (state.framework === 'fastify' && verb === 'register') || (state.framework === 'elysia' && ['group', 'use'].includes(verb))
  if (composition) compose(instance, verb, args, env, state)
  else if (verbs.test(verb ?? '') || (verb === 'on' && state.framework === 'hono') || (verb === 'route' && state.framework !== 'hono')) addRoute(instance, routeArguments(state.framework, verb, args), state)
  else { state.skipped++; return }
  return instance
}

function expression(node, env, state) {
  if (node?.type === 'Identifier') return env.get(node.name)
  if (!['CallExpression', 'NewExpression'].includes(node?.type)) return
  const isFactory = env.get(node.callee.name) === state.factory
  if (isFactory && (node.type === 'NewExpression') === (state.framework !== 'fastify')) {
    const prefix = state.framework === 'elysia' ? optionsPrefix(node.arguments[0]) : ''
    if (prefix === undefined) { state.skipped++; return }
    const instance = { prefix, routes: [] }
    state.instances.push(instance)
    return instance
  }
  const instance = expression(node.callee.object, env, state)
  if (instance?.routes) return registration(instance, member(node.callee), node.arguments, env, state)
}

function statements(body, env, state) {
  for (const item of body) {
    const node = item.type === 'ExportNamedDeclaration' ? item.declaration : item
    if (node?.type === 'FunctionDeclaration') env.set(node.id.name, node)
  }
  for (const item of body) {
    const node = item.type === 'ExportNamedDeclaration' ? item.declaration : item
    if (node?.type === 'VariableDeclaration') for (const row of node.declarations) {
      const value = expression(row.init, env, state)
      if (row.id.type === 'Identifier') env.set(row.id.name, value ?? row.init)
    }
    if (node?.type === 'ExpressionStatement') expression(node.expression, env, state)
    if (node?.type === 'ReturnStatement') expression(node.argument, env, state)
    if (node?.type === 'ExportDefaultDeclaration') expression(node.declaration, env, state)
  }
}

/** Only direct registrations and explicitly supported callbacks are inspected; arbitrary scopes can shadow bindings. */
export function literalRouteOperations(code, file, framework, runtime) {
  if (!code.includes(framework) && !code.includes('@hono/zod-openapi')) return []
  const parsed = parseSync(file, code)
  if (parsed.errors.length) throw Error(`Cannot inventory ${framework} routes in ${file}`)
  const state = { framework, factory: Symbol('factory'), instances: [], skipped: 0 }
  const env = new Map([...factories(parsed.program.body, framework)].map(name => [name, state.factory]))
  statements(parsed.program.body, env, state)
  const rows = state.instances.filter(instance => !instance.hidden).flatMap(instance => instance.routes)
  return [...new Map(rows.map(row => [`${row.method} ${row.path}`, row])).entries()].map(([id, row]) => ({
    id, file, export: row.name, kind: 'route',
    limits: [`Skipped ${state.skipped} unresolved registrations. Non-literal paths, dynamic methods, cross-file plugins/mounts, arbitrary nested scopes and registration order effects are not resolved. Runtime ${runtime} would resolve composed paths and methods; runtime reading is not implemented.`],
  }))
}
