import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { referenceInputHashes } from './opendesign-reference-inputs.mjs'
import { coveragePath, checkedContract, coverageReport } from '@civic/vite-connector/coverage'
import { reviewOverlay } from './review-laundry.mjs'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const gitHead = (root) => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return null } }
async function files(root) {
  const entries = await readdir(root, { withFileTypes: true })
  return (await Promise.all(entries.filter((entry) => !['node_modules', '.git', 'dist'].includes(entry.name)).map((entry) => entry.isDirectory() ? files(join(root, entry.name)) : join(root, entry.name)))).flat()
}

/** Source-discovered routes/sheets and named scenarios are separate coverage measures. */
export async function reviewInventory(repo, designRoot, appRepo = repo) {
  const web = join(repo, 'apps/web')
  const appWeb = join(appRepo, 'apps/web')
  const scenarios = JSON.parse(await readFile(join(web, 'src/review/scenarios.json'), 'utf8')).map((scenario) => ({ design: ['DESIGN.md', 'preview/production-patterns.html'], checks: ['apps/web/e2e/review-workspace.spec.ts'], preview: 'working-synthetic', native: 'missing', device: 'unverified', ...scenario }))
  const journeys = [...new Set(scenarios.map((scenario) => scenario.journey))]
  const steps = ['type', 'whose', 'details', 'fabric', 'color', 'origin', 'dye', 'care', 'stain', 'final']
  scenarios.sort((a, b) => journeys.indexOf(a.journey) - journeys.indexOf(b.journey) || (a.renderer === 'intake' && b.renderer === 'intake' ? steps.indexOf(a.step) - steps.indexOf(b.step) : 0))
  for (const scenario of scenarios.filter((scenario) => scenario.id.startsWith('intake.towel.'))) {
    scenario.renderer = 'towel-runtime'; scenario.preview = 'isolated-app-runtime'; scenario.checks.push('apps/web/e2e/review-towel-runtime.spec.ts')
  }
  const evidence = new Map()
  const source = []
  const surfaces = []
  const previews = new Set()
  const productFiles = (await files(join(appWeb, 'src'))).filter((file) => !relative(appWeb, file).startsWith('src/review/'))
  for (const file of [...productFiles, ...await files(join(web, 'src/review'))]) {
    if (/\.woff2?$/.test(file)) { source.push([relative(appRepo, file), sha(await readFile(file))]); continue }
    if (!/\.(tsx?|json|css|mjs|mts)$/.test(file)) continue
    const path = file.startsWith(join(web, 'src/review') + '/') ? relative(repo, file) : relative(appRepo, file)
    const content = await readFile(file, 'utf8')
    if (appRepo !== repo) reviewOverlay(path, content)
    source.push([path, sha(content)])
    evidence.set(path, content)
    if (/\.(test|spec)\./.test(file)) continue
    for (const match of content.matchAll(/(?:export\s+)?function\s+(\w*Sheet\w*)\s*\(/g)) surfaces.push({ id: `${path}#${match[1]}`, path, name: match[1], kind: 'sheet', scenarios: scenarios.filter((scenario) => scenario.component === path).map((scenario) => scenario.id) })
    for (const match of content.matchAll(/createFileRoute\(['"]([^'"]+)['"]\)/g)) surfaces.push({ id: `route:${match[1]}`, path, name: match[1], kind: 'route', scenarios: scenarios.filter((scenario) => scenario.component === path).map((scenario) => scenario.id) })
    if (path === 'apps/web/src/routes/design-preview.tsx') {
      for (const match of content.matchAll(/['"]((?:closet|home|household|laundry|me|settings|product|profile|outfit|join|setup|reset|invite|drying)-[a-z-]+)['"]/g)) previews.add(match[1])
      for (const match of content.matchAll(/(?<![\w.])screen === ['"]([a-z-]+)['"]/g)) previews.add(match[1])
    }
    for (const [catalog, prefix] of [['dryingPreviewStates', 'drying'], ['laundryDayScreens', 'laundry']]) {
      const list = content.match(new RegExp(`export const ${catalog}[^=]*= \\[([^\\]]+)\\]`))?.[1]
      if (list) for (const match of list.matchAll(/'([a-z-]+)'/g)) previews.add(`${prefix}-${match[1]}`)
    }
  }
  const design = { project: '43227d24-ee04-414e-a939-eda64e3f4bec', reconciliation: 'Review shell pending; existing component rules reused', hashes: {}, receipt: null }
  for (const path of ['IDENTITY.md', 'DESIGN.md', 'SKILL.md', 'README.md', 'colors_and_type.css', 'tokens.css', 'COMPONENTS.md', 'preview/production-patterns.html', 'source/render-reference-workflow.md', 'source-reference/receipt.json']) {
    try { const content = await readFile(join(designRoot, path), 'utf8'); design.hashes[path] = sha(content); evidence.set(`design:${path}`, content); if (path.endsWith('receipt.json')) design.receipt = JSON.parse(content) }
    catch (error) { if (error.code !== 'ENOENT') throw error; design.hashes[path] = null }
  }
  const sourceHashes = await referenceInputHashes(appWeb)
  const referenceCurrent = design.receipt?.status === 'verified' && JSON.stringify(design.receipt.sourceHashes) === JSON.stringify(sourceHashes)
  const existing = [...previews].sort().map((screen) => ({ id: `legacy.${screen}`, label: screen, journey: 'Existing specimens', renderer: 'legacy', screen, component: 'apps/web/src/routes/design-preview.tsx', design: ['source-reference/receipt.json'], checks: ['apps/web/src/dev/design-preview.test.ts'], preview: 'visual-or-partial', device: 'unverified', native: 'missing' }))
  for (const surface of surfaces.filter((surface) => surface.kind === 'route' && !surface.name.startsWith('/api/') && !['/design-preview', '/sign-in', '/create-account', '/forgot-password', '/care-photo', '/product-lookup'].includes(surface.name))) {
    const name = surface.name === '/' ? 'home' : surface.name.slice(1).replaceAll('$', '').replace(/[^a-z0-9]+/gi, '.').toLowerCase()
    scenarios.push({ id: `app.${name}`, label: `Live ${name.replaceAll('.', ' ')}`, journey: 'Live application', renderer: 'runtime', route: surface.name, component: surface.path, design: ['DESIGN.md'], checks: ['apps/web/e2e/review-runtime.spec.ts'], preview: surface.name.includes('$') ? 'requires-start-state' : 'isolated-app-runtime', native: 'missing', device: 'unverified' })
  }
  for (const [id, label, route, component] of [
    ['app.home.no-ready', 'Home · no ready outfit', '/', 'apps/web/src/routes/index.tsx'],
    ['app.drying.empty', 'Drying · empty queue', '/drying', 'apps/web/src/routes/drying.tsx'],
    ['app.drying.putaway-one', 'Drying · one item to put away', '/drying', 'apps/web/src/routes/drying.tsx'],
  ]) scenarios.push({ id, label, journey: 'Live application', renderer: 'runtime', route, component, branchOf: id.startsWith('app.home') ? 'app.home' : 'app.drying', design: ['DESIGN.md'], checks: ['apps/web/e2e/review-runtime.spec.ts'], preview: 'isolated-app-runtime', native: 'missing', device: 'unverified' })
  // These are curated source bindings, not observed transitions or automatic route discovery.
  const routeActions = JSON.parse(await readFile(join(web, 'src/review/route-actions.json'), 'utf8'))
  const registered = new Map([...scenarios, ...existing].map((scenario) => [scenario.id, scenario]))
  for (const action of routeActions) {
    const binding = [{ source: action.source, anchor: action.anchor }, ...(action.alternatives ?? [])].find((binding) => evidence.get(binding.source)?.includes(binding.anchor))
    if (binding) Object.assign(action, binding)
    action.status = !evidence.get(action.source)?.includes(action.anchor) ? 'source binding stale' : !registered.has(action.from) ? 'origin preview missing' : !action.destination || !registered.has(action.destination) ? 'destination state unmapped' : 'source-declared; representative preview'
    const origin = registered.get(action.from)
    if (!origin) continue
    origin.routeActions = [...(origin.routeActions ?? []), action]
    if (action.status === 'source-declared; representative preview') origin.edges = [...(origin.edges ?? []), { action: action.action, destination: action.destination, when: action.when, returnTo: action.returnTo, effect: 'Source-declared navigation; representative specimen, not an observed run' }]
  }
  const cases = design.receipt?.cases ?? []
  for (const scenario of [...scenarios, ...existing]) {
    scenario.implementation = evidence.has(scenario.component) ? 'present' : 'missing'
    scenario.designCoverage = scenario.design.every((path) => design.hashes[path]) ? 'rules/bounded specimen; full scenario unverified' : 'missing'
    scenario.reference = cases.some((entry) => entry.screen === scenario.screen) ? referenceCurrent ? 'source-current; static only' : 'stale' : 'missing'
    scenario.behavior = 'not verified by this inventory; see scoped checks'
    scenario.checkCoverage = {}
    for (const path of scenario.checks) { try { evidence.set(path, await readFile(join(path.includes('/review') ? repo : appRepo, path), 'utf8')); scenario.checkCoverage[path] = 'source present; execution not attested by this index' } catch (error) { if (error.code !== 'ENOENT') throw error; scenario.checkCoverage[path] = 'missing' } }
  }
  for (const path of ['pnpm-lock.yaml', 'package.json', 'apps/web/playwright.config.ts', 'apps/web/tsconfig.json', 'apps/web/review.html', 'apps/web/review-frame.html', 'apps/web/vite.config.ts', 'apps/web/package.json', ...[...evidence.keys()].filter((path) => /(?:test|spec)\./.test(path)), ...(await files(join(web, 'scripts'))).filter((path) => /review-[^/]+\.mjs$/.test(path)).map((path) => relative(repo, path))]) {
    const content = evidence.get(path) ?? await readFile(join(repo, path), 'utf8'); source.push([path, sha(content)])
  }
  // The CIVIC shell renders and stores every review, so its source is part of the attested revision.
  // Hash the shell this server actually loads, wherever its workspace link points.
  // The same holds for the Vite connector that builds this index and serves the frames.
  for (const [name, entry] of [['shell', '@civic/shell/server'], ['vite-connector', '@civic/vite-connector']]) {
    const root = resolve(dirname(fileURLToPath(import.meta.resolve(entry))), '..')
    for (const file of await files(root)) {
      if (file.includes('/node_modules/') || !/\.(tsx?|mjs|css|json)$/.test(file)) continue
      const path = `packages/${name}/${relative(root, file)}`
      const content = await readFile(file, 'utf8')
      source.push([path, sha(content)]); evidence.set(path, content)
    }
  }
  const head = gitHead(repo) ?? '0'.repeat(40)
  const appHead = gitHead(appRepo)
  if (appRepo !== repo) {
    source.push(['connection', sha(JSON.stringify({ repo, appRepo, appHead }))])
    for (const path of ['package.json', 'pnpm-lock.yaml', 'apps/web/package.json']) source.push([`application:${path}`, sha(await readFile(join(appRepo, path)))])
  }
  let contract = { version: 1, targets: [] }
  try { const content = await readFile(join(repo, coveragePath), 'utf8'); contract = checkedContract(JSON.parse(content)); source.push([coveragePath, sha(content)]); evidence.set(coveragePath, content) } catch (error) { if (error.code !== 'ENOENT') throw error }
  for (const root of ['packages', 'convex', 'apps/web/public']) for (const path of await files(join(appRepo, root))) {
    if (!relative(appRepo, path).startsWith('apps/web/public/') && !/\.(?:tsx?|json|css|mjs|mts)$/.test(path)) continue
    source.push([relative(appRepo, path), sha(await readFile(path))])
  }
  const revision = { head, source: sha(JSON.stringify([...new Map(source)].sort())), capturedAt: new Date().toISOString() }
  const fixtureSource = sha(JSON.stringify([...new Map(source)].filter(([path]) => !/\.(test|spec)\./.test(path) && (path === 'connection' || path.startsWith('application:') || /\/review-(application|laundry|adapter)\.mjs$/.test(path) || path.startsWith('apps/web/public/') || path.startsWith('packages/') && !/^packages\/(?:shell|vite-connector)\//.test(path) || path.startsWith('convex/') || path.startsWith('apps/web/src/') && (!path.includes('/review/') || /\/review\/(frame\.tsx|laundry-frame\.tsx|adapters\/laundry\.ts|adapter\.ts|journey\.ts|store\.ts|route-preview\.tsx|family-preview\.tsx|scenarios\.json)$/.test(path)))).sort()))
  const validationPath = 'docs/design/review-validation.json'
  let validation = { path: validationPath, status: 'missing', receipt: null }
  try {
    const content = await readFile(join(repo, validationPath), 'utf8')
    const receipt = JSON.parse(content)
    evidence.set(validationPath, content)
    validation = { path: validationPath, status: receipt.revision?.head === head && receipt.revision?.source === revision.source ? 'source-current' : 'stale', receipt }
    if (validation.status === 'source-current') for (const scenario of scenarios) scenario.behavior = receipt.behaviorScenarios?.includes(scenario.id) ? 'scoped local behavior passed; other conditions unverified' : receipt.renderScenarios?.includes(scenario.id) ? 'drawer rendering passed; full behavior unverified' : 'missing execution evidence'
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const metadata = { revision, validation, design: { ...design, receipt: design.receipt === null ? null : { baseline: design.receipt.baseline, status: design.receipt.status, generatedAt: design.receipt.generatedAt, current: referenceCurrent } }, scenarios: [...scenarios, ...existing], surfaces, limits: ['Source discovery is not an exhaustive scenario audit.', 'Existing specimens may reject saves or have visual-only callbacks.', 'Photo upload, garment care actions, research and planning are not simulated; unsupported writes fail.', 'Planner/backend authorization is not simulated or proven by local saves.', 'Native implementations, arbitrary canvas editing and simultaneous collaboration remain roadmap work.', 'Physical device acceptance and review-access deployment are unverified.', 'OpenDesign native annotation retrieval is unverified; /api/review/feedback is the explicit agent path.'] }
  metadata.fixtureSource = fixtureSource
  metadata.fixtureInputs = source.filter(([path]) => !/\.(test|spec)\./.test(path))
  metadata.connection = { rehearsalRoot: repo, applicationRoot: appRepo, applicationHead: appHead, mode: appRepo === repo ? 'same-checkout' : 'read-only-linked-checkout', refresh: 'Inventory and snapshots update automatically; open runs retain their rendered revision.' }
  metadata.routeActions = routeActions
  metadata.coverage = coverageReport(metadata, contract, new Set(source.map(([path]) => path)))
  return { metadata, evidence }
}
