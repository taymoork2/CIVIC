import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { access, cp, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { liveScenarios } from './orca-live.mjs'
import { registerComponents } from './orca-drafts.mjs'
import { checkDependencyLock } from './worktree-dependencies.mjs'

const inputs = ['apps/web/src', 'apps/web/public', 'apps/web/index.html', 'apps/web/package.json', 'apps/server/src', 'apps/server/package.json', 'packages/contracts/src', 'packages/contracts/package.json', 'scripts', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']
const json = async file => JSON.parse(await readFile(file, 'utf8'))
const runFile = promisify(execFile)

export async function reactScreens(source) {
  const routes = new Map()
  for (const file of await readdir(join(source, 'apps/web/src/routes'))) {
    if (!file.endsWith('.tsx')) continue
    const component = `apps/web/src/routes/${file}`, code = await readFile(join(source, component), 'utf8')
    const declared = code.match(/createFileRoute\(["']([^"']+)["']\)/)?.[1]
    if (declared) routes.set(declared.replace(/\$([A-Za-z]+)/g, ':$1').replace(/\/$/, '') || '/', component)
  }
  const extra = [['projects', 'Projects', '/projects'], ['learning', 'Learning', '/learning'], ['project-learning', 'Project learning', '/p/:projectId/learning'], ['problems', 'Problems', '/problems']].map(([name, label, route]) => ({ id: `orca.live.${name}`, label, route, fixture: { name }, edges: [], viewport: { width: 1440, height: 900 }, captureFields: [] }))
  return [...liveScenarios(), ...extra].filter(row => routes.has(row.route)).map(row => ({ ...row, component: routes.get(row.route), componentExport: 'Route', targetId: row.targetId ?? `orca.screen.${row.fixture.name}` }))
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
  let published = false
  try {
    for (const input of inputs) {
      await mkdir(dirname(join(snapshot, input)), { recursive: true })
      try { await cp(join(tree.path, input), join(snapshot, input), { recursive: true, errorOnExist: true }) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    const react = Boolean((await json(join(snapshot, 'apps/web/package.json'))).dependencies?.react)
    if (react) {
      // Install only the frozen copy's locked packages; never run application install scripts.
      const manifest = await json(join(snapshot, 'package.json'))
      delete manifest.packageManager // Use CIVIC's installed pnpm without downloading another manager.
      await writeFile(join(snapshot, 'package.json'), JSON.stringify(manifest))
      await runFile('pnpm', ['install', '--offline', '--frozen-lockfile', '--ignore-scripts', '--config.manage-package-manager-versions=false'], { cwd: snapshot, timeout: 120000, maxBuffer: 2 * 1024 * 1024 })
    } else await dependencies(snapshot, installed)
    await checkRuntimeDependencies(snapshot)
    const runtimeFile = join(snapshot, 'apps/server/src/runtime.ts'), runtimeCode = await readFile(runtimeFile, 'utf8')
    if (!/export (?:function|const) makeRuntime\b/.test(runtimeCode)) {
      if (!/^function makeRuntime\(/m.test(runtimeCode)) throw Error('This worktree has no supported isolated runtime entry')
      // Older Orca exposes only a layer that starts its dispatcher. Export its factory in build inputs instead.
      await writeFile(runtimeFile, runtimeCode + '\nexport { makeRuntime };\n')
    }
    const require = createRequire(join(snapshot, 'apps/web/package.json'))
    const { build: compile } = await import(pathToFileURL(require.resolve('vite')))
    const { default: framework } = await import(pathToFileURL(require.resolve(react ? '@vitejs/plugin-react' : 'vite-plugin-solid')))
    const { default: tailwind } = await import(pathToFileURL(require.resolve('@tailwindcss/vite')))
    const plugins = [(framework.default ?? framework)(), tailwind()]
    if (react) { const { tanstackRouter } = await import(pathToFileURL(require.resolve('@tanstack/router-plugin/vite'))); plugins.unshift(tanstackRouter({ target: 'react' })) }
    await compile({ configFile: false, root: join(snapshot, 'apps/web'), base: '/__orca-isolated/', logLevel: 'warn', plugins, resolve: { alias: { '@': join(snapshot, 'apps/web/src') } } })
    const html = await readFile(join(snapshot, 'apps/web/dist/index.html'), 'utf8')
    const script = html.match(/src="\/__orca-isolated([^"?]+\.js)"/)?.[1]
    const css = [...html.matchAll(/href="\/__orca-isolated([^"?]+\.css)"/g)].map(match => match[1])
    if (!script) throw Error('The worktree build has no application entry')
    const prefix = id.replaceAll('-', '.')
    const router = await readFile(join(snapshot, 'apps/web/src/main.tsx'), 'utf8')
    const routes = new Set([...router.matchAll(/\bpath:\s*["']([^"']+)["']/g)].map(match => match[1]))
    const screens = react ? await reactScreens(snapshot) : liveScenarios().filter(row => routes.has(row.route)), ids = new Set(screens.map(row => row.id))
    if (!screens.length) throw Error('This worktree has no supported registered routes')
    const scenarios = []
    for (const row of screens) {
      let component = row.component
      try { await access(join(snapshot, component)) } catch (error) { if (error.code !== 'ENOENT') throw error; component = 'apps/web/src/routes/pages.tsx' }
      scenarios.push({ ...row, component, id: row.id.replace('orca.live', prefix), journey: 'Orca', section: 'Screens', preview: 'isolated', behavior: 'Actual worktree implementation with synthetic data; model and host commands disabled.', edges: row.edges.filter(edge => ids.has(edge.destination)).map(edge => ({ ...edge, destination: edge.destination.replace('orca.live', prefix) })) })
    }
    const manifest = { version: 1, id, name: 'Orca worktree', adapter: { kind: 'orca-isolated', entry: 'preview.mjs', runtime: 'runtime.mjs' }, sources: ['apps/web/src', 'apps/server/src', 'packages/contracts/src'], scenarios: 'civic.scenarios.json', coverage: 'civic.coverage.json', personas: [{ id: 'owner', label: 'Synthetic owner' }], roles: [{ id: 'owner', label: 'Isolated writes' }], conditions: [{ id: 'normal', label: 'Synthetic database; no model or host actions' }], navigation: react ? ['Screens'] : ['Screens', 'Components'] }
    const save = (name, value, root = build) => writeFile(join(root, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
    await save('civic.project.json', manifest)
    await save('civic.scenarios.json', scenarios)
    let settings = true
    try { await access(join(snapshot, 'apps/server/src/settings.ts')) } catch (error) { if (error.code !== 'ENOENT') throw error; settings = false }
    await save('receipt.json', { source: snapshot, ui: tree.revision, server: tree.revision, script, css, screenDrafts: true, settings, framework: react ? 'react' : 'solid' })
    for (const [from, to] of [['orca-isolated-preview.mjs', 'preview.mjs'], ['orca-isolated-runtime.mjs', 'runtime.mjs']]) await cp(new URL(from, import.meta.url), join(build, to))
    if (!react) await registerComponents(build, snapshot, prefix.replace(/^orca\./, ''), 'Components', { allowMissing: true })
    if (hash !== await worktreeHash(tree.path)) throw Error('Worktree changed while building. The previous preview is retained; reopen Versions to retry.')
    const builtManifest = await json(join(build, 'civic.project.json'))
    const publishedManifest = { ...builtManifest, adapter: { ...manifest.adapter, entry: `${buildName}/preview.mjs`, runtime: `${buildName}/runtime.mjs` }, scenarios: `${buildName}/civic.scenarios.json` }
    // Keep coverage, reviews and recordings in the stable connection, across rebuilds.
    try { await writeFile(join(folder, 'civic.coverage.json'), '{"version":1,"targets":[]}\n', { flag: 'wx', mode: 0o600 }) } catch (error) { if (error.code !== 'EEXIST') throw error }
    const name = tree.branch === 'main' ? 'Main' : tree.branch?.replace(/^orca\/lane-([a-z])-/, 'Draft $1 · ').replace(/^orca\//, '').replace(/-[a-f0-9]{8}$/, '').replaceAll('-', ' ') ?? `Local edits (${tree.path.split('/').at(-2)})`
    // Keep a validated build once a published receipt can reference it.
    published = true
    await save('receipt.json', { ...await json(join(build, 'receipt.json')), source: tree.path, worktreeName: name, worktreeHash: hash, worktreeBuild: buildName, dirty: tree.dirty, builtAt: new Date().toISOString() }, folder)
    const temporary = join(folder, `project-${randomUUID()}.tmp`)
    await writeFile(temporary, JSON.stringify(publishedManifest, null, 2) + '\n', { mode: 0o600 })
    await rename(temporary, connection.manifest)
    return connection
  } finally {
    if (!published) {
      const target = await realpath(build), base = await realpath(join(folder, 'builds')), cwd = process.cwd()
      if (dirname(target) !== base || cwd === target || cwd.startsWith(target + '/')) throw Error('Unsafe preview cleanup path')
      await rm(target, { recursive: true, force: true })
    }
  }
}
