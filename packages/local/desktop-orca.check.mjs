import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { canvasPlugins } from '../canvas/server/canvas-host.mjs'
import { canvasRoot } from '../canvas/server/canvas-root.mjs'
import { isolatedOrcaAssets, isolatedOrcaConnector } from './orca-isolated.mjs'

assert.ok(process.env.CIVIC_ORCA_MANIFEST, 'Set CIVIC_ORCA_MANIFEST to a built frozen Orca preview')
const manifest = process.env.CIVIC_ORCA_MANIFEST
const receipt = JSON.parse(await readFile(join(dirname(manifest), 'receipt.json'), 'utf8'))
const store = await mkdtemp(join(tmpdir(), 'civic-react-orca-'))
await mkdir(join(store, '.review-data'))
// The tab's explicit connection must win over another workspace selection.
await writeFile(join(store, '.review-data/application.json'), JSON.stringify({ project: join(store, 'other-project.json'), root: join(store, 'other-checkout') }))
const connection = { manifest, applicationRoot: receipt.source }
const host = await createServer({ configFile: false, root: canvasRoot, cacheDir: join(store, '.vite'), logLevel: 'warn', resolve: { alias: { '@civic/canvas/runtime-session': join(canvasRoot, 'src/runtime-session.ts') } }, server: { host: '127.0.0.1', port: 0 }, plugins: [isolatedOrcaAssets({ store, project: connection, source: receipt.source }), ...canvasPlugins({ store, project: connection, connectors: { 'orca-isolated': isolatedOrcaConnector }, review: async ({ project }) => ({ screens: JSON.parse(await readFile(project.scenariosPath, 'utf8')) }) })] })
await host.listen()
const origin = `http://127.0.0.1:${host.httpServer.address().port}`
const { _electron } = createRequire(new URL('../canvas/package.json', import.meta.url))('@playwright/test')
const env = { ...process.env, CIVIC_LOCAL_STORE: store, CIVIC_DESKTOP_ORIGIN: origin }
delete env.ELECTRON_RUN_AS_NODE
let app
const budget = setTimeout(() => app?.process().kill('SIGKILL'), 240000)
try {
  app = await _electron.launch({ executablePath: env.CIVIC_ELECTRON_BINARY, args: [fileURLToPath(new URL('desktop.mjs', import.meta.url))], env })
  const page = await app.firstWindow(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('button', { name: 'Open project or checkout', exact: true }).waitFor()
  const indexResponse = await page.request.get(origin + '/api/review/index')
  assert.equal(indexResponse.status(), 200)
  const index = await indexResponse.json(), screens = index.scenarios.filter(row => row.route)
  assert.equal(screens.length, 11)
  assert.equal(index.scenarios.some(row => row.fixture.component), false, 'React previews cannot advertise legacy Solid component fixtures')
  assert.equal(index.revision.head, receipt.ui)
  for (const screen of screens) {
    console.log('Checking Orca screen:', screen.label)
    await page.goto(origin + '/review-frame.html?' + new URLSearchParams({ scenario: screen.id, width: '1440', height: '900' }))
    await page.locator('#root main').first().waitFor({ timeout: 30000 })
    await page.waitForFunction(() => window.reviewPreview?.data()?.snapshot?.projects?.length === 1)
    assert.ok((await page.locator('#root main').first().innerText()).trim().length > 0, screen.label)
    if (screen.fixture.name === 'new-project') await page.getByRole('heading', { name: 'Add a project', exact: true }).waitFor()
    if (['home', 'project', 'work', 'session'].includes(screen.fixture.name)) assert.ok(await page.locator('#root').getByText('CIVIC synthetic project', { exact: true }).count() > 0, screen.label)
    assert.equal((await page.evaluate(() => window.reviewPreview.data())).snapshot.sessions.some(row => row.status === 'running'), false)
    assert.equal(await page.getByText(/This isolated run cannot execute/).count(), 0, 'Initial screen reads must not surface command-refusal toasts')
    await page.screenshot({ path: join(store, `${screen.fixture.name}-desktop.png`) })
  }
  const home = screens.find(row => row.fixture.name === 'home')
  await page.goto(origin + '/review?desktop=darwin&scenario=' + home.id)
  await page.getByRole('button', { name: 'Capture 01 Home screenshot', exact: true }).click()
  const download = page.getByRole('link', { name: 'Download PNG', exact: true })
  await download.waitFor({ timeout: 90000 })
  const pngResponse = await page.request.get(new URL(await download.getAttribute('href'), origin).href)
  assert.equal(pngResponse.status(), 200)
  const png = await pngResponse.body()
  assert.equal(png.readUInt32BE(16), 786)
  assert.equal(png.readUInt32BE(20), 1704)
  await page.getByLabel('What should change?', { exact: true }).fill('Orca integration acceptance: preserve this frozen screen and its source receipt.')
  await page.getByRole('button', { name: 'Save review', exact: true }).click()
  await page.getByRole('heading', { name: 'Captured review', exact: true }).waitFor()
  const reviewsResponse = await page.request.get(origin + '/api/review/feedback')
  assert.equal(reviewsResponse.status(), 200)
  const saved = (await reviewsResponse.json()).at(-1)
  assert.deepEqual(await (await page.request.get(origin + saved.screenshot)).body(), png)
  const brief = await page.request.get(origin + `/api/review/feedback/${saved.id}/handoff`)
  assert.equal(brief.status(), 200)
  await writeFile(join(store, 'review-handoff.md'), await brief.body())
  for (const width of [1440, 390]) {
    await app.evaluate(({ BaseWindow }, width) => BaseWindow.getAllWindows()[0].setSize(width, 900), width)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: join(store, `capture-${width}.png`) })
  }
  assert.deepEqual(errors, [])
  await writeFile(join(store, 'result.json'), JSON.stringify({ revision: receipt.ui, source: receipt.worktreeHash, screens: screens.map(row => row.label), review: saved.id, errors }, null, 2))
  console.log(`Frozen React Orca screens, isolated runtime, 2× capture, saved review and handoff passed in desktop/narrow Electron. Evidence: ${store}`)
} catch (error) {
  for (const page of app?.windows() ?? []) { console.error('Orca page:', page.url(), (await page.locator('body').innerText().catch(() => '')).slice(0, 4000)); await page.screenshot({ path: join(store, 'failure.png') }).catch(() => {}) }
  console.error('Evidence:', store)
  throw error
} finally {
  clearTimeout(budget)
  await app?.evaluate(({ app }) => app.exit(0)).catch(() => {})
  await app?.close().catch(() => {})
  await host.close()
}
