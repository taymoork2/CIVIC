import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync, existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const fail = (message) => { throw Error(`CIVIC project: ${message}`) }
/**
 * An app's manifest file: `civic.json` at its root, else `.civic/civic.json`. Apps connected earlier keep
 * their `civic.project.json` (deprecated) or `rehearsal.project.json`.
 */
export function manifestIn(root) {
  return ['civic.json', '.civic/civic.json', 'civic.project.json', 'rehearsal.project.json'].map((name) => join(root, name)).find(existsSync) ?? join(root, 'civic.json')
}
/** The folder a manifest's relative paths start from: the app's root, which for `.civic/civic.json` is the folder above `.civic`. */
export function manifestRootOf(manifestPath) {
  const folder = dirname(manifestPath)
  return basename(manifestPath) === 'civic.json' && basename(folder) === '.civic' ? dirname(folder) : folder
}
const warned = new Set()
function warnIfDeprecated(manifestPath) {
  if (!['civic.project.json', 'rehearsal.project.json'].includes(basename(manifestPath)) || warned.has(manifestPath)) return
  warned.add(manifestPath)
  process.emitWarning(`${manifestPath} still works, but the manifest is now civic.json at the app root or .civic/civic.json. Rename it.`, { type: 'DeprecationWarning', code: 'CIVIC_MANIFEST_NAME' })
}
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
  // `module` is the portable preview contract. Any other kind names a connector the host registers (Example's is `example`).
  if (!id(input.adapter?.kind) || input.adapter.entry !== undefined && !words(input.adapter.entry)) fail('unsupported adapter or entry')
  if (input.adapter.mode !== undefined && input.adapter.mode !== 'live-read-only') fail('unsupported live review mode')
  if (input.adapter.runtime !== undefined && !words(input.adapter.runtime, 500)) fail('invalid isolated runtime entry')
  if (input.adapter.extension !== undefined && !words(input.adapter.extension, 500)) fail('invalid canvas extension')
  for (const field of ['sources', 'navigation']) if (!Array.isArray(input[field]) || !input[field].length || input[field].length > 50 || new Set(input[field]).size !== input[field].length || input[field].some((s) => !words(s))) fail(`invalid ${field}`)
  for (const field of ['personas', 'roles', 'conditions']) {
    const rows = input[field]
    if (!Array.isArray(rows) || !rows.length || rows.length > 50 || rows.some((row) => !row || !id(row.id) || !words(row.label) || row.description !== undefined && !words(row.description, 2000)) || new Set(rows.map((row) => row.id)).size !== rows.length) fail(`invalid or duplicate ${field}`)
  }
  if (input.identity !== undefined || input.personas.some((persona) => persona.identity !== undefined)) checkedIdentity(input)
  if (input.appearance !== undefined) {
    const appearance = input.appearance
    if (!appearance || typeof appearance !== 'object' || Array.isArray(appearance) || Object.keys(appearance).some(key => !['themes', 'defaultTheme'].includes(key)) || !Array.isArray(appearance.themes) || !appearance.themes.length || appearance.themes.length > 30 || appearance.themes.some(theme => !theme || typeof theme.id !== 'string' || !/^[a-z][a-z0-9.-]{0,79}$/.test(theme.id) || !words(theme.label) || Object.keys(theme).some(key => !['id', 'label'].includes(key))) || new Set(appearance.themes.map(theme => theme.id)).size !== appearance.themes.length || appearance.defaultTheme !== undefined && !appearance.themes.some(theme => theme.id === appearance.defaultTheme)) fail('invalid appearance themes or default theme')
  }
  if (input.aliases !== undefined && (!input.aliases || typeof input.aliases !== 'object' || Array.isArray(input.aliases) || Object.entries(input.aliases).some(([name, path]) => !/^[@a-z][@a-z0-9/_-]*$/i.test(name) || !words(path, 500)))) fail('invalid aliases')
  if (input.design !== undefined && (!input.design || !words(input.design.id) || !Array.isArray(input.design.files) || input.design.files.some((path) => !words(path, 500)))) fail('invalid design references')
  if (JSON.stringify(input).length > 250_000) fail('manifest too large; keep fixtures in the preview adapter')
  return input
}
/**
 * Review identities are synthetic: an id, a display name and an email on a reserved domain (RFC 2606/6761),
 * never a real account. Runs get a fresh credential for them, so a manifest never holds one.
 */
