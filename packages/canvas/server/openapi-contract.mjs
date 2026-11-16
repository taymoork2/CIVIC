import { readFile } from 'node:fs/promises'
import { projectPath } from '@civic/vite-connector/project'

const methods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'])
const object = value => value && typeof value === 'object' && !Array.isArray(value)

function contractRows(document, file) {
  if (!object(document) || !/^3\.\d+\.\d+(?:[-+].*)?$/u.test(document.openapi) || !object(document.paths)) throw Error(`Invalid OpenAPI 3 document: ${file}`)
  if (document.servers !== undefined && (!Array.isArray(document.servers) || document.servers.some(server => !object(server) || typeof server.url !== 'string' || !server.url))) throw Error(`Invalid OpenAPI servers: ${file}`)
  const prefix = document.servers?.length === 1 ? new URL(document.servers[0].url, 'http://contract.invalid').pathname.replace(/\/$/u, '') : ''
  const rows = []
  for (const [path, item] of Object.entries(document.paths)) {
    if (!path.startsWith('/') || !object(item) || item.$ref) throw Error(`Unsupported OpenAPI path: ${file}: ${path}`)
    for (const [method, operation] of Object.entries(item)) {
      if (!methods.has(method)) continue
      if (!object(operation) || operation.$ref || operation.operationId !== undefined && typeof operation.operationId !== 'string') throw Error(`Invalid OpenAPI operation: ${file}: ${path}`)
      const id = `${method.toUpperCase()} ${prefix}${path.replaceAll(/\{(?<parameter>[^/{}]+)\}/gu, ':$<parameter>')}`
      rows.push({ id, file, export: operation.operationId ?? id, kind: 'route', source: 'contract', evidence: 'contract' })
    }
  }
  return rows
}

export async function contractOperations(project) {
  const rows = []
  for (const file of project.manifest.adapter.contracts ?? []) {
    const path = projectPath(project.root, file)
    if (!file.endsWith('.json')) throw Error('OpenAPI contracts currently require JSON; YAML is not a declared workspace dependency')
    // oxlint-disable-next-line eslint/no-await-in-loop -- Read declared contracts sequentially to bound resource use.
    const bytes = await readFile(path, 'utf8')
    if (bytes.length > 5_000_000) throw Error('OpenAPI contract too large')
    rows.push(...contractRows(JSON.parse(bytes), file))
    if (rows.length > 10000) throw Error('OpenAPI operation limit reached')
  }
  return rows
}
