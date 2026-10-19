import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { canvasRoot } from './canvas-root.mjs'
import { startCanvas } from './canvas-host.mjs'
import { moduleReviewAdapter } from './module-adapter.mjs'
import { loadProject } from '@civic/vite-connector/project'

async function workspace(t, many = false) {
  const store = await realpath(await mkdtemp(join(tmpdir(), 'civic-picker-')))
  let manifest = join(canvasRoot, 'examples/notebook/civic.project.json')
  const rows = []
  if (many) {
    for (let index = 0; index < 121; index++) {
      const root = join(store, `copy-${index}`)
      await cp(join(canvasRoot, 'examples/notebook'), root, { recursive: true })
      const project = loadProject(store, { manifest: join(root, 'civic.project.json'), applicationRoot: root })
      const scenarios = JSON.parse(await readFile(project.scenariosPath, 'utf8'))
      scenarios[0].targetId = 'notes.home'; scenarios[0].fixture = { state: 'ready' }
      scenarios.push({ id: 'demo.empty', label: 'Empty home', journey: 'Write a note', targetId: 'notes.home', fixture: { state: 'empty' } })
      await writeFile(project.scenariosPath, JSON.stringify(scenarios))
      await writeFile(join(root, 'receipt.json'), JSON.stringify({ ui: 'abcdef1', server: 'fixture', script: '/app.js', css: [], source: root, worktreeName: `Draft ${index}` }))
      rows.push({ key: project.key, manifest: project.manifestPath, root, kind: 'implementation', app: { id: index === 120 ? 'other' : 'notebook-demo', name: index === 120 ? 'Other app' : 'Notebook' } })
    }
    manifest = rows[0].manifest
    await mkdir(join(store, '.review-data'), { recursive: true })
    await writeFile(join(store, '.review-data/project-picker.json'), JSON.stringify(rows))
  }
  const server = await startCanvas({ project: manifest, store, port: 0, logLevel: 'silent' })
  t.after(() => server.close())
  const browser = await moduleReviewAdapter.launchFixtureBrowser()
  t.after(() => browser.close())
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const requests = []
  tab.on('request', request => { if (request.url().endsWith('/api/review/projects')) requests.push(request.postDataJSON()) })
  await tab.goto(`http://127.0.0.1:${server.httpServer.address().port}/review`)
  // Initial Vite dependency optimization can replace the dev document.
  await tab.waitForLoadState('networkidle')
  return { tab, store, rows, requests }
}

test('closing project sources aborts its pending scoped search', { timeout: 60000 }, async t => {
  const { tab } = await workspace(t)
  const requests = []
  let held
  await tab.evaluate(() => {
    const fetch = window.fetch
    window.sourceAborts = 0
    window.fetch = (path, options) => {
      if (String(path).endsWith('/api/review/projects') && options?.body) {
        const input = JSON.parse(options.body)
        if (input?.action === 'source-versions' && input.query === 'Pending search') options.signal.addEventListener('abort', () => { window.sourceAborts++ }, { once: true })
      }
      return fetch(path, options)
    }
  })
  await tab.route('**/api/review/projects', async route => {
    const request = route.request(), input = request.postDataJSON()
    if (input?.action !== 'source-versions' || input.query !== 'Pending search') return route.continue()
    assert.ok(request.headers()['x-rehearsal-project'])
    requests.push(request)
    held = route
  })
  await tab.locator('.rh-project-trigger').click()
  await tab.getByRole('button', { name: 'Manage sources', exact: true }).click()
  await tab.getByLabel('Search sources', { exact: true }).fill('Pending search')
  await tab.waitForRequest(request => request.postData()?.includes('Pending search') === true)
  await tab.getByRole('button', { name: 'Close project picker', exact: true }).click()
  await tab.waitForFunction(() => window.sourceAborts === 1)
  await tab.getByRole('dialog').waitFor({ state: 'detached' })
  assert.equal(await tab.getByRole('dialog').count(), 0)
  assert.equal(requests.length, 1)
  await held.abort().catch(() => {})
})

test('coverage keeps the project-conflict message and live draft when another poll fails', { timeout: 60000 }, async t => {
  const { tab } = await workspace(t)
  await tab.locator('.app-screen > button', { hasText: 'Notebook home' }).click()
  await tab.getByRole('button', { name: 'Play this screen' }).click()
  const frame = tab.frameLocator('iframe[title="Live Notebook home"]')
  await frame.getByRole('button', { name: 'New note' }).click()
  await frame.getByLabel('Title', { exact: true }).fill('Keep during conflict')
  await tab.route('**/api/review/index', route => route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } }))
  await tab.route('**/api/review/coverage', route => route.fulfill({ status: 409, json: { error: 'Project changed' } }))
  await tab.getByRole('button', { name: 'Open details', exact: true }).click()
  await tab.getByRole('menuitem', { name: 'Coverage', exact: true }).click()
  await tab.getByRole('tabpanel', { name: 'Coverage', exact: true }).getByRole('alert').filter({ hasText: 'The active project changed in another tab. Reload this tab; previous drafts are retained.' }).waitFor()
  assert.equal(await frame.getByLabel('Title', { exact: true }).inputValue(), 'Keep during conflict')
})

