import { parseSync } from 'vite'

// Next transports build-generated action ids. Replay reach needs a current-build
// mapping to file:export; source discovery alone cannot establish action reach.
export function exportedFunctions(body) {
  const bindings = new Map(), exports = []
  for (const node of body) {
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
    if (declaration?.type === 'FunctionDeclaration') bindings.set(declaration.id.name, declaration)
    for (const row of declaration?.declarations ?? []) {
      if (row.id.type === 'Identifier') bindings.set(row.id.name, row.init)
    }
    if (node.type === 'ExportDefaultDeclaration') exports.push(['default', node.declaration])
    if (node.type !== 'ExportNamedDeclaration' || node.source) continue
    if (declaration?.type === 'FunctionDeclaration') exports.push([declaration.id.name, declaration])
    for (const row of declaration?.declarations ?? []) exports.push([row.id.name, row.id.name])
    for (const spec of node.specifiers) exports.push([spec.exported.name ?? spec.exported.value, spec.local.name])
  }
  const resolve = (value, seen = new Set()) => {
    const local = typeof value === 'string' ? value : value?.type === 'Identifier' ? value.name : undefined
    if (local === undefined) return value
    if (seen.has(local)) return
    return resolve(bindings.get(local), new Set([...seen, local]))
  }
  return exports.map(([name, value]) => [name, resolve(value)])
}

const serverDirective = body => body?.[0]?.directive === 'use server'

export function nextActionOperations(code, file) {
  if (!code.includes('use server')) return []
  const parsed = parseSync(file, code)
  if (parsed.errors.length) throw Error(`Cannot inventory Next actions in ${file}`)
  const module = serverDirective(parsed.program.body)
  return exportedFunctions(parsed.program.body).filter(([, fn]) => fn?.async && (module || serverDirective(fn.body?.body))).map(([name]) => ({
    id: `${file}:${name}`, file, export: name, kind: 'rpc',
    limits: ['Replay action mapping requires Next build-generated ids; build manifests are not read.'],
  }))
}

export const nextActionsDetector = { name: 'next-actions', detect: nextActionOperations }
