import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, copyFile, realpath } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { loadProject } from '@civic/vite-connector/project'
import { projectPicker } from '@civic/vite-connector/projects'
import { bindScreens } from './orca-drafts.mjs'

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const store = process.env.CIVIC_LOCAL_STORE ?? join(repo, '.civic-canvas')
const sha = data => createHash('sha256').update(data).digest('hex')
export function catalogRows(source) {
  const rows = source.split('\n').filter(line => /^\s*\['\d\d',/.test(line)).map(line => JSON.parse(line.trim().replace(/,$/, '').replace(/'((?:\\.|[^'\\])*)'/g, (_, value) => JSON.stringify(value.replace(/\\'/g, "'")))))
  if (rows.length !== 40 || new Set(rows.map(row => row[0])).size !== 40) throw Error('Expected 40 distinct screen families. Inspect the design catalog before refreshing.')
  return rows
}
export async function onboard(config) {
  const folder = join(store, 'projects/orca'), design = join(folder, 'design')
  await mkdir(design, { recursive: true, mode: 0o700 })
  const files = {}
  const referenceRoot = await realpath(join(config.orcaDesign, 'screens'))
  const reference = async name => {
    if (!/^[a-z0-9-]+\.(html|css|js)$/.test(name)) throw Error('Invalid design asset')
    const path = await realpath(join(referenceRoot, name))
    if (!path.startsWith(referenceRoot + '/')) throw Error('Design reference escapes the registered collection')
    const bytes = await readFile(path); files[name] = sha(bytes); return bytes.toString()
  }
  let html = await reference('index.html')
  const rows = catalogRows(await reference('catalog.js'))
  const scripts = []
  for (const match of html.matchAll(/<script defer src="([a-z0-9-]+\.js)"><\/script>/g)) { scripts.push(await reference(match[1])); html = html.replace(match[0], '') }
  for (const match of html.matchAll(/<link rel="stylesheet" href="([a-z0-9-]+\.css)">/g)) html = html.replace(match[0], `<style>${(await reference(match[1])).replace(/<\/style/gi, '<\\/style')}</style>`)
  html = html.replace('</body>', `<!-- CIVIC_ROUTE --><script>${scripts.join('\n;\n').replace(/<\/script/gi, '<\\/script')}</script></body>`)
  for (const [name, hash] of Object.entries(files)) if (sha(await readFile(join(referenceRoot, name))) !== hash) throw Error('The design collection changed during import. Existing onboarding was retained; retry after the owner finishes.')
  // Bundle bounded reference assets so an opaque sandbox needs neither cookies nor network access.
  html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; script-src &apos;unsafe-inline&apos;; style-src &apos;unsafe-inline&apos;; img-src data:; connect-src &apos;none&apos;; form-action &apos;none&apos;; base-uri &apos;none&apos;">')
  const documents = []
  for (const name of ['product-screen-map', 'workflow-journeys', 'harness-workspace', 'harness-interactions', 'command-assistant']) {
    const text = await readFile(join(config.orcaSource, `docs/design/2026-10-18-${name}.md`), 'utf8')
    await writeFile(join(design, name + '.md'), text)
    documents.push({ name, sha256: sha(text) })
  }
  const map = await readFile(join(design, 'product-screen-map.md'), 'utf8')
  const section = map.split('Carry at least these design journeys across the screen families:')[1]?.split('## Current command-to-screen')[0]
  const journeys = [...(section ?? '').matchAll(/^\d+\. (.+)$/gm)].map(match => match[1])
  if (journeys.length !== 12) throw Error('Expected 12 declared journey cases; inspect the changed product contract')
  const scenarios = rows.flatMap(([family, label, capability, states, elements, source]) => states.split('|').map(state => ({ id: `orca.${family}.${state}`, label: `${label} · ${state}`, journey: label, section: 'Design studies', preview: 'visual-or-partial', behavior: 'Design fixture only; Orca runtime not connected', implementation: 'unknown', fixture: { family, state, capability, elements, source }, edges: [], captureFields: [] })))
  const receipt = { capturedAt: new Date().toISOString(), sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: config.orcaSource, encoding: 'utf8' }).trim(), source: config.orcaSource, designProject: 'orca-redesign', files, documents, journeys, evidence: { design: 'In-flight proposal', approval: 'Unknown', adoption: 'Unknown', codeVerification: 'Unverified', physicalDevice: 'Unverified', transitions: 'Declared journeys and fixture selections only; no Orca runtime traversal' } }
  const manifest = { version: 1, id: 'orca-design-study', name: 'Orca · design studies', adapter: { kind: 'module', entry: 'preview.mjs' }, sources: ['design'], scenarios: 'civic.scenarios.json', coverage: 'civic.coverage.json', personas: [{ id: 'reviewer', label: 'Design reviewer' }], roles: [{ id: 'viewer', label: 'Study viewer' }], conditions: [{ id: 'proposal', label: 'Design proposal; runtime unverified' }], navigation: ['Design studies'], design: { id: 'orca-redesign', files: documents.map(doc => doc.name + '.md') } }
  const json = async (name, value) => writeFile(join(folder, name), JSON.stringify(value, null, 2) + '\n')
  await writeFile(join(folder, 'design.html'), html)
  await copyFile(new URL('./orca-preview.mjs', import.meta.url), join(folder, 'preview.mjs'))
  await json('receipt.json', receipt)
  await json('civic.scenarios.json', bindScreens(scenarios, 'design'))
  const journeyFamilies = [['01', '03', '05'], ['06', '05'], ['05', '10', '11', '12', '14', '05'], ['07', '08'], ['13', '14'], ['15', '18', '05'], ['19', '05'], ['20', '22'], ['14', '15', '36'], ['23', '14'], ['30', '31', '32', '33', '34'], ['35', '14', '32']]
  await json('civic.coverage.json', { version: 1, targets: journeys.map((journey, i) => ({ id: `orca.journey-${i + 1}`, title: `Declared case ${i + 1}: ${journey.slice(0, 130)}`, kind: 'journey', scenarios: journeyFamilies[i].map(family => scenarios.find(scenario => scenario.fixture.family === family).id), acceptance: [journey, 'Design specimens are references. Verify the actual Orca runtime, retained state, ownership and originating return before claiming traversal.'] })) })
  await json('civic.project.json', manifest)
  const current = loadProject(store, { manifest: join(folder, 'civic.project.json') })
  const picker = await projectPicker(store, current, { kinds: ['module', 'laundry'] })
  await picker.organize({ key: current.key, app: { id: 'orca', name: 'Orca' }, kind: 'design' })
  await picker.add({ kind: 'existing', root: config.laundry, manifest: 'civic.project.json', app: { id: 'laundry', name: 'Laundry App' }, connectionKind: 'isolated' })
  const selected = await readFile(join(store, '.review-data/application.json')).then(() => true).catch(error => { if (error.code === 'ENOENT') return false; throw error })
  if (!selected) await picker.select(current.key)
  await writeFile(join(store, 'local-config.json'), JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
  return { orcaFamilies: rows.length, orcaStates: scenarios.length, declaredJourneyCases: journeys.length, laundry: config.laundry, store }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { 'orca-source': { type: 'string' }, 'orca-design': { type: 'string' }, laundry: { type: 'string' }, origin: { type: 'string' } } })
  let config = await readFile(join(store, 'local-config.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return {}; throw error })
  for (const [flag, key] of [['orca-source', 'orcaSource'], ['orca-design', 'orcaDesign'], ['laundry', 'laundry']]) if (values[flag]) config[key] = resolve(values[flag])
  if (values.origin) { const origin = new URL(values.origin); if (origin.origin !== values.origin || origin.protocol !== 'https:' || !origin.hostname.endsWith('.ts.net')) throw Error('Use an exact HTTPS Tailscale origin'); config.origin = values.origin }
  if (!config.orcaSource || !config.orcaDesign || !config.laundry) throw Error('Use --orca-source PATH --orca-design PATH --laundry PATH on the first onboarding')
  console.log(await onboard(config))
}
