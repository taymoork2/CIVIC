import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadProject, publicProject, checkedScenarios, projectPath } from './review-project.mjs'
import { checkedContract, coverageReport } from './review-coverage.mjs'
import { fixtureHashes } from './review-fixture-hashes.mjs'

const sha = (content) => createHash('sha256').update(content).digest('hex')
const head = (root) => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return null } }
async function files(root) {
  const entries = await readdir(root, { withFileTypes: true })
  return (await Promise.all(entries.filter((entry) => !['node_modules', '.git', '.review-data', 'dist', 'build'].includes(entry.name) && !entry.name.startsWith('.env')).map((entry) => entry.isDirectory() ? files(join(root, entry.name)) : entry.isFile() && /\.(?:[cm]?[jt]sx?|json|css|html|svg|png|webp|jpe?g|woff2?)$/.test(entry.name) ? [join(root, entry.name)] : []))).flat()
}
/**
 * The review index for one connected project. A `module` project is scanned here; any other kind
 * comes from its `connector`, which builds its own index (`connector.inventory`). Either way the
 * index is bound to the manifest, scored against the coverage contract and fingerprinted per screen.
 * `engineRoots` are the host's own review code: it changes every render, so it joins the revision.
 */
export async function reviewInventory(repo, designRoot, appRepo, connection, { connector = null, engineRoots = [join(repo, 'apps/web/src/review'), join(repo, 'apps/web/scripts')] } = {}) {
  const project = connection ?? loadProject(repo, { ...(appRepo ? { applicationRoot: appRepo } : {}) })
  const profile = publicProject(project, connector?.capabilities)
  const kind = project.manifest.adapter.kind
  if (kind !== 'module' && (!connector || connector.kind !== undefined && connector.kind !== kind)) throw Error(`No connector is registered for adapter kind ${kind}`)
  // A connector with its own index (Laundry's) supplies it; one without is indexed from the scenario registry, like a module app.
  if (kind !== 'module' && connector.inventory) {
    const result = await connector.inventory(repo, designRoot, project.root)
    result.metadata.project = profile
    result.metadata.revision.source = sha(result.metadata.revision.source + JSON.stringify(project.manifest))
    result.metadata.fixtureSource = sha(result.metadata.fixtureSource + JSON.stringify(project.manifest))
    if (result.metadata.validation.receipt?.revision?.source !== result.metadata.revision.source) result.metadata.validation.status = 'stale'
    result.metadata.coverage = coverageReport(result.metadata, checkedContract(JSON.parse(await readFile(project.coverageFile, 'utf8'))), new Set(result.evidence.keys()))
    result.metadata.fixtureHashes = fixtureHashes(result.metadata, result.evidence, project, result.metadata.fixtureInputs, connector)
    delete result.metadata.fixtureInputs
    result.metadata.fixtureSource = sha(JSON.stringify(Object.entries(result.metadata.fixtureHashes).sort()))
    return result
  }
  const registry = checkedScenarios(JSON.parse(await readFile(project.scenariosPath, 'utf8')), project)
  const scenarios = registry.map((row) => ({ renderer: project.entry ? 'adapter' : 'legacy', preview: project.entry ? 'working-synthetic' : 'visual-or-partial', implementation: row.component ? 'present' : 'unknown', design: [], checks: [], device: 'unverified', native: 'missing', behavior: 'missing execution evidence', ...row, flow: row.flow ?? `flow:${row.journey}`, section: row.section ?? project.manifest.navigation[0] }))
  const evidence = new Map(), hashes = new Map(), surfaces = []
  const add = async (file, key) => { const content = await readFile(file); hashes.set(key, sha(content)); if (/\.(?:[cm]?[jt]sx?|json|css|html)$/.test(file)) evidence.set(key, content.toString()); return content.toString() }
  for (const file of new Set((await Promise.all([...project.sources, ...(project.publicDir ? [project.publicDir] : [])].map(files))).flat())) {
    const path = relative(project.root, file)
    projectPath(project.root, path)
    const content = await add(file, path)
    if (/\.(test|spec)\./.test(file)) continue
    for (const match of content.matchAll(/(?:export\s+)?function\s+(\w*Sheet\w*)\s*\(/g)) surfaces.push({ id: `${path}#${match[1]}`, name: match[1], path, kind: 'sheet', scenarios: scenarios.filter((s) => s.component === path).map((s) => s.id) })
    for (const match of content.matchAll(/createFileRoute\(['"]([^'"]+)['"]\)/g)) surfaces.push({ id: `route:${match[1]}`, name: match[1], path, kind: 'route', scenarios: scenarios.filter((s) => s.component === path).map((s) => s.id) })
  }
  for (const [name, file] of [['project', project.manifestPath], ['scenarios', project.scenariosPath], ['coverage', project.coverageFile], ...(project.entry ? [['adapter', project.entry]] : [])]) await add(file, `project:${name}`)
  if (project.entry) for (const file of await files(dirname(project.entry))) {
    const path = relative(project.manifestRoot, file)
    projectPath(project.manifestRoot, path)
    await add(file, `adapter:${path}`)
  }
  for (const path of ['package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'tsconfig.json']) {
    try { await add(projectPath(project.root, path, false), path) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  for (const scenario of scenarios) if (scenario.component) scenario.implementation = evidence.has(scenario.component) ? 'present' : 'missing'
  // Local adapter/bootstrap changes also invalidate renders; project code stays read-only.
  for (const root of engineRoots) for (const file of await files(root)) if (!root.endsWith('/scripts') || file.includes('/review-')) await add(file, `rehearsal:${relative(repo, file)}`)
  const shell = resolve(dirname(fileURLToPath(import.meta.resolve('@civic/shell/server'))), '..')
  for (const file of await files(shell)) await add(file, `rehearsal:packages/shell/${relative(shell, file)}`)
  const connectorRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  for (const file of await files(connectorRoot)) await add(file, `rehearsal:packages/vite-connector/${relative(connectorRoot, file)}`)
  const design = { project: project.manifest.design?.id ?? project.manifest.id, hashes: {}, reconciliation: 'Design references require separate verification' }
  for (const path of project.manifest.design?.files ?? []) {
    try { const file = designRoot && projectPath(designRoot, path); design.hashes[path] = file ? sha(await readFile(file)) : null; if (file) evidence.set(`design:${path}`, await readFile(file, 'utf8')) }
    catch (error) { if (error.code !== 'ENOENT') throw error; design.hashes[path] = null }
  }
  const revision = { head: head(repo) ?? '0'.repeat(40), source: sha(JSON.stringify([...hashes].sort())), capturedAt: new Date().toISOString() }
  let validation = { path: 'docs/design/review-validation.json', status: 'missing', receipt: null }
  try {
    const receipt = JSON.parse(await readFile(join(repo, validation.path), 'utf8'))
    validation = { ...validation, receipt, status: receipt.projectKey === project.key && receipt.revision?.head === revision.head && receipt.revision?.source === revision.source ? 'source-current' : 'stale' }
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const metadata = { project: profile, revision, fixtureSource: revision.source, design, scenarios, surfaces, validation, connection: { rehearsalRoot: repo, applicationRoot: project.root, applicationHead: head(project.root), mode: 'read-only-linked-checkout', refresh: 'Inventory updates automatically; open runs retain their rendered revision.' }, limits: ['Personas, fixtures and journey intent are authored, not inferred.', 'Source-discovered routes and sheets remain unconfirmed; discovery is not exhaustive.', 'The project preview adapter owns its synthetic effects; no production backend is connected.'] }
  const contract = checkedContract(JSON.parse(await readFile(project.coverageFile, 'utf8')))
  metadata.coverage = coverageReport(metadata, contract, new Set(evidence.keys()))
  metadata.fixtureHashes = fixtureHashes(metadata, evidence, project, [...hashes])
  metadata.fixtureSource = sha(JSON.stringify(Object.entries(metadata.fixtureHashes).sort()))
  return { metadata, evidence }
}
