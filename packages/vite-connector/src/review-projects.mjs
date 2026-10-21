import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
import { homedir } from 'node:os'
import { checkedProject, checkedScenarios, loadProject, manifestIn, projectPath, publicProject } from './review-project.mjs'
import { discoverScreens, generatedScenarios } from './review-discovery.mjs'
import { discoverSourceVersions, figmaFile, previewVersion } from './review-source-versions.mjs'
import { compareVersionScreens } from './review-version-changes.mjs'
import { historyOrder, versionChoices } from '@civic/shell/server'

const bad = (message) => { throw Object.assign(Error(message), { status: 400 }) }
const json = async (file) => JSON.parse(await readFile(file, 'utf8'))
async function atomic(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  await rename(temporary, file)
}

// Connections and starters belong to the review host. Connecting never writes into an app checkout.
// The host supplies the runtime that mounts discovered screens and the starter project it copies.
export async function projectPicker(repo, current, { discoveredAdapter = join(repo, 'packages/canvas/src/discovered-adapter.tsx'), starterTemplate = join(repo, 'packages/canvas/examples/notebook'), sourceRoot = join(homedir(), 'Projects/civic-apps'), kinds = null, workspaces = [], syncConnections, openWindow, releaseWindow, windowOrigins = () => [], registry = {}, readInventory = (_project, content) => JSON.parse(content), capabilitiesFor = () => undefined } = {}) {
  for (const workspace of workspaces) {
    const url = new URL(workspace.origin)
    if (url.origin !== workspace.origin || url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !isAbsolute(workspace.store)) bad('Linked CIVIC workspaces must use a loopback origin and absolute store')
  }
  const store = join(repo, '.review-data/project-picker.json')
  await mkdir(dirname(store), { recursive: true, mode: 0o700 })
  registry.loading ??= json(store).catch(error => { if (error.code !== 'ENOENT') throw error; return [] })
  const rows = await registry.loading
  if (!Array.isArray(rows)) throw Error('Invalid project connection store')
  registry.saving ??= Promise.resolve()
  const persistRows = () => { registry.saving = registry.saving.catch(() => {}).then(() => atomic(store, rows)); return registry.saving }
  const record = (project) => ({ key: project.key, manifest: project.manifestPath, root: project.root })
  const discoveries = new Map()
  if (!rows.some((row) => row.key === current.key)) { rows.push(record(current)); await atomic(store, rows) }
  const validate = async (manifest, root) => {
    const project = loadProject(repo, { manifest, applicationRoot: root })
    if (kinds && !kinds.includes(project.manifest.adapter.kind)) bad(`No connector is registered for adapter kind ${project.manifest.adapter.kind}`)
    checkedScenarios(await json(project.scenariosPath), project)
    const coverage = await json(project.coverageFile)
    if (!Number.isInteger(coverage.version) || coverage.version < 1 || !Array.isArray(coverage.targets)) bad('Use a coverage file with a positive version and targets')
    return project
  }
  const kindOf = project => project.manifest.adapter.mode ? 'live' : project.runtimeEntry ? 'isolated' : project.manifest.design ? 'design' : 'implementation'
  const describe = async (row, host = repo, validateRegistry = true) => {
    try {
      const p = host === repo && validateRegistry ? await validate(row.manifest, row.root) : loadProject(host, { manifest: row.manifest, applicationRoot: row.root })
      const kind = row.kind ?? kindOf(p)
      const version = await previewVersion(p, kind)
      const readiness = { state: p.entry ? 'unchecked' : 'unsupported', ...(version.version.id ? { source: version.version.id } : {}), reason: p.entry ? 'Preview configured; opening it checks whether it mounts.' : 'This connection has no preview adapter.' }
      return { ...publicProject(p, capabilitiesFor(p.manifest.adapter.kind)), root: p.root, manifest: p.manifestPath, design: p.manifest.design, app: row.app ?? { id: p.manifest.id, name: p.manifest.name }, kind, ...version, readiness, refreshRequired: host === repo && p.key === current.key && (p.entry !== current.entry || p.runtimeEntry !== current.runtimeEntry), available: true }
    } catch (error) { return { ...row, app: row.app ?? { id: row.key, name: row.root.split('/').at(-1) }, name: row.root.split('/').at(-1), available: false, error: error.message, readiness: { state: 'failed', reason: error.message } } }
  }
  const assign = (row, input) => {
    const app = input.app
    if (!app || typeof app !== 'object' || !/^[a-z][a-z0-9.-]{0,119}$/.test(app.id) || typeof app.name !== 'string' || !app.name.trim() || app.name.length > 120) bad('Use a stable app identity and name')
    if (!['design', 'live', 'isolated', 'implementation'].includes(input.kind)) bad('Invalid connection kind')
    if (rows.some(other => other.key !== row.key && other.app?.id === app.id && other.app.name !== app.name.trim())) bad('Connections under an app must use the same name')
    row.app = { id: app.id, name: app.name.trim() }; row.kind = input.kind
  }
  const connectedProject = async (key, workspaceOrigin) => {
    const workspace = workspaces.find(workspace => workspace.origin === workspaceOrigin)
    if (workspaceOrigin && !workspace) bad('Unknown CIVIC workspace')
    const saved = workspace ? await json(join(workspace.store, '.review-data/project-picker.json')) : rows
    const row = saved.find(row => row.key === key)
    if (!row) bad('Unknown saved connection')
    return loadProject(workspace?.store ?? repo, { manifest: row.manifest, applicationRoot: row.root })
  }
  let syncing
  const openedOrigins = new Set()
  const sync = async (app = rows.find(row => row.key === current.key)?.app?.id ?? current.manifest.id) => {
    if (!syncConnections) return []
    const result = await syncConnections(app)
    // Merge into the live registry after compilation; edits made during the build stay in it.
    let changed = false
    for (const input of result.connections) {
      const p = await validate(input.manifest, input.root)
      if (!rows.some(row => row.key === p.key)) { const row = record(p); assign(row, input); rows.push(row); changed = true }
    }
    if (changed) await persistRows()
    return result.errors
  }
  const summaries = new Map()
  const pageSync = new Map()
  let lastRefresh
  const summary = ({ personas, roles, conditions, navigation, host, ...row }) => row
  const bounded = async (items, work, signal) => {
    let index = 0
    const results = new Array(items.length)
    await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
      while (index < items.length) {
        signal?.throwIfAborted()
        const at = index++
        results[at] = await work(items[at])
      }
    }))
    signal?.throwIfAborted()
    return results
  }
  const savedConnections = async () => {
    const saved = rows.map(row => ({ row, host: repo })), errors = []
    for (const workspace of workspaces) {
      try { saved.push(...(await json(join(workspace.store, '.review-data/project-picker.json'))).map(row => ({ row: { ...row, workspace: workspace.origin, workspaceName: workspace.name }, host: workspace.store }))) }
      catch { errors.push(`${workspace.name ?? workspace.origin}: saved connections are unavailable. Local connections and evidence are retained.`) }
    }
    return { saved, errors }
  }
  const catalogRows = async signal => {
    const { saved, errors } = await savedConnections()
    const projects = await bounded(saved, async ({ row, host }) => {
      try {
        const manifest = checkedProject(await json(row.manifest))
        return { ...row, host, name: manifest.name, app: row.app ?? { id: manifest.id, name: manifest.name }, kind: row.kind ?? (manifest.adapter.mode ? 'live' : manifest.adapter.runtime ? 'isolated' : manifest.design ? 'design' : 'implementation'), preview: Boolean(manifest.adapter.entry), available: true, capabilities: capabilitiesFor(manifest.adapter.kind), readiness: { state: manifest.adapter.entry ? 'unchecked' : 'unsupported' } }
      } catch (error) { return { ...row, host, name: row.root.split('/').at(-1), app: row.app ?? { id: row.key, name: row.root.split('/').at(-1) }, preview: false, available: false, error: error.message, readiness: { state: 'failed', reason: error.message } } }
    }, signal)
    return { projects, errors }
  }
  const groupedApps = projects => {
    const apps = []
    for (const row of projects) {
      let app = apps.find(app => app.id === row.app.id)
      if (!app) { app = { ...row.app, connections: [], versions: [] }; apps.push(app) }
      app.connections.push(row)
      const identity = { ...row.version, id: row.version?.id ?? `${row.workspace ?? ''}:${row.key}`, name: row.version?.name ?? row.sourceName ?? row.name, kind: row.kind === 'design' ? 'design' : 'implementation' }
      let version = app.versions.find(version => version.id === identity.id)
      if (!version) { version = { ...identity, connections: [] }; app.versions.push(version) }
      version.connections.push(row)
    }
    return apps
  }
  const screens = async (project, signal) => {
    signal?.throwIfAborted()
    const [manifest, content, receipt] = await Promise.all([readFile(project.manifestPath, 'utf8'), readFile(project.scenariosPath, 'utf8'), readFile(join(project.manifestRoot, 'receipt.json'), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return '' })])
    const fingerprint = createHash('sha256').update(JSON.stringify([manifest, content, receipt])).digest('hex')
    const identity = `${project.manifestPath}:${project.root}`
    const cached = summaries.get(identity)
    if (cached?.fingerprint === fingerprint) return cached.screens
    const rows = checkedScenarios(await readInventory(project, content), project).map(({ id, label, component, componentExport, route, targetId, componentId, fixture }) => ({ id, label, component, componentExport, route, ...(targetId ? { targetId } : {}), ...(componentId ? { componentId } : {}), ...(typeof fixture?.state === 'string' ? { state: fixture.state } : {}) }))
    signal?.throwIfAborted()
    summaries.set(identity, { fingerprint, screens: rows })
    return rows
  }
  return {
    async catalog(_input, { signal } = {}) {
      const { projects, errors } = await catalogRows(signal)
      const active = projects.find(row => !row.workspace && row.key === current.key)
      if (active) Object.assign(active, summary(await describe(active, repo, false)))
      const publicRows = projects.map(summary)
      return { active: current.key, projects: publicRows, apps: groupedApps(publicRows), workspaceErrors: errors, canOpenWindow: Boolean(openWindow) }
    },
    async versionPage(input = {}, { signal } = {}) {
      signal?.throwIfAborted()
      const { app, selected, query = '', offset = 0, limit = 10, version } = input
      if (typeof app !== 'string' || app.length > 120 || typeof query !== 'string' || query.length > 120 || !Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 10 || version !== undefined && (typeof version !== 'string' || version.length > 1000)) bad('Invalid version page')
      if (selected !== undefined && (!selected || typeof selected !== 'object' || Array.isArray(selected) || !/^[a-z][a-z0-9.-]{0,119}$/.test(selected.id ?? '') || typeof selected.label !== 'string' || selected.label.length > 200 || Object.keys(selected).some(key => !['id', 'label', 'targetId', 'componentId', 'component', 'componentExport', 'route', 'state'].includes(key)) || Object.values(selected).some(value => typeof value !== 'string' || value.length > 500))) bad('Invalid selected screen identity')
      if (input.refresh !== undefined && (typeof input.refresh !== 'string' || input.refresh !== '' && !/^[a-f0-9-]{36}$/.test(input.refresh))) bad('Invalid version refresh')
      if (input.refresh && input.refresh !== lastRefresh) { summaries.clear(); pageSync.clear(); lastRefresh = input.refresh }
      if (!pageSync.has(app)) pageSync.set(app, sync(app).catch(error => [`Worktree previews could not refresh: ${error.message}. Saved versions are retained.`]))
      const syncErrors = await pageSync.get(app)
      signal?.throwIfAborted()
      const { projects: catalog, errors } = await catalogRows(signal)
      errors.push(...syncErrors)
      const scoped = catalog.filter(row => row.app.id === app)
      if (!scoped.length) bad('Unknown app identity')
      const inventories = {}
      const projects = await bounded(scoped, async row => {
        const described = summary({ ...row, ...await describe(row, row.host, false) })
        if (!described.available) errors.push(`${described.name}: ${described.error}. Retry to check again.`)
        if (selected && described.available) {
          try {
            const project = loadProject(row.host, { manifest: row.manifest, applicationRoot: row.root })
            inventories[`${row.workspace ?? ''}:${row.key}`] = await screens(project, signal)
          } catch (error) { signal?.throwIfAborted(); described.available = false; described.error = error.message; described.readiness = { state: 'failed', reason: error.message }; errors.push(`${described.name}: preview inventory unavailable. Retry to check again.`) }
        }
        return described
      }, signal)
      const versions = groupedApps(projects)[0].versions
      const matches = historyOrder(versionChoices(versions, inventories, selected, current.key, query)).filter(item => version === undefined || item.id === version)
      const items = matches.slice(offset, offset + limit).map(item => ({ ...item, previewCount: item.previews.length, previews: version === undefined ? [item.preview] : item.previews.slice(0, 10) }))
      return { app, items, total: matches.length, offset, limit, hasMore: offset + limit < matches.length, errors }
    },
    windowOrigins() { return [...new Set([...windowOrigins(), ...openedOrigins])] },
    async openWindow(key, workspaceOrigin, lease) {
      if (lease !== undefined && !/^[a-f0-9-]{36}$/.test(lease)) bad('Invalid project host lease')
      if (!openWindow) bad('This CIVIC host does not support independent project windows')
      let url
      if (workspaceOrigin) {
        const workspace = workspaces.find(workspace => workspace.origin === workspaceOrigin)
        if (!workspace) bad('Unknown CIVIC workspace')
        await connectedProject(key, workspaceOrigin)
        const selected = await json(join(workspace.store, '.review-data/application.json'))
        const active = loadProject(workspace.store, { manifest: selected.project, applicationRoot: selected.root })
        const accessKey = (await readFile(join(workspace.store, '.review-data/projects', active.key, 'access-key'), 'utf8')).trim()
        const response = await fetch(`${workspace.origin}/api/review/projects`, { method: 'POST', headers: { authorization: `Bearer ${accessKey}`, 'x-rehearsal-project': active.key, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'open-window', key, lease }), signal: AbortSignal.timeout(30_000) })
        const result = await response.json()
        if (!response.ok) throw Object.assign(Error(result.error ?? 'The workspace could not open a project window'), { status: response.status })
        url = result.url
      } else {
        const row = rows.find(row => row.key === key)
        if (!row) bad('Unknown saved connection')
        url = await openWindow(await validate(row.manifest, row.root), lease)
      }
      const destination = new URL(url)
      if (destination.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(destination.hostname) || destination.username || destination.password || destination.pathname !== '/review' || destination.search || destination.hash) bad('Project windows must use a local CIVIC review origin')
      openedOrigins.add(destination.origin)
      return { url: destination.href }
    },
    async releaseWindow(key, workspaceOrigin, lease) {
      if (!/^[a-f0-9-]{36}$/.test(lease ?? '')) bad('Invalid project host lease')
      if (workspaceOrigin) {
        const workspace = workspaces.find(workspace => workspace.origin === workspaceOrigin)
        if (!workspace) bad('Unknown CIVIC workspace')
        await connectedProject(key, workspaceOrigin)
        const selected = await json(join(workspace.store, '.review-data/application.json'))
        const active = loadProject(workspace.store, { manifest: selected.project, applicationRoot: selected.root })
        const accessKey = (await readFile(join(workspace.store, '.review-data/projects', active.key, 'access-key'), 'utf8')).trim()
        const response = await fetch(`${workspace.origin}/api/review/projects`, { method: 'POST', headers: { authorization: `Bearer ${accessKey}`, 'x-rehearsal-project': active.key, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'release-window', key, lease }), signal: AbortSignal.timeout(5000) })
        if (!response.ok) throw Error('The workspace could not release its project host')
        const result = await response.json()
        if (result.closed && result.url) openedOrigins.delete(new URL(result.url).origin)
        return result
      }
      const row = rows.find(row => row.key === key)
      if (!row) bad('Unknown saved connection')
      const result = releaseWindow ? await releaseWindow(await validate(row.manifest, row.root), lease) : { closed: false }
      if (result.closed && result.url) openedOrigins.delete(new URL(result.url).origin)
      return result
    },
    async sourceVersions(input = {}) {
      const list = await this.catalog(), appId = rows.find(row => row.key === current.key)?.app?.id ?? current.manifest.id
      const connections = list.apps.find(app => app.id === appId)?.connections ?? []
      const projects = await Promise.all(connections.filter(row => row.available).map(row => connectedProject(row.key, row.workspace)))
      const links = new Map()
      for (const host of [repo, ...workspaces.map(workspace => workspace.store)]) {
        try { for (const link of (await json(join(host, '.review-data/source-links.json')))[appId] ?? []) links.set(link.key, link) }
        catch (error) { if (host === repo && error.code !== 'ENOENT') throw error }
      }
      return discoverSourceVersions(projects, [...links.values()], { query: input.query ?? '', inactive: input.inactive ?? false, offset: input.offset ?? 0 })
    },
    async linkFigma(input) {
      let link
      try { link = figmaFile(input.url) } catch (error) { bad(error.message) }
      const appId = rows.find(row => row.key === current.key)?.app?.id ?? current.manifest.id
      const file = join(repo, '.review-data/source-links.json')
      let links = {}
      try { links = await json(file) } catch (error) { if (error.code !== 'ENOENT') throw error }
      const saved = links[appId] ?? []
      if (!saved.some(row => row.key === link.key)) {
        if (saved.length >= 10) bad('Ten Figma files are already connected to this app')
        links[appId] = [...saved, link]; await atomic(file, links)
      }
      return { linked: true }
    },
    async organize(input) {
      const row = rows.find(row => row.key === input.key)
      if (!row) bad('Unknown saved connection')
      assign(row, input); await persistRows()
      return { key: row.key, app: row.app, kind: row.kind }
    },
    async scenarios(key, workspaceOrigin) {
      const project = await connectedProject(key, workspaceOrigin)
      const screens = checkedScenarios(await json(project.scenariosPath), project)
      return screens.map(({ id, label, component, componentExport, route, targetId, componentId, fixture }) => ({ id, label, component, componentExport, route, ...(targetId ? { targetId } : {}), ...(componentId ? { componentId } : {}), ...(typeof fixture?.state === 'string' ? { state: fixture.state } : {}) }))
    },
    async changes(input, { signal } = {}) {
      signal?.throwIfAborted()
      if (typeof input.scenario !== 'string' || !Array.isArray(input.candidates) || input.candidates.length > 10 || new Set(input.candidates.map(row => row?.id)).size !== input.candidates.length) bad('Compare up to ten unique registered previews')
      const baseRows = checkedScenarios(await json(current.scenariosPath), current)
      const app = rows.find(row => row.key === current.key)?.app?.id ?? current.manifest.id
      const comparisons = []
      // Bound parser memory; each comparison reads snapshots without executing application code.
      for (const candidate of input.candidates) {
        signal?.throwIfAborted()
        if (!candidate || typeof candidate.id !== 'string' || candidate.id.length > 600 || typeof candidate.key !== 'string' || typeof candidate.scenario !== 'string') bad('Invalid preview comparison')
        const project = await connectedProject(candidate.key, candidate.workspace)
        if ((project.app?.id ?? project.manifest.id) !== app) bad('Compare versions within the selected app')
        const candidateRows = checkedScenarios(await json(project.scenariosPath), project)
        comparisons.push({ id: candidate.id, ...await compareVersionScreens(current, project, baseRows, candidateRows, input.scenario, candidate.scenario, signal) })
      }
      return { scenario: input.scenario, comparisons }
    },
    async sources(key, workspaceOrigin) {
      const project = await connectedProject(key, workspaceOrigin)
      let reference = project.manifest.design ? { project: project.manifest.design.id, files: project.manifest.design.files } : null
      if (project.manifest.design) {
        try { const receipt = await json(join(project.manifestRoot, 'receipt.json')); reference = { ...reference, source: receipt.source, revision: receipt.sourceHead, capturedAt: receipt.capturedAt } }
        catch (error) { if (error.code !== 'ENOENT') throw error }
      }
      const root = reference?.source ?? project.root
      let worktrees = [], unavailable = ''
      try {
        const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 3000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
        if (realpathSync(git(['rev-parse', '--show-toplevel'])) !== realpathSync(root)) throw Error('This is a reference folder, rather than a Git checkout')
        worktrees = git(['worktree', 'list', '--porcelain', '-z']).split('\0\0').filter(Boolean).map(block => Object.fromEntries(block.split('\0').filter(Boolean).map(line => { const index = line.indexOf(' '); return index < 0 ? [line, true] : [line.slice(0, index), line.slice(index + 1)] }))).map(row => ({ path: row.worktree, head: row.HEAD, branch: row.branch ?? null }))
      } catch { unavailable = 'Git worktree information is unavailable for this source.' }
      return { root, reference, worktrees, unavailable }
    },
    async discover(input) {
      if (typeof input.root !== 'string' || !isAbsolute(input.root)) bad('Enter an absolute app folder path on the CIVIC review host')
      let root
      try { root = realpathSync(input.root.trim()) } catch { bad('App folder was not found on this host') }
      if (!statSync(root).isDirectory() || root === parse(root).root || root === homedir()) bad('Choose an app folder')
      const existing = rows.toReversed().find((row) => row.root === root)
      if (input.manifest?.trim() || existsSync(manifestIn(root)) || existing) {
        const manifest = input.manifest?.trim() ? projectPath(root, input.manifest.trim()) : existsSync(manifestIn(root)) ? manifestIn(root) : existing.manifest
        const project = await validate(manifest, root)
        if (project.entry) {
          if (!rows.some((row) => row.key === project.key)) { rows.push(record(project)); await persistRows() }
          if (input.app) await this.organize({ key: project.key, app: input.app, kind: input.connectionKind ?? kindOf(project) })
          return { connection: { key: project.key, name: project.manifest.name, preview: true } }
        }
        input = { ...input, source: project.manifest.sources[0] }
      }
      if (typeof input.source !== 'string') bad('Enter a relative source folder')
      const source = input.source.trim()
      const result = await discoverScreens(root, source)
      const id = randomUUID()
      if (discoveries.size >= 10) discoveries.delete(discoveries.keys().next().value)
      discoveries.set(id, { root, source, ...result })
      return { discovery: { id, ...result } }
    },
    async generate(input) {
      const discovery = discoveries.get(input.discovery)
      if (!discovery) bad('Discovery expired. Scan the app again.')
      const fresh = await discoverScreens(discovery.root, discovery.source)
      if (fresh.sourceHash !== discovery.sourceHash || input.sourceHash !== discovery.sourceHash) throw Object.assign(Error('Source changed since discovery. Scan again before generating.'), { status: 409 })
      const scenarios = generatedScenarios(discovery, input)
      checkedScenarios(scenarios, { root: discovery.root, manifest: { adapter: { kind: 'module' }, navigation: ['Start', 'Main'] } })
      const connection = await this.add({ kind: 'existing', root: discovery.root, source: discovery.source, name: input.name, app: input.app }, true)
      const row = rows.find((row) => row.key === connection.key)
      const folder = dirname(row.manifest)
      const manifest = await json(row.manifest)
      if (!folder.startsWith(join(repo, 'rehearsal-projects') + '/') || manifest.adapter.entry) bad('Generated integrations must be new, owned connections')
      const screens = scenarios.map((scenario) => {
        const candidate = discovery.candidates.find((candidate) => candidate.id === scenario.id)
        return { ...scenario, source: '/@fs/' + projectPath(discovery.root, candidate.file), assetRoot: '/@fs/' + projectPath(discovery.root, discovery.source) + '/', kind: candidate.kind, export: candidate.export, route: candidate.route }
      })
      const runtime = discoveredAdapter
      await atomic(join(folder, 'civic.scenarios.json'), scenarios)
      await atomic(join(folder, 'discovered.screens.json'), screens)
      await atomic(join(folder, 'discovery.evidence.json'), { ...fresh, generatedAt: new Date().toISOString(), selected: input.selected })
      await atomic(join(folder, 'civic.coverage.json'), { version: 1, targets: discovery.candidates.filter((candidate) => !input.selected.includes(candidate.id)).map((candidate) => ({ id: `discovered.${candidate.id}`, title: candidate.label, kind: 'screen', scenarios: [], acceptance: [candidate.reason, 'Connect app-specific synthetic context and verify its entry, exit, failure and return paths.'] })) })
      await writeFile(join(folder, 'rehearsal.ts'), `import { mountDiscovered } from ${JSON.stringify('/@fs/' + runtime)}\nimport screens from './discovered.screens.json'\nexport const mount = (container, context) => mountDiscovered(container, context, screens)\n`, { flag: 'wx', mode: 0o600 })
      await atomic(row.manifest, { ...manifest, adapter: { kind: 'module', entry: 'rehearsal.ts' }, aliases: { '@': discovery.source } })
      await validate(row.manifest, row.root)
      return { ...connection, preview: true, generated: true, screens: screens.length, paths: scenarios.reduce((total, screen) => total + screen.edges.length, 0) }
    },
    async list() {
      syncing ??= sync().catch(error => [`Worktree previews could not refresh: ${error.message}. Saved versions are retained.`]).finally(() => { syncing = null })
      const syncErrors = await syncing
      const projects = await Promise.all(rows.map(row => describe(row)))
      const workspaceErrors = [...syncErrors]
      for (const workspace of workspaces) {
        try {
          const linked = await json(join(workspace.store, '.review-data/project-picker.json'))
          projects.push(...await Promise.all(linked.map(async row => ({ ...await describe(row, workspace.store), workspace: workspace.origin, workspaceName: workspace.name }))))
        } catch { workspaceErrors.push(`${workspace.name ?? workspace.origin}: saved connections are unavailable. Local connections and evidence are retained.`) }
      }
      const apps = groupedApps(projects)
      return { active: current.key, projects, apps, workspaceErrors, canOpenWindow: Boolean(openWindow) }
    },
    async add(input, ownedOnly = false) {
      if (!input || !['existing', 'new'].includes(input.kind)) bad('Choose an existing app or a new project')
      let root, manifest
      if (input.kind === 'existing') {
        if (typeof input.root !== 'string' || !isAbsolute(input.root) || input.root.length > 2000) bad('Enter an absolute app folder path on the CIVIC review host')
        try { root = realpathSync(input.root.trim()) } catch { bad('App folder was not found on this host') }
        if (!statSync(root).isDirectory() || root === parse(root).root || root === homedir()) bad('Choose an app folder, rather than a home or filesystem root')
        if (input.manifest && typeof input.manifest !== 'string') bad('Invalid manifest path')
        manifest = input.manifest?.trim() ? projectPath(root, input.manifest.trim()) : manifestIn(root)
        if (!ownedOnly && (input.manifest?.trim() || existsSync(manifest))) {
          const project = await validate(manifest, root)
          if (!rows.some((row) => row.key === project.key)) { rows.push(record(project)); await persistRows() }
          if (input.app) await this.organize({ key: project.key, app: input.app, kind: input.connectionKind ?? kindOf(project) })
          return { key: project.key, name: project.manifest.name, preview: Boolean(project.entry) }
        }
        if (typeof input.source !== 'string') bad('Enter a source folder relative to the app folder')
        const source = projectPath(root, input.source.trim())
        if (!statSync(source).isDirectory()) bad('Source must be a folder')
      }
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) bad('Enter a project name, up to 120 characters')
      const id = `project-${randomUUID()}`
      const owned = join(repo, 'rehearsal-projects')
      await mkdir(owned, { recursive: true, mode: 0o700 })
      if (realpathSync(owned) !== resolve(owned)) bad('CIVIC project storage must not be a symlink')
      const folder = join(input.kind === 'new' ? resolve(sourceRoot) : owned, id)
      await mkdir(dirname(folder), { recursive: true, mode: 0o700 })
      await mkdir(folder, { mode: 0o700 })
      if (input.kind === 'new') {
        const template = starterTemplate
        for (const file of ['src', 'civic.project.json', 'civic.scenarios.json', 'civic.coverage.json']) await cp(join(template, file), join(folder, file), { recursive: true, errorOnExist: true, force: false })
        root = folder
        const starter = await json(join(folder, 'civic.project.json'))
        await atomic(join(folder, 'civic.project.json'), { ...starter, id, name: input.name.trim() })
      } else {
        const descriptor = checkedProject({ version: 1, id, name: input.name.trim(), adapter: { kind: 'module' }, sources: [input.source.trim()], scenarios: 'civic.scenarios.json', coverage: 'civic.coverage.json', personas: [{ id: 'default', label: 'Default synthetic situation' }], roles: [{ id: 'reviewer', label: 'Reviewer' }], conditions: [{ id: 'normal', label: 'Normal' }], navigation: ['Start', 'Main'] })
        for (const [file, data] of Object.entries({ 'civic.project.json': descriptor, 'civic.scenarios.json': [], 'civic.coverage.json': { version: 1, targets: [] } })) await atomic(join(folder, file), data)
      }
      const project = await validate(join(folder, 'civic.project.json'), root)
      const row = record(project)
      if (input.app) assign(row, { ...input, kind: input.connectionKind ?? 'implementation' })
      rows.push(row); await persistRows()
      return { key: project.key, name: project.manifest.name, preview: Boolean(project.entry) }
    },
    async select(key, workspaceOrigin) {
      if (openWindow) {
        if (!workspaceOrigin && key === current.key) {
          const project = await connectedProject(key)
          if (project.entry !== current.entry || project.runtimeEntry !== current.runtimeEntry) return { key, restarting: true }
        }
        return { key, redirect: (await this.openWindow(key, workspaceOrigin)).url }
      }
      if (workspaceOrigin) {
        const workspace = workspaces.find(workspace => workspace.origin === workspaceOrigin)
        if (!workspace) bad('Unknown CIVIC workspace')
        const connections = await json(join(workspace.store, '.review-data/project-picker.json'))
        const target = connections.find(row => row.key === key)
        if (!target || loadProject(workspace.store, { manifest: target.manifest, applicationRoot: target.root }).key !== key) bad('Unknown saved connection')
        const selected = await json(join(workspace.store, '.review-data/application.json'))
        const active = loadProject(workspace.store, { manifest: selected.project, applicationRoot: selected.root })
        const accessKey = (await readFile(join(workspace.store, '.review-data/projects', active.key, 'access-key'), 'utf8')).trim()
        const headers = { authorization: `Bearer ${accessKey}`, 'x-rehearsal-project': active.key, 'content-type': 'application/json' }
        const response = await fetch(`${workspace.origin}/api/review/projects`, { method: 'POST', headers, body: JSON.stringify({ action: 'select', key }), signal: AbortSignal.timeout(5000) })
        const result = await response.json()
        if (!response.ok) throw Object.assign(Error(result.error ?? 'The isolated workspace could not be opened'), { status: response.status })
        for (let attempt = 0; attempt < 60; attempt++) {
          try {
            const selectedKey = (await readFile(join(workspace.store, '.review-data/projects', key, 'access-key'), 'utf8')).trim()
            const ready = await fetch(`${workspace.origin}/api/review/index`, { headers: { authorization: `Bearer ${selectedKey}` }, signal: AbortSignal.timeout(1000) })
            if (ready.ok && (await ready.json()).project.key === key) return { key, redirect: `${workspace.origin}/review` }
          } catch { /* The other CIVIC listener may be restarting. */ }
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        throw Object.assign(Error('The isolated connection was selected but has not reopened. Reload its workspace.'), { status: 503 })
      }
      const row = rows.find((row) => row.key === key)
      if (!row) bad('Unknown saved project')
      const project = await validate(row.manifest, row.root)
      const settings = join(repo, '.review-data/application.json')
      let local = {}
      try { local = await json(settings) } catch (error) { if (error.code !== 'ENOENT') throw error }
      await atomic(settings, { ...local, project: project.manifestPath, root: project.root })
      // Vite rebuilds its aliases, filesystem allowlist and adapter on the same port.
      process.env.CIVIC_PROJECT = project.manifestPath
      process.env.CIVIC_APP_ROOT = project.root
      return { key: project.key, name: project.manifest.name, restarting: project.key !== current.key || project.entry !== current.entry || project.runtimeEntry !== current.runtimeEntry }
    },
  }
}
