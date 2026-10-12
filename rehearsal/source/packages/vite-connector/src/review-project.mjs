import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync, existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const fail = (message) => { throw Error(`Rehearsal project: ${message}`) }
const id = (value) => typeof value === 'string' && /^[a-z][a-z0-9.-]{0,119}$/.test(value)
const words = (value, max = 200) => typeof value === 'string' && value.trim() && value.length <= max
export function projectPath(root, path, required = true, strict = true) {
  if (!words(path, 500) || isAbsolute(path) || path.includes('\\') || path.split('/').some((part) => !part || ['.', '..', '.git', '.review-data', 'node_modules'].includes(part) || part.startsWith('.env'))) fail(`invalid relative path: ${path}`)
  const file = resolve(root, path)
  if (strict) {
    let existing = file
    while (!existsSync(existing)) existing = dirname(existing)
    const actual = realpathSync(existing), base = realpathSync(root)
    if (actual !== base && !actual.startsWith(base + '/')) fail(`path escapes checkout: ${path}`)
  }
  if (required && !existsSync(file)) fail(`missing path: ${path}`)
  return file
}
export function checkedProject(input) {
  if (!input || input.version !== 1 || !id(input.id) || !words(input.name)) fail('use version 1, a stable id and a name')
  // `module` is the portable preview contract. Any other kind names a connector the host registers (Laundry's is `laundry`).
  if (!id(input.adapter?.kind) || input.adapter.entry !== undefined && !words(input.adapter.entry)) fail('unsupported adapter or entry')
  if (input.adapter.runtime !== undefined && !words(input.adapter.runtime, 500)) fail('invalid isolated runtime entry')
  for (const field of ['sources', 'navigation']) if (!Array.isArray(input[field]) || !input[field].length || input[field].length > 50 || new Set(input[field]).size !== input[field].length || input[field].some((s) => !words(s))) fail(`invalid ${field}`)
  for (const field of ['personas', 'roles', 'conditions']) {
    const rows = input[field]
    if (!Array.isArray(rows) || !rows.length || rows.length > 50 || rows.some((row) => !row || !id(row.id) || !words(row.label) || row.description !== undefined && !words(row.description, 2000)) || new Set(rows.map((row) => row.id)).size !== rows.length) fail(`invalid or duplicate ${field}`)
  }
  if (input.aliases !== undefined && (!input.aliases || typeof input.aliases !== 'object' || Array.isArray(input.aliases) || Object.entries(input.aliases).some(([name, path]) => !/^[@a-z][@a-z0-9/_-]*$/i.test(name) || !words(path, 500)))) fail('invalid aliases')
  if (input.design !== undefined && (!input.design || !words(input.design.id) || !Array.isArray(input.design.files) || input.design.files.some((path) => !words(path, 500)))) fail('invalid design references')
  if (JSON.stringify(input).length > 250_000) fail('manifest too large; keep fixtures in the preview adapter')
  return input
}
export function loadProject(repo, options = {}) {
  let local = {}
  try { local = JSON.parse(readFileSync(join(repo, '.review-data/application.json'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const selected = options.manifest ?? process.env.REHEARSAL_PROJECT ?? local.project
  const manifestPath = realpathSync(resolve(repo, selected ?? 'rehearsal.project.json'))
  const manifestRoot = dirname(manifestPath)
  const manifest = checkedProject(JSON.parse(readFileSync(manifestPath, 'utf8')))
  const root = realpathSync(resolve(repo, options.applicationRoot ?? process.env.REHEARSAL_APP_ROOT ?? (!options.manifest && !process.env.REHEARSAL_PROJECT ? local.root : undefined) ?? manifestRoot))
  // Connector-owned projects may resolve through workspace links; portable modules stay inside their checkout.
  const strict = manifest.adapter.kind === 'module'
  const sources = manifest.sources.map((path) => projectPath(root, path, true, strict))
  if (sources.some((path) => !statSync(path).isDirectory())) fail('source roots must be directories')
  const scenariosPath = projectPath(manifestRoot, manifest.scenarios, true, strict)
  const coverageFile = projectPath(manifestRoot, manifest.coverage, true, strict)
  const entry = manifest.adapter.entry ? projectPath(manifestRoot, manifest.adapter.entry, true, strict) : null
  const runtimeEntry = manifest.adapter.runtime ? projectPath(manifestRoot, manifest.adapter.runtime) : null
  if (runtimeEntry && !/\.(?:[cm]?js|ts)$/.test(runtimeEntry)) fail('runtime entry must be JavaScript or TypeScript')
  if (entry && !/\.(?:[cm]?js|tsx?)$/.test(entry)) fail('preview entry must be JavaScript or TypeScript')
  const publicDir = manifest.publicDir ? projectPath(root, manifest.publicDir, true, strict) : false
  const aliases = Object.fromEntries(Object.entries(manifest.aliases ?? {}).map(([name, path]) => [name, projectPath(root, path, true, strict)]))
  const key = `${manifest.id}-${createHash('sha256').update(JSON.stringify([manifestPath, root])).digest('hex').slice(0, 12)}`
  return { manifest, manifestPath, manifestRoot, root, sources, scenariosPath, coverageFile, entry, runtimeEntry, publicDir, aliases, key, local }
}
export function publicProject(project) {
  const { manifest: m, key } = project
  return { id: m.id, key, name: m.name, adapter: m.adapter.kind, preview: Boolean(project.entry), runtime: Boolean(project.runtimeEntry), personas: m.personas, roles: m.roles, conditions: m.conditions, navigation: m.navigation }
}
export function checkedScenarios(rows, project) {
  if (!Array.isArray(rows) || rows.length > 2000) fail('invalid scenario registry')
  const ids = new Set()
  for (const row of rows) {
    if (!row || !id(row.id) || ids.has(row.id) || !words(row.label) || !words(row.journey)) fail('invalid or duplicate scenario identity')
    ids.add(row.id)
    if (row.flow !== undefined && !id(row.flow) || row.branchOf !== undefined && !id(row.branchOf)) fail(`invalid flow or branch identity: ${row.id}`)
    if (row.component !== undefined) projectPath(project.root, row.component, false, project.manifest.adapter.kind === 'module')
    if (row.section !== undefined && !project.manifest.navigation.includes(row.section)) fail(`unknown navigation section: ${row.section}`)
    if (row.edges !== undefined && (!Array.isArray(row.edges) || row.edges.length > 100 || row.edges.some((edge) => !edge || !id(edge.destination) || !words(edge.action) || edge.when !== undefined && !words(edge.when, 1000) || edge.returnTo !== undefined && !words(edge.returnTo, 1000)))) fail(`invalid edges: ${row.id}`)
    if (row.captureFields !== undefined && (!Array.isArray(row.captureFields) || row.captureFields.length > 100 || row.captureFields.some((s) => !words(s, 300)))) fail(`invalid capture fields: ${row.id}`)
  }
  if (project.manifest.adapter.kind === 'module') for (const row of rows) {
    if (!row.branchOf) continue
    const parent = rows.find((parent) => parent.id === row.branchOf)
    if (!parent || parent.id === row.id || parent.branchOf || (parent.flow ?? parent.journey) !== (row.flow ?? row.journey)) fail(`branch parent must be a main-path screen in the same flow: ${row.id}`)
  }
  // Missing destinations remain visible coverage gaps, never guessed connections.
  return rows
}

async function cli() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { root: { type: 'string' }, name: { type: 'string' }, id: { type: 'string' }, preview: { type: 'string' }, source: { type: 'string', multiple: true }, write: { type: 'boolean', default: false }, project: { type: 'string' } } })
  if (positionals[0] === 'init') {
    if (!values.root || !values.name || !id(values.id) || !values.source?.length) fail('init requires --root, --name, --id and --source; add --write to create files')
    const root = realpathSync(values.root)
    const manifest = checkedProject({ version: 1, id: values.id, name: values.name, adapter: { kind: 'module', ...(values.preview ? { entry: values.preview } : {}) }, sources: values.source, scenarios: 'rehearsal.scenarios.json', coverage: 'rehearsal.coverage.json', personas: [{ id: 'default', label: 'Default synthetic situation' }], roles: [{ id: 'reviewer', label: 'Reviewer' }], conditions: [{ id: 'normal', label: 'Normal' }], navigation: ['Start', 'Main'] })
    for (const path of [...manifest.sources, ...(values.preview ? [values.preview] : [])]) projectPath(root, path)
    const outputs = { 'rehearsal.project.json': manifest, 'rehearsal.scenarios.json': [], 'rehearsal.coverage.json': { version: 1, targets: [] } }
    for (const name of Object.keys(outputs)) if (existsSync(join(root, name))) fail(`refusing to overwrite ${name}`)
    if (values.write) for (const [name, data] of Object.entries(outputs)) await writeFile(join(root, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' })
    console.log(JSON.stringify({ written: values.write, root, files: outputs }, null, 2))
  } else if (positionals[0] === 'check') {
    const project = loadProject(process.cwd(), { manifest: values.project })
    const scenarios = checkedScenarios(JSON.parse(await readFile(project.scenariosPath, 'utf8')), project)
    console.log(JSON.stringify({ ...publicProject(project), root: project.root, scenarios: scenarios.length, unmappedDestinations: scenarios.flatMap((s) => (s.edges ?? []).filter((edge) => !scenarios.some((d) => d.id === edge.destination)).map((edge) => ({ from: s.id, to: edge.destination }))) }, null, 2))
  } else fail('use init or check')
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) cli().catch((error) => { console.error(error.message); process.exitCode = 1 })
