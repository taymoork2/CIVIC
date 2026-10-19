import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

// These bindings are curated from Orca's router and the imported design catalog, not filename guesses.
export const screenBindings = {
  home: ['Home', '04'], project: ['ProjectPage', '05'], work: ['WorkItemPage', '11'],
  session: ['SessionPage', '12'], 'project-settings': ['ProjectSettingsPage', '24'],
  settings: ['AppSettingsPage', '25'], 'new-project': ['AddProject', '03'],
}
export const components = [
  ['segmented', 'Segmented control', 'settings/ui.tsx', 'Segmented', ['claude', 'codex']],
  ['project-tabs', 'Project tabs', 'settings/ui.tsx', 'ProjectTabs', ['work', 'settings']],
  ['modal', 'Dialog', 'shell/Modal.tsx', 'Modal', ['open', 'closed']],
  ['citations', 'Citation cards', 'composer/CitationCards.tsx', 'CitationCards', ['read-only', 'editable', 'expanded', 'empty']],
  ['evidence', 'Evidence panel', 'evidence/EvidencePanel.tsx', 'EvidencePanel', ['recorded', 'dirty', 'empty']],
  ['markdown', 'Markdown', 'Markdown.tsx', 'Markdown', ['message', 'code', 'empty']],
  ['trace', 'Expandable trace', 'transcript/trace.tsx', 'TraceCollapsible', ['collapsed', 'expanded', 'running', 'error']],
]
export function bindScreens(rows, kind) {
  return rows.map(row => {
    const name = kind === 'design' ? Object.keys(screenBindings).find(name => screenBindings[name][1] === row.fixture?.family) : row.fixture?.name
    const binding = screenBindings[name]
    return binding ? { ...row, targetId: `orca.screen.${name}`, ...(kind === 'design' ? {} : { componentId: `orca.web.${binding[0].toLowerCase()}`, componentExport: binding[0] }) } : kind === 'design' && row.fixture?.family ? { ...row, targetId: `orca.study.${row.fixture.family}` } : row
  })
}
export function componentScenarios(prefix, section) {
  return components.flatMap(([name, label, file, componentExport, states]) => states.map(state => ({
    id: `orca.${prefix}.component.${name}.${state}`, label: `${label} · ${state}`,
    journey: label, section, targetId: `orca.component.${name}`, componentId: `orca.web.${name}`,
    component: `apps/web/src/components/${file}`, componentExport,
    viewport: { width: 900, height: 600 }, preview: 'working-synthetic',
    behavior: 'Actual source export with synthetic props; no backend, model or host access.',
    fixture: { component: name, state }, edges: [], captureFields: [],
  })))
}
async function componentSource(source) {
  const hash = createHash('sha256')
  for (const root of ['apps/web/src', 'packages/contracts/src']) {
    const files = (await readdir(join(source, root), { recursive: true })).filter(file => /\.(?:tsx?|css)$/.test(file)).sort()
    for (const file of files) hash.update(root + '/' + file + '\0').update(await readFile(join(source, root, file)))
  }
  for (const file of ['apps/web/package.json', 'pnpm-lock.yaml']) hash.update(await readFile(join(source, file)))
  return hash.digest('hex')
}
export async function componentBuildStatus(result, project) {
  let receipt
  try { receipt = JSON.parse(await readFile(join(project.manifestRoot, 'components-receipt.json'), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return; throw error }
  if (receipt.sourceHash === await componentSource(project.root)) return
  for (const row of result.metadata.scenarios) if (row.fixture?.component) row.fixture = { ...row.fixture, componentError: 'Orca changed since these components were built. Refresh component registration before opening this preview.' }
}
export async function registerComponents(folder, source, prefix, section, { allowMissing = false } = {}) {
  const sourceHash = await componentSource(source)
  const missing = []
  if (allowMissing) for (const component of components) {
    try { await access(join(source, 'apps/web/src/components', component[2])) }
    catch (error) { if (error.code !== 'ENOENT') throw error; missing.push(component) }
  }
  const absent = new Map()
  for (const [, , file, exported] of missing) absent.set(`@orca-specimen/components/${file}`, [...(absent.get(`@orca-specimen/components/${file}`) ?? []), exported])
  const require = createRequire(join(source, 'apps/web/package.json'))
  const { build } = await import(pathToFileURL(require.resolve('vite')))
  const { default: solid } = await import(pathToFileURL(require.resolve('vite-plugin-solid')))
  const { default: tailwind } = await import(pathToFileURL(require.resolve('@tailwindcss/vite')))
  const entry = new URL('./orca-components.tsx', import.meta.url).pathname
  const result = await build({ configFile: false, root: join(source, 'apps/web'), logLevel: 'warn',
    plugins: [{ name: 'civic-unavailable-components', enforce: 'pre', resolveId(id) { if (id.startsWith('\0') && absent.has(id.slice(1))) return id }, load(id) { const names = absent.get(id.slice(1)); if (id.startsWith('\0') && names) return names.map(name => `export function ${name}() { throw Error('This component does not exist in this worktree') }`).join('\n') } }, (solid.default ?? solid)(), tailwind()], resolve: { alias: [
      ...[...absent.keys()].map(id => ({ find: id, replacement: '\0' + id })),
      { find: '@orca-specimen', replacement: join(source, 'apps/web/src') },
      { find: /^solid-js$/, replacement: join(source, 'apps/web/node_modules/solid-js/dist/solid.js') },
      { find: /^solid-js\/internal$/, replacement: join(source, 'apps/web/node_modules/solid-js/dist/internal.js') },
      { find: /^@solidjs\/web$/, replacement: join(source, 'apps/web/node_modules/@solidjs/web/dist/web.js') },
    ] },
    build: { write: false, minify: false, lib: { entry, formats: ['es'], fileName: () => 'components.js' },
      rolldownOptions: { output: { codeSplitting: false } } },
  })
  const output = (Array.isArray(result) ? result[0] : result).output
  if (sourceHash !== await componentSource(source)) throw Error('Orca source changed during component compilation. Registration was not changed; retry after the source settles.')
  const files = {}
  for (const item of output) {
    const bytes = item.type === 'chunk' ? item.code : item.source
    files[item.fileName] = createHash('sha256').update(bytes).digest('hex')
    await writeFile(join(folder, item.fileName), bytes, { mode: 0o600 })
  }
  const css = output.filter(item => item.fileName.endsWith('.css')).map(item => item.fileName)
  await writeFile(join(folder, 'component-preview.mjs'), `import { mount as render } from './components.js'\nexport function mount(container, context) {\n  const links = ${JSON.stringify(css)}.map(file => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL(file, import.meta.url).href; document.head.append(link); return link })\n  const stop = render(container, context)\n  return () => { stop(); links.forEach(link => link.remove()) }\n}\n`)
  const rows = JSON.parse(await readFile(join(folder, 'civic.scenarios.json'), 'utf8'))
  const registered = componentScenarios(prefix, section).filter(row => !missing.some(component => component[0] === row.fixture.component))
  const next = [...bindScreens(rows.filter(row => !registered.some(specimen => specimen.id === row.id)), prefix), ...registered]
  await writeFile(join(folder, 'civic.scenarios.json'), JSON.stringify(next, null, 2) + '\n')
  const manifestFile = join(folder, 'civic.project.json'), manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  if (!manifest.navigation.includes(section)) { manifest.navigation.push(section); await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n') }
  await writeFile(join(folder, 'components-receipt.json'), JSON.stringify({ source, sourceHash, files, components, registered: registered.map(row => row.id), builtAt: new Date().toISOString() }, null, 2) + '\n')
  return registered.length
}

export async function registerOrcaDrafts(store, source) {
  const registry = JSON.parse(await readFile(join(store, '.review-data/project-picker.json'), 'utf8'))
  const backup = join(store, 'migrations', `orca-drafts-${Date.now()}`)
  await mkdir(backup, { recursive: true })
  let count = 0
  for (const row of registry) {
    if (row.app?.id !== 'orca') continue
    const folder = join(row.manifest, '..'), manifest = JSON.parse(await readFile(row.manifest, 'utf8'))
    const original = await readFile(join(folder, manifest.scenarios), 'utf8')
    await writeFile(join(backup, `${row.key}.scenarios.json`), original)
    await writeFile(join(backup, `${row.key}.project.json`), JSON.stringify(manifest, null, 2))
    if (row.kind === 'design') await writeFile(join(folder, manifest.scenarios), JSON.stringify(bindScreens(JSON.parse(original), 'design'), null, 2) + '\n')
    else if (['orca-live', 'orca-isolated'].includes(manifest.adapter.kind)) {
      count += await registerComponents(folder, source, row.kind === 'live' ? 'live' : 'isolated', 'Components')
      const template = await readFile(new URL(manifest.adapter.kind === 'orca-live' ? './orca-live-preview.mjs' : './orca-isolated-preview.mjs', import.meta.url), 'utf8')
      await writeFile(join(folder, manifest.adapter.entry), template)
    }
  }
  return { components: components.length, previews: count, backup }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2] || !process.argv[3]) throw Error('Use: node orca-drafts.mjs CIVIC_STORE ORCA_SOURCE')
  console.log(await registerOrcaDrafts(process.argv[2], process.argv[3]))
}
