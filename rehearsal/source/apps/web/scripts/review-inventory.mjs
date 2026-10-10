import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { referenceInputHashes } from './opendesign-reference-inputs.mjs'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
async function files(root) {
  const entries = await readdir(root, { withFileTypes: true })
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(root, entry.name)) : join(root, entry.name)))).flat()
}

/** Source-discovered routes/sheets and named scenarios are separate coverage measures. */
export async function reviewInventory(repo, designRoot) {
  const web = join(repo, 'apps/web')
  const scenarios = JSON.parse(await readFile(join(web, 'src/review/scenarios.json'), 'utf8')).map((scenario) => ({ design: ['DESIGN.md', 'preview/production-patterns.html'], checks: ['apps/web/e2e/review-workspace.spec.ts'], preview: 'working-synthetic', native: 'missing', device: 'unverified', ...scenario }))
  const journeys = [...new Set(scenarios.map((scenario) => scenario.journey))]
  const steps = ['type', 'whose', 'details', 'fabric', 'color', 'origin', 'dye', 'care', 'stain', 'final']
  scenarios.sort((a, b) => journeys.indexOf(a.journey) - journeys.indexOf(b.journey) || (a.renderer === 'intake' && b.renderer === 'intake' ? steps.indexOf(a.step) - steps.indexOf(b.step) : 0))
  const evidence = new Map()
  const source = []
  const surfaces = []
  const previews = new Set()
  for (const file of await files(join(web, 'src'))) {
    if (!/\.(tsx?|json|css)$/.test(file)) continue
    const path = relative(repo, file)
    const content = await readFile(file, 'utf8')
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
  const sourceHashes = await referenceInputHashes(web)
  const referenceCurrent = design.receipt?.status === 'verified' && JSON.stringify(design.receipt.sourceHashes) === JSON.stringify(sourceHashes)
  const existing = [...previews].sort().map((screen) => ({ id: `legacy.${screen}`, label: screen, journey: 'Existing specimens', renderer: 'legacy', screen, component: 'apps/web/src/routes/design-preview.tsx', design: ['source-reference/receipt.json'], checks: ['apps/web/src/dev/design-preview.test.ts'], preview: 'visual-or-partial', device: 'unverified', native: 'missing' }))
  const cases = design.receipt?.cases ?? []
  for (const scenario of [...scenarios, ...existing]) {
    scenario.implementation = evidence.has(scenario.component) ? 'present' : 'missing'
    scenario.designCoverage = scenario.design.every((path) => design.hashes[path]) ? 'rules/bounded specimen; full scenario unverified' : 'missing'
    scenario.reference = cases.some((entry) => entry.screen === scenario.screen) ? referenceCurrent ? 'source-current; static only' : 'stale' : 'missing'
    scenario.behavior = 'not verified by this inventory; see scoped checks'
    scenario.checkCoverage = {}
    for (const path of scenario.checks) { try { evidence.set(path, await readFile(join(repo, path), 'utf8')); scenario.checkCoverage[path] = 'source present; execution not attested by this index' } catch (error) { if (error.code !== 'ENOENT') throw error; scenario.checkCoverage[path] = 'missing' } }
  }
  for (const path of ['pnpm-lock.yaml', 'package.json', 'apps/web/playwright.config.ts', 'apps/web/tsconfig.json', 'apps/web/review.html', 'apps/web/review-frame.html', 'apps/web/vite.config.ts', 'apps/web/package.json', ...[...evidence.keys()].filter((path) => /(?:test|spec)\./.test(path)), ...(await files(join(web, 'scripts'))).filter((path) => /review-[^/]+\.mjs$/.test(path)).map((path) => relative(repo, path))]) {
    const content = await readFile(join(repo, path), 'utf8'); source.push([path, sha(content)])
  }
  // The CIVIƆ shell renders and stores every review, so its source is part of the attested revision.
  const shell = join(repo, 'packages/shell')
  for (const file of await files(shell)) {
    if (file.includes('/node_modules/') || !/\.(tsx?|mjs|css|json)$/.test(file)) continue
    const path = relative(repo, file)
    const content = await readFile(file, 'utf8')
    source.push([path, sha(content)]); evidence.set(path, content)
  }
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
  const revision = { head, source: sha(JSON.stringify([...new Map(source)].sort())), capturedAt: new Date().toISOString() }
  const fixtureSource = sha(JSON.stringify([...new Map(source)].filter(([path]) => path.startsWith('apps/web/src/') && !/\.(test|spec)\./.test(path) && (!path.includes('/review/') || /\/review\/(frame\.tsx|store\.ts)$/.test(path))).sort()))
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
  return { metadata, evidence }
}
