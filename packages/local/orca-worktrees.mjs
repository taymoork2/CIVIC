import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { access, cp, mkdir, readFile, readdir, realpath, rename, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gitSources } from '../vite-connector/src/review-source-versions.mjs'
import { liveScenarios } from './orca-live.mjs'
import { registerComponents } from './orca-drafts.mjs'

const inputs = ['apps/web/src', 'apps/web/public', 'apps/web/index.html', 'apps/web/package.json', 'apps/server/src', 'apps/server/package.json', 'packages/contracts/src', 'packages/contracts/package.json', 'scripts', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']
const json = async file => JSON.parse(await readFile(file, 'utf8'))
export function checkDependencyLock(expected, installed) {
  // pnpm's version-9 package blocks are content/peer-version pins; extra installed packages are fine.
  if (![expected, installed].every(text => /^lockfileVersion: ['"]?9\.0['"]?$/m.test(text))) throw Error('Unsupported Orca dependency lock format')
  for (const section of ['packages', 'snapshots']) {
    const blocks = text => {
      const body = text.split(`\n${section}:\n`)[1]?.split(/\n[^\s]/)[0]
      if (!body) throw Error(`Missing ${section} dependency pins`)
      return new Map(body.split(/\n(?=  \S)/).filter(block => block.trim()).map(block => [block.split('\n')[0].trim(), block.trim()]))
    }
    const available = blocks(installed)
    for (const [key, value] of blocks(expected)) if (available.get(key) !== value) throw Error(`Install the worktree's pinned dependencies separately before connecting it: ${key}`)
  }
}
export async function worktreeHash(source) {
  const hash = createHash('sha256')
  async function visit(relative) {
    let entries
    try { entries = await readdir(join(source, relative), { withFileTypes: true }) }
    catch (error) {
      if (error.code === 'ENOENT') return
      if (error.code !== 'ENOTDIR') throw error
      hash.update(relative + '\0').update(await readFile(join(source, relative))); return
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) throw Error(`Build inputs cannot be symlinks: ${relative}/${entry.name}`)
      await visit(join(relative, entry.name))
    }
  }
  for (const input of inputs) await visit(input)
  for (const file of ['./orca-worktrees.mjs', './orca-drafts.mjs', './orca-components.tsx', './orca-isolated-preview.mjs', './orca-isolated-runtime.mjs']) hash.update(await readFile(new URL(file, import.meta.url)))
  return hash.digest('hex')
}
async function dependencies(snapshot, installed) {
  checkDependencyLock(await readFile(join(snapshot, 'pnpm-lock.yaml'), 'utf8'), await readFile(join(installed, 'pnpm-lock.yaml'), 'utf8'))
  if (await readFile(join(snapshot, 'pnpm-workspace.yaml'), 'utf8') !== await readFile(join(installed, 'pnpm-workspace.yaml'), 'utf8')) throw Error('This worktree has a different dependency catalog. Install its dependencies separately before connecting it.')
  for (const part of ['apps/web', 'apps/server', 'packages/contracts']) {
    const expected = await json(join(snapshot, part, 'package.json')), available = await json(join(installed, part, 'package.json'))
    for (const field of ['dependencies', 'devDependencies']) for (const [name, version] of Object.entries(expected[field] ?? {})) {
      if (available[field]?.[name] !== version) throw Error(`Install compatible dependencies separately before connecting this worktree: ${name} ${version}`)
      const destination = join(snapshot, part, 'node_modules', name)
      await mkdir(dirname(destination), { recursive: true })
      await symlink(name === '@orca/contracts' ? join(snapshot, 'packages/contracts') : await realpath(join(installed, part, 'node_modules', name)), destination)
    }
  }
}
/** Resolve exactly as the isolated runtime does, without loading application modules. */
export async function checkRuntimeDependencies(source) {
  const require = createRequire(join(source, 'apps/server/package.json'))
  for (const name of ['effect/Effect', 'effect/Scope', 'effect/Schema']) {
    try { require.resolve(name) }
    catch (cause) { throw Error(`Preview dependency unavailable in this snapshot: ${name}. Install its pinned dependencies separately before reconnecting.`, { cause }) }
  }
}
export async function buildWorktree(store, installed, tree) {
  const id = `orca-worktree-${createHash('sha256').update(tree.path).digest('hex').slice(0, 12)}`
  const folder = join(store, 'projects', id), hash = await worktreeHash(tree.path)
  let prior
  try { prior = await json(join(folder, 'receipt.json')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const connection = { root: tree.path, manifest: join(folder, 'civic.project.json'), app: { id: 'orca', name: 'Orca' }, kind: 'implementation' }
  if (prior?.worktreeHash === hash && prior.ui === tree.revision && prior.dirty === tree.dirty) {
    await checkRuntimeDependencies(prior.worktreeBuild ? join(folder, prior.worktreeBuild, 'source') : tree.path)
    return connection
  }
  await mkdir(join(folder, 'builds'), { recursive: true, mode: 0o700 })
  // Immutable build inputs and outputs are CIVIC-owned; the source checkout is never modified.
  const buildName = `builds/${hash.slice(0, 16)}-${randomUUID().slice(0, 8)}`, build = join(folder, buildName), snapshot = join(build, 'source')
  await mkdir(snapshot, { recursive: true })
  for (const input of inputs) {
    await mkdir(dirname(join(snapshot, input)), { recursive: true })
    try { await cp(join(tree.path, input), join(snapshot, input), { recursive: true, errorOnExist: true }) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  await dependencies(snapshot, installed)
  await checkRuntimeDependencies(snapshot)
  const runtimeFile = join(snapshot, 'apps/server/src/runtime.ts'), runtimeCode = await readFile(runtimeFile, 'utf8')
  if (!/export (?:function|const) makeRuntime\b/.test(runtimeCode)) {
    if (!/^function makeRuntime\(/m.test(runtimeCode)) throw Error('This worktree has no supported isolated runtime entry')
    // Older Orca exposes only a layer that starts its dispatcher. Export its factory in build inputs instead.
    await writeFile(runtimeFile, runtimeCode + '\nexport { makeRuntime };\n')
  }
  const require = createRequire(join(snapshot, 'apps/web/package.json'))
  const { build: compile } = await import(pathToFileURL(require.resolve('vite')))
  const { default: solid } = await import(pathToFileURL(require.resolve('vite-plugin-solid')))
  const { default: tailwind } = await import(pathToFileURL(require.resolve('@tailwindcss/vite')))
  await compile({ configFile: false, root: join(snapshot, 'apps/web'), base: '/__orca-isolated/', logLevel: 'warn', plugins: [(solid.default ?? solid)(), tailwind()] })
  const html = await readFile(join(snapshot, 'apps/web/dist/index.html'), 'utf8')
  const script = html.match(/src="\/__orca-isolated([^"?]+\.js)"/)?.[1]
  const css = [...html.matchAll(/href="\/__orca-isolated([^"?]+\.css)"/g)].map(match => match[1])
  if (!script) throw Error('The worktree build has no application entry')
  const prefix = id.replaceAll('-', '.')
  const router = await readFile(join(snapshot, 'apps/web/src/main.tsx'), 'utf8')
  const routes = new Set([...router.matchAll(/\bpath:\s*["']([^"']+)["']/g)].map(match => match[1]))
  const screens = liveScenarios().filter(row => routes.has(row.route)), ids = new Set(screens.map(row => row.id))
  if (!screens.length) throw Error('This worktree has no supported registered routes')
  const scenarios = []
  for (const row of screens) {
    let component = row.component
    try { await access(join(snapshot, component)) } catch (error) { if (error.code !== 'ENOENT') throw error; component = 'apps/web/src/routes/pages.tsx' }
    scenarios.push({ ...row, component, id: row.id.replace('orca.live', prefix), journey: 'Orca', section: 'Screens', preview: 'isolated', behavior: 'Actual worktree implementation with synthetic data; model and host commands disabled.', edges: row.edges.filter(edge => ids.has(edge.destination)).map(edge => ({ ...edge, destination: edge.destination.replace('orca.live', prefix) })) })
  }
  const manifest = { version: 1, id, name: 'Orca worktree', adapter: { kind: 'orca-isolated', entry: 'preview.mjs', runtime: 'runtime.mjs' }, sources: ['apps/web/src', 'apps/server/src', 'packages/contracts/src'], scenarios: 'civic.scenarios.json', coverage: 'civic.coverage.json', personas: [{ id: 'owner', label: 'Synthetic owner' }], roles: [{ id: 'owner', label: 'Isolated writes' }], conditions: [{ id: 'normal', label: 'Synthetic database; no model or host actions' }], navigation: ['Screens', 'Components'] }
  const save = (name, value, root = build) => writeFile(join(root, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  await save('civic.project.json', manifest)
  await save('civic.scenarios.json', scenarios)
  let settings = true
  try { await access(join(snapshot, 'apps/server/src/settings.ts')) } catch (error) { if (error.code !== 'ENOENT') throw error; settings = false }
  await save('receipt.json', { source: snapshot, ui: tree.revision, server: tree.revision, script, css, screenDrafts: true, settings })
  for (const [from, to] of [['orca-isolated-preview.mjs', 'preview.mjs'], ['orca-isolated-runtime.mjs', 'runtime.mjs']]) await cp(new URL(from, import.meta.url), join(build, to))
  await registerComponents(build, snapshot, prefix.replace(/^orca\./, ''), 'Components', { allowMissing: true })
  if (hash !== await worktreeHash(tree.path)) throw Error('Worktree changed while building. The previous preview is retained; reopen Versions to retry.')
  const builtManifest = await json(join(build, 'civic.project.json'))
  const published = { ...builtManifest, adapter: { ...manifest.adapter, entry: `${buildName}/preview.mjs`, runtime: `${buildName}/runtime.mjs` }, scenarios: `${buildName}/civic.scenarios.json` }
  // Keep coverage, reviews and recordings in the stable connection, across rebuilds.
  try { await writeFile(join(folder, 'civic.coverage.json'), '{"version":1,"targets":[]}\n', { flag: 'wx', mode: 0o600 }) } catch (error) { if (error.code !== 'EEXIST') throw error }
  const name = tree.branch === 'main' ? 'Main' : tree.branch?.replace(/^orca\/lane-([a-z])-/, 'Draft $1 · ').replace(/^orca\//, '').replace(/-[a-f0-9]{8}$/, '').replaceAll('-', ' ') ?? `Local edits (${tree.path.split('/').at(-2)})`
  await save('receipt.json', { ...await json(join(build, 'receipt.json')), source: tree.path, worktreeName: name, worktreeHash: hash, worktreeBuild: buildName, dirty: tree.dirty, builtAt: new Date().toISOString() }, folder)
  const temporary = join(folder, `project-${randomUUID()}.tmp`)
  await writeFile(temporary, JSON.stringify(published, null, 2) + '\n', { mode: 0o600 })
  await rename(temporary, connection.manifest)
  return connection
}
export function worktreeConnections(store, installed) {
  let pending, checked = 0, result = { connections: [], errors: [] }
  return async () => {
    if (pending) return pending
    if (Date.now() - checked < 10000) return result
    pending = (async () => {
      const discovered = await gitSources(installed, 'apps/web/src', new Set([installed]))
      const next = { connections: [], errors: [] }
      if (discovered.limited) next.errors.push('Some worktree statuses are unavailable. Those checkouts have not been built automatically.')
      for (const tree of discovered.items.filter(row => row.type === 'worktree' && row.active && row.path !== installed && row.detail !== 'Status unavailable')) {
        try { next.connections.push(await buildWorktree(store, installed, tree)) }
        catch (error) { next.errors.push(`${tree.title}: preview unavailable. ${error.message}`) }
      }
      checked = Date.now(); result = next; return next
    })().finally(() => { pending = null })
    return pending
  }
}
