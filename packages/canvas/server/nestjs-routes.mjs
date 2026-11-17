import { parseSync } from 'vite'

const literal = node => node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined
const verbs = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head', 'All'])

function decoratorPath(call, controller) {
  if (!call.arguments.length) return ''
  const arg = call.arguments[0]
  if (!controller || arg.type !== 'ObjectExpression') return literal(arg)
  if (arg.properties.some(row => row.type === 'SpreadElement' || row.computed)) return
  return literal(arg.properties.find(row => (row.key.name ?? row.key.value) === 'path')?.value)
}

function classOperations(node, imports, file) {
  if (node?.type !== 'ClassDeclaration' || !node.id) return []
  const controller = node.decorators.map(row => row.expression).find(call => imports.get(call.callee?.name) === 'Controller')
  if (controller?.type !== 'CallExpression') return []
  const prefix = decoratorPath(controller, true)
  if (prefix === undefined) return []
  const rows = []
  for (const method of node.body.body) {
    if (method.type !== 'MethodDefinition' || method.computed || method.static || method.kind !== 'method') continue
    for (const decorator of method.decorators) {
      const call = decorator.expression, verb = imports.get(call.callee?.name)
      if (call.type !== 'CallExpression' || !verbs.has(verb)) continue
      const path = decoratorPath(call, false)
      if (path === undefined) continue
      const route = '/' + [prefix, path].flatMap(part => {
        const segment = part.replaceAll(/^\/+|\/+$/gu, '')
        return segment ? [segment] : []
      }).join('/')
      rows.push({ id: `${verb.toUpperCase()} ${route}`, file, export: `${node.id.name}.${method.key.name ?? method.key.value}`, kind: 'route', limits: ['Literal decorators only: app.setGlobalPrefix, versioning, RouterModule paths, host constraints, inherited/custom decorators and dynamic paths are not resolved.'] })
    }
  }
  return rows
}

export function nestjsOperations(code, file) {
  if (!code.includes('@nestjs/common')) return []
  const parsed = parseSync(file, code)
  if (parsed.errors.length) throw Error(`Cannot inventory NestJS routes in ${file}`)
  const imports = new Map()
  for (const node of parsed.program.body) {
    if (node.type !== 'ImportDeclaration' || node.importKind === 'type' || node.source.value !== '@nestjs/common') continue
    for (const spec of node.specifiers) if (spec.type === 'ImportSpecifier' && spec.importKind !== 'type') imports.set(spec.local.name, spec.imported.name)
  }
  return parsed.program.body.flatMap(node => classOperations(node.declaration ?? node, imports, file))
}

export const nestjsDetector = { name: 'nestjs', detect: nestjsOperations }
