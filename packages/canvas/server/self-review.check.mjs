import assert from 'node:assert/strict'
import { mkdtemp, realpath, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { test } from 'node:test'
import { startCanvas } from './canvas-host.mjs'
import { canvasRoot } from './canvas-root.mjs'
import { moduleReviewAdapter } from './module-adapter.mjs'

test('CIVIC appears in its picker and renders its own synthetic screens', { timeout: 120000 }, async t => {
  const root = resolve(canvasRoot, '../..')
  const store = await realpath(await mkdtemp(join(tmpdir(), 'civic-self-review-')))
  const server = await startCanvas({ project: join(root, 'civic.json'), store, port: 0, logLevel: 'silent' })
  t.after(() => server.close())
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  const browser = await moduleReviewAdapter.launchFixtureBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin + '/review')
  await page.locator('.rh-project-trigger').click()
  await page.getByRole('navigation', { name: 'Projects', exact: true }).getByRole('button', { name: /^CIVIC/ }).waitFor()
  const scenarios = JSON.parse(await readFile(join(root, 'civic.scenarios.json'), 'utf8'))
  const selectors = {
    'civic.picker': '[role="dialog"]',
    'civic.canvas': '[aria-label="Application flow overview"]',
    'civic.inspector': '#civic-details-panel',
    'civic.review': '#civic-details-panel',
    'civic.settings': '[role="dialog"]',
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const scenario of scenarios) {
      await page.goto(`${origin}/review-frame.html?scenario=${scenario.id}&width=${width}&height=900`)
      await page.locator(selectors[scenario.id]).waitFor()
      // A modal (picker, settings) hides the canvas from the accessibility tree; it must still be drawn behind it.
      await page.getByRole('button', { name: 'Open Write a note flow', exact: true, includeHidden: true }).waitFor({ state: 'attached' })
      assert.equal(await page.getByRole('heading', { name: 'Preview unavailable', exact: true }).count(), 0)
      if (scenario.id === 'civic.review') await page.getByRole('button', { name: 'Comment on selection', exact: true }).waitFor()
      if (scenario.id === 'civic.settings') await page.getByRole('tab', { name: 'Shortcuts', exact: true }).click()
    }
  }
  assert.deepEqual(errors, [])
})
