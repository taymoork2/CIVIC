import { randomUUID } from 'node:crypto'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
import { homedir } from 'node:os'
import { checkedProject, checkedScenarios, loadProject, manifestIn, projectPath, publicProject } from './review-project.mjs'
import { discoverScreens, generatedScenarios } from './review-discovery.mjs'

const bad = (message) => { throw Object.assign(Error(message), { status: 400 }) }
const json = async (file) => JSON.parse(await readFile(file, 'utf8'))
async function atomic(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  await rename(temporary, file)
}

// Connections and starters belong to the review host. Connecting never writes into an app checkout.
// The host supplies the runtime that mounts discovered screens and the starter project it copies.
export async function projectPicker(repo, current, { discoveredAdapter = join(repo, 'packages/canvas/src/discovered-adapter.tsx'), starterTemplate = join(repo, 'packages/canvas/examples/notebook'), kinds = null } = {}) {
  const store = join(repo, '.review-data/project-picker.json')
  await mkdir(dirname(store), { recursive: true, mode: 0o700 })
  let rows
  try { rows = await json(store) } catch (error) { if (error.code !== 'ENOENT') throw error; rows = [] }
  if (!Array.isArray(rows)) throw Error('Invalid project connection store')
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
  return {
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
          if (!rows.some((row) => row.key === project.key)) { rows.push(record(project)); await atomic(store, rows) }
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
      const connection = await this.add({ kind: 'existing', root: discovery.root, source: discovery.source, name: input.name }, true)
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
      return { active: current.key, projects: await Promise.all(rows.map(async (row) => {
        try { const p = await validate(row.manifest, row.root); return { ...publicProject(p), root: p.root, manifest: p.manifestPath, available: true } }
        catch (error) { return { ...row, name: row.root.split('/').at(-1), available: false, error: error.message } }
      })) }
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
          if (!rows.some((row) => row.key === project.key)) { rows.push(record(project)); await atomic(store, rows) }
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
      const folder = join(owned, id)
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
      rows.push(record(project)); await atomic(store, rows)
      return { key: project.key, name: project.manifest.name, preview: Boolean(project.entry) }
    },
    async select(key) {
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
      return { key: project.key, name: project.manifest.name, restarting: project.key !== current.key }
    },
  }
}
