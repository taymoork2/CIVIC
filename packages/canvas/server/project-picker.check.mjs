import assert from 'node:assert/strict'
import { mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { canvasRoot } from './canvas-root.mjs'
import { startCanvas } from './canvas-host.mjs'
import { moduleReviewAdapter } from './module-adapter.mjs'

async function workspace(t) {
  const store = await realpath(await mkdtemp(join(tmpdir(), 'civic-picker-')))
  const server = await startCanvas({ project: join(canvasRoot, 'examples/notebook/civic.project.json'), store, port: 0, logLevel: 'silent' })
  t.after(() => server.close())
  const browser = await moduleReviewAdapter.launchFixtureBrowser()
  t.after(() => browser.close())
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await tab.goto(`http://127.0.0.1:${server.httpServer.address().port}/review`)
  return tab
}

test('closing project sources aborts its pending scoped search', { timeout: 60000 }, async t => {
  const tab = await workspace(t)
  const requests = []
  let held
  await tab.evaluate(() => {
    const fetch = window.fetch
    window.sourceAborts = 0
    window.fetch = (path, options) => {
      if (String(path).endsWith('/api/review/projects') && options?.body && JSON.parse(options.body).action === 'source-versions') options.signal.addEventListener('abort', () => { window.sourceAborts++ }, { once: true })
      return fetch(path, options)
    }
  })
  await tab.route('**/api/review/projects', async route => {
    const request = route.request(), input = request.postDataJSON()
    if (input?.action !== 'source-versions') return route.continue()
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
  const tab = await workspace(t)
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