export const syntheticEmail = /^[a-z0-9._+-]{1,64}@(?:[a-z0-9-]{1,63}\.)*(?:example(?:\.(?:com|net|org))?|test|invalid|localhost)$/i
function checkedIdentity(input) {
  const config = input.identity ?? {}, sign = config.signIn
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).some((key) => !['signIn', 'signedOut'].includes(key))) fail('identity takes signIn and signedOut')
  if (config.signedOut !== undefined && (!Array.isArray(config.signedOut) || config.signedOut.some((condition) => !input.conditions.some((row) => row.id === condition)))) fail('identity.signedOut must name declared conditions')
  if (sign !== undefined && (!sign || typeof sign !== 'object' || Object.keys(sign).some((key) => !['method', 'path', 'body', 'token'].includes(key)) || !['POST', 'PUT', undefined].includes(sign.method) || !words(sign.path, 500) || !/^\/[\w/.~%-]*$/.test(sign.path) || sign.path.includes('..') || sign.body !== undefined && (typeof sign.body !== 'object' || Array.isArray(sign.body) || JSON.stringify(sign.body).length > 2000) || sign.token !== undefined && !/^[a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*$/.test(sign.token))) fail('identity.signIn is { method?, path, body?, token? }')
  const written = (value) => value && typeof value === 'object' && Object.entries(value).some(([key, child]) => /password|secret|token|credential|pin\b/i.test(key) && typeof child === 'string' && child !== '{credential}' || written(child))
  if (written(sign?.body)) fail('identity.signIn sends {credential}, never a written secret')
  for (const persona of input.personas) {
    const who = persona.identity
    if (who === undefined) continue
    if (!who || typeof who !== 'object' || Object.keys(who).some((key) => !['id', 'name', 'email'].includes(key)) || !id(who.id) || !words(who.name, 120) || typeof who.email !== 'string' || !syntheticEmail.test(who.email)) fail(`persona ${persona.id}: identity is { id, name, email } with a reserved example domain such as @team.example`)
  }
  if (input.identity && !input.personas.some((persona) => persona.identity)) fail('identity needs at least one persona with a synthetic identity')
}
export function loadProject(repo, options = {}) {
  let local = {}
  try { local = JSON.parse(readFileSync(join(repo, '.review-data/application.json'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const selected = options.manifest ?? process.env.CIVIC_PROJECT ?? process.env.REHEARSAL_PROJECT ?? local.project
  const chosen = selected && resolve(repo, selected)
  const manifestPath = realpathSync(chosen ? (statSync(chosen).isDirectory() ? manifestIn(chosen) : chosen) : manifestIn(repo))
  warnIfDeprecated(manifestPath)
  const manifestRoot = manifestRootOf(manifestPath)
  const manifest = checkedProject(JSON.parse(readFileSync(manifestPath, 'utf8')))
  const root = realpathSync(resolve(repo, options.applicationRoot ?? process.env.CIVIC_APP_ROOT ?? process.env.REHEARSAL_APP_ROOT ?? (!options.manifest && !process.env.CIVIC_PROJECT && !process.env.REHEARSAL_PROJECT ? local.root : undefined) ?? manifestRoot))
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
  // The app's own canvas extension (layout, a guided run), for apps without a connector that supplies one.
  const extension = manifest.adapter.extension ? projectPath(manifestRoot, manifest.adapter.extension, true, strict) : null
  if (extension && !/\.(?:[cm]?js|tsx?)$/.test(extension)) fail('canvas extension must be JavaScript or TypeScript')
  const publicDir = manifest.publicDir ? projectPath(root, manifest.publicDir, true, strict) : false
  const aliases = Object.fromEntries(Object.entries(manifest.aliases ?? {}).map(([name, path]) => [name, projectPath(root, path, true, strict)]))
  let saved
  try {
    const rows = JSON.parse(readFileSync(join(repo, '.review-data/project-picker.json'), 'utf8'))
    saved = rows.find(row => row.manifest === manifestPath && row.root === root)
    if (saved && !new RegExp(`^${manifest.id.replaceAll('.', '\\.')}\\-[a-f0-9]{12}$`).test(saved.key)) fail('invalid saved connection key')
    if (saved && rows.some(row => row !== saved && row.key === saved.key)) fail('duplicate saved connection key')
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  // Paths can move; an established connection keeps the identity used by its saved evidence.
  const key = saved?.key ?? `${manifest.id}-${createHash('sha256').update(JSON.stringify([manifestPath, root])).digest('hex').slice(0, 12)}`
  return { manifest, manifestPath, manifestRoot, root, sources, scenariosPath, coverageFile, entry, runtimeEntry, extension, publicDir, aliases, key, local, app: saved?.app, connectionKind: saved?.kind }
}
export function publicProject(project, capabilities) {
  const { manifest: m, key } = project
  return { id: m.id, key, name: m.name, ...(project.app ? { app: project.app } : {}), ...(project.connectionKind ? { connectionKind: project.connectionKind } : {}), adapter: m.adapter.kind, ...(m.adapter.mode ? { mode: m.adapter.mode } : {}), ...(capabilities ? { capabilities } : {}), ...(m.appearance ? { appearance: m.appearance } : {}), preview: Boolean(project.entry), runtime: Boolean(project.runtimeEntry), personas: m.personas, roles: m.roles, conditions: m.conditions, navigation: m.navigation }
}
export function checkedScenarios(rows, project) {
  if (!Array.isArray(rows) || rows.length > 2000) fail('invalid scenario registry')
  const ids = new Set()
  for (const row of rows) {
    if (!row || !id(row.id) || ids.has(row.id) || !words(row.label) || !words(row.journey)) fail('invalid or duplicate scenario identity')
    ids.add(row.id)
    for (const field of ['targetId', 'componentId']) if (row[field] !== undefined && !id(row[field])) fail(`invalid ${field}: ${row.id}`)
    if (row.viewport !== undefined && (!row.viewport || !Number.isInteger(row.viewport.width) || !Number.isInteger(row.viewport.height) || row.viewport.width < 200 || row.viewport.width > 1920 || row.viewport.height < 200 || row.viewport.height > 1600 || Object.keys(row.viewport).some(key => !['width', 'height'].includes(key)))) fail(`invalid screen viewport: ${row.id}`)
    if (row.flow !== undefined && !id(row.flow) || row.branchOf !== undefined && !id(row.branchOf)) fail(`invalid flow or branch identity: ${row.id}`)
    if (row.component !== undefined) projectPath(project.root, row.component, false, project.manifest.adapter.kind === 'module')
    if (row.componentExport !== undefined && (!row.component || !words(row.componentExport, 120) || !/^[a-zA-Z_$][\w$]*$/.test(row.componentExport))) fail(`invalid component export: ${row.id}`)
    if (row.section !== undefined && !project.manifest.navigation.includes(row.section)) fail(`unknown navigation section: ${row.section}`)
    if (row.edges !== undefined && (!Array.isArray(row.edges) || row.edges.length > 100 || row.edges.some((edge) => !edge || !id(edge.destination) || !words(edge.action) || edge.when !== undefined && !words(edge.when, 1000) || edge.returnTo !== undefined && !words(edge.returnTo, 1000) || edge.interaction !== undefined && !['navigate', 'update', 'return'].includes(edge.interaction)))) fail(`invalid edges: ${row.id}`)
    if (row.identity !== undefined && row.identity !== 'signed-out') fail(`identity is "signed-out" or absent: ${row.id}`)
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
    const manifest = checkedProject({ version: 1, id: values.id, name: values.name, adapter: { kind: 'module', ...(values.preview ? { entry: values.preview } : {}) }, sources: values.source, scenarios: 'civic.scenarios.json', coverage: 'civic.coverage.json', personas: [{ id: 'default', label: 'Default synthetic situation' }], roles: [{ id: 'reviewer', label: 'Reviewer' }], conditions: [{ id: 'normal', label: 'Normal' }], navigation: ['Start', 'Main'] })
    for (const path of [...manifest.sources, ...(values.preview ? [values.preview] : [])]) projectPath(root, path)
    if (existsSync(manifestIn(root))) fail(`refusing to overwrite ${manifestIn(root)}`)
    const outputs = { 'civic.json': manifest, 'civic.scenarios.json': [], 'civic.coverage.json': { version: 1, targets: [] } }
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
