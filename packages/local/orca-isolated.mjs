import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadProject } from '@civic/vite-connector/project'
import { projectPicker } from '@civic/vite-connector/projects'
import { reviewInventory } from '@civic/vite-connector/inventory'
import { liveScenarios, allowedAsset } from './orca-live.mjs'
import { componentBuildStatus, registerComponents } from './orca-drafts.mjs'
import { checkRuntimeDependencies } from './orca-worktrees.mjs'

export async function connectIsolatedOrca(store, source, receipt) {
  await checkRuntimeDependencies(source)
  const folder = join(store, 'projects/orca-isolated')
  await mkdir(folder, { recursive: true, mode: 0o700 })
  const json = (name, value) => writeFile(join(folder, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  const scenarios = liveScenarios().filter(row => !['orca.live.work', 'orca.live.session'].includes(row.id)).map(row => ({ ...row, id: row.id.replace('.live.', '.isolated.'), journey: 'Orca · isolated user journey', section: 'Isolated implementation', preview: 'isolated', behavior: 'Synthetic backend; authored assertions required', edges: row.edges.filter(edge => !['orca.live.work', 'orca.live.session'].includes(edge.destination)).map(edge => ({ ...edge, destination: edge.destination.replace('.live.', '.isolated.') })) }))
  await json('civic.scenarios.json', scenarios)
  try { await writeFile(join(folder, 'civic.coverage.json'), '{"version":1,"targets":[]}\n', { mode: 0o600, flag: 'wx' }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  await json('receipt.json', { source, ui: receipt.ui, server: receipt.server, script: receipt.script, css: receipt.css })
  for (const [from, to] of [['orca-isolated-preview.mjs', 'preview.mjs'], ['orca-isolated-runtime.mjs', 'runtime.mjs']]) await copyFile(new URL(from, import.meta.url), join(folder, to))
  await json('civic.project.json', { version: 1, id: 'orca-isolated', name: 'Orca · isolated implementation', adapter: { kind: 'orca-isolated', entry: 'preview.mjs', runtime: 'runtime.mjs' }, sources: ['apps/web/src', 'apps/server/src', 'packages/contracts/src'], scenarios: 'civic.scenarios.json', coverage: 'civic.coverage.json', personas: [{ id: 'owner', label: 'Synthetic owner' }], roles: [{ id: 'owner', label: 'Isolated writes' }], conditions: [{ id: 'normal', label: 'Synthetic database; no models or host commands' }], navigation: ['Isolated implementation'] })
  await registerComponents(folder, source, 'isolated', 'Components')
  const project = loadProject(store, { manifest: join(folder, 'civic.project.json'), applicationRoot: source })
  const picker = await projectPicker(store, project, { kinds: ['module', 'laundry', 'orca-live', 'orca-isolated'] })
  await picker.organize({ key: project.key, app: { id: 'orca', name: 'Orca' }, kind: 'isolated' })
  await picker.select(project.key)
  return project.key
}
export const isolatedOrcaConnector = {
  kind: 'orca-isolated', sharedStore: () => false,
  capabilities: { resize: true, record: true, replay: false, reason: 'Orca protocol replay is not supported. Use authored behavior checks.' },
  async inventory(store, designRoot, appRoot, project = loadProject(store)) {
    const receipt = JSON.parse(await readFile(join(project.manifestRoot, 'receipt.json'), 'utf8'))
    const frozenRoot = receipt.worktreeBuild && join(project.manifestRoot, receipt.worktreeBuild, 'source')
    const frozen = frozenRoot ? { ...project, root: frozenRoot, sources: project.manifest.sources.map(path => join(frozenRoot, path)) } : project
    const result = await reviewInventory(store, designRoot, appRoot, frozen, { connector: { kind: 'orca-isolated' }, engineRoots: [fileURLToPath(new URL('.', import.meta.url))] })
    await componentBuildStatus(result, frozen)
    if (receipt.worktreeBuild) result.metadata.revision.head = receipt.ui
    if (receipt.gaps) result.metadata.connection = { ...result.metadata.connection, gaps: receipt.gaps }
    result.metadata.connection = { ...result.metadata.connection, applicationRoot: project.root, applicationHead: receipt.ui, ...(receipt.worktreeHash ? { capturedSource: receipt.worktreeHash, refresh: 'Frozen checkout preview. Reopen Versions to capture local changes.' } : {}), mode: 'isolated', description: 'Actual Orca UI/store/runtime; synthetic SQLite per run. Model dispatch and host commands are unavailable.' }
    return result
  },
}
export function isolatedOrcaAssets({ source, store, project: connection = {} }) {
  return { name: 'civic-isolated-orca-assets', enforce: 'pre', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const icon = req.url === '/icon.svg'
      if (!icon && !req.url?.startsWith('/__orca-isolated/')) return next()
      const url = new URL(req.url, 'http://127.0.0.1'), path = icon ? '/icon.svg' : url.pathname.slice('/__orca-isolated'.length)
      if (req.method !== 'GET' || url.search && url.search !== '?import' || !icon && !allowedAsset(path)) { res.writeHead(404).end(); return }
      try {
        const project = loadProject(store, connection)
        if (icon && project.manifest.adapter.kind !== 'orca-isolated') return next()
        const receipt = JSON.parse(await readFile(join(project.manifestRoot, 'receipt.json'), 'utf8'))
        const root = receipt.worktreeBuild ? join(project.manifestRoot, receipt.worktreeBuild, 'source/apps/web/dist') : join(source, 'apps/web/dist')
        const data = await readFile(join(root, path)); res.writeHead(200, { 'content-type': path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream', 'cache-control': 'no-store' }); res.end(data)
      }
      catch { res.writeHead(404).end() }
    })
  } }
}