test('version loading is paged, scoped and lazy across 120 checkouts without changing saved evidence', { timeout: 90000 }, async t => {
  const { tab, store, rows, requests } = await workspace(t, true)
  const evidence = join(store, '.review-data/projects', rows[0].key)
  await mkdir(join(evidence, 'runs'), { recursive: true })
  const files = [join(evidence, 'feedback.json'), join(evidence, 'runs/preserved.json')]
  await writeFile(files[0], '[]\n'); await writeFile(files[1], '{"saved":"fixture recording"}\n')
  const before = await Promise.all(files.map(file => readFile(file, 'utf8')))
  await tab.locator('.rh-project-trigger').click()
  await tab.getByRole('button', { name: 'Preview options for Draft 0', exact: true }).waitFor()
  assert.equal(await tab.locator('.civic-version-toggle').count(), 10)
  assert.equal(requests.some(input => input === null || input.action === 'scenarios'), false, 'Picker never requests eager lists or per-connection inventories')
  assert.equal(requests.filter(input => input?.action === 'version-page').length, 1)
  await tab.getByRole('button', { name: 'Preview options for Draft 0', exact: true }).click()
  await tab.getByRole('region', { name: 'Previews for Draft 0', exact: true }).getByText('Viewing', { exact: true }).waitFor()
  assert.equal(requests.filter(input => input?.action === 'version-page' && input.version).length, 1, 'Expansion loads only its selected version')
  await tab.getByRole('button', { name: 'Close project picker', exact: true }).click()
  await tab.locator('.app-screen > button', { hasText: 'Notebook home' }).click()
  await tab.locator('.rh-project-trigger').click()
  await tab.getByRole('button', { name: 'Preview options for Draft 0', exact: true }).waitFor()
  const comparison = tab.waitForRequest(request => { const input = request.url().endsWith('/api/review/projects') && request.postDataJSON(); return input?.action === 'changes' && input.candidates.some(row => row.key === rows[119].key) })
  await tab.getByLabel('Search versions', { exact: true }).fill('Draft 119')
  await tab.getByRole('button', { name: 'Preview options for Draft 119', exact: true }).waitFor()
  assert.equal(await tab.locator('.civic-version-toggle').count(), 1)
  await tab.getByRole('button', { name: 'Preview options for Draft 119', exact: true }).click()
  await tab.getByRole('button', { name: 'Open Draft 119 · ready preview', exact: true }).waitFor()
  assert.equal((await comparison).postDataJSON().candidates[0].scenario, 'demo.home', 'Selected ready state is the comparison and opening default')
  assert.equal(requests.some(input => input?.action === 'version-page' && input.app === 'other'), false)
  assert.ok(requests.filter(input => input?.action === 'changes').every(input => input.candidates.length <= 10))
  let held
  await tab.evaluate(() => {
    const fetch = window.fetch
    window.versionAborts = 0
    window.fetch = (path, options) => {
      if (String(path).endsWith('/api/review/projects') && options?.body) {
        const input = JSON.parse(options.body)
        if (input && input.query === 'Slow') options.signal.addEventListener('abort', () => { window.versionAborts++ }, { once: true })
      }
      return fetch(path, options)
    }
  })
  await tab.route('**/api/review/projects', route => {
    const input = route.request().postDataJSON()
    if (input?.action === 'version-page' && input.query === 'Slow') { held = route; return }
    return route.continue()
  })
  const pending = tab.waitForRequest(request => request.postData()?.includes('"query":"Slow"') === true)
  await tab.getByLabel('Search versions', { exact: true }).fill('Slow')
  await pending
  await tab.getByRole('button', { name: 'Close project picker', exact: true }).click()
  await tab.waitForFunction(() => window.versionAborts === 1)
  await tab.locator('.rh-project-trigger').click()
  await tab.getByRole('button', { name: 'Preview options for Draft 0', exact: true }).waitFor()
  await held.fulfill({ status: 200, json: { app: 'notebook-demo', items: [], total: 0, offset: 0, limit: 10, hasMore: false, errors: [] } }).catch(() => {})
  assert.equal(await tab.locator('.civic-version-toggle').count(), 10, 'Cancelled stale results never replace the reopened scope')
  assert.deepEqual(await Promise.all(files.map(file => readFile(file, 'utf8'))), before)
})
