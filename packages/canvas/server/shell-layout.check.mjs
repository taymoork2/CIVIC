import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createServer } from 'vite'
import { canvasRoot } from './canvas-root.mjs'
import { canvasPlugins, startCanvas } from './canvas-host.mjs'
import { moduleReviewAdapter } from './module-adapter.mjs'

async function workspace(t, guided) {
  const store = await realpath(await mkdtemp(join(tmpdir(), 'civic-shell-layout-')))
  let server
  if (guided) {
    const app = join(store, 'pantry')
    await cp(join(canvasRoot, 'examples/pantry'), app, { recursive: true })
    const file = join(app, 'civic.project.json'), manifest = JSON.parse(await readFile(file, 'utf8'))
    manifest.adapter.kind = 'guided-pantry'; delete manifest.adapter.extension
    await writeFile(file, JSON.stringify(manifest))
    server = await createServer({ configFile: false, root: canvasRoot, cacheDir: join(store, '.vite'), logLevel: 'silent', server: { host: '127.0.0.1', port: 0 }, plugins: canvasPlugins({ store, project: { manifest: file }, connectors: { 'guided-pantry': { canvasExtension: () => join(canvasRoot, 'src/check-fixtures/guided-extension.tsx') } } }) })
    await server.listen()
  } else server = await startCanvas({ project: join(canvasRoot, 'examples/notebook/civic.project.json'), store, port: 0, logLevel: 'silent' })
  t.after(() => server.close())
  const browser = await moduleReviewAdapter.launchFixtureBrowser()
  t.after(() => browser.close())
  return { browser, origin: `http://127.0.0.1:${server.httpServer.address().port}` }
}

async function fits(locator, width, height) {
  const box = await locator.boundingBox()
  assert.ok(box && box.width > 0 && box.height > 0)
  assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, JSON.stringify(box))
}

for (const guided of [false, true]) test(`${guided ? 'guided' : 'module'} shell keeps menus, focus and touch targets usable at desktop and narrow sizes`, { timeout: 90000 }, async t => {
  const { browser, origin } = await workspace(t, guided)
  for (const width of [1280, 768, 390]) {
    const height = width === 390 ? 844 : 900
    const tab = await browser.newPage({ viewport: { width, height }, hasTouch: width === 390 })
    await tab.route('**/api/review/projects', async route => {
      const input = route.request().method() === 'POST' ? route.request().postDataJSON() : null
      if (input?.action !== 'version-page' || input.version) return route.continue()
      const response = await route.fetch(), body = await response.json()
      assert.ok(response.ok() && body.items.length)
      await route.fulfill({ response, json: { ...body, items: Array.from({ length: 10 }, (_, index) => ({ ...body.items[0], id: `layout-${index}`, name: `Layout branch ${index}`, current: index === 0 })), total: 10, hasMore: false } })
    })
    await tab.goto(origin + '/review')
    await tab.locator('.app-nav-section').first().waitFor({ state: 'attached' })
    await tab.waitForLoadState('networkidle')
    assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.equal(await tab.locator('#civic-details-panel').isVisible(), false)
    assert.equal(await tab.locator('#civic-journey-outline').isVisible(), width >= 1180)
    if (width === 390) {
      const targets = await tab.locator('.rh-brand [data-civic-control], .rh-map-bar [data-civic-control]').evaluateAll(rows => rows.map(row => ({ label: row.getAttribute('aria-label') ?? row.textContent, height: row.getBoundingClientRect().height })).filter(row => row.height > 0))
      for (const target of targets) assert.ok(target.height >= 44, JSON.stringify(target))
    }
    await tab.getByRole('button', { name: /^Viewport ·/ }).click()
    await fits(tab.locator('[data-slot="popover-content"]'), width, height)
    await tab.keyboard.press('Tab')
    assert.equal(await tab.evaluate(() => { const element = document.activeElement, style = getComputedStyle(element); return element.matches(':focus-visible') && (style.boxShadow !== 'none' || style.outlineStyle !== 'none') }), true)
    await tab.keyboard.press('Escape')
    await tab.locator('.rh-project-trigger').click()
    const modal = tab.getByRole('dialog', { name: 'Projects & versions', exact: true })
    await modal.locator('.civic-version-toggle').nth(9).waitFor()
    await fits(modal, width, height)
    const footer = modal.locator('.civic-version-footer'), before = await footer.boundingBox()
    const scroll = modal.getByRole('region', { name: 'Available versions', exact: true })
    assert.equal(await scroll.evaluate(element => element.scrollHeight > element.clientHeight), true)
    await scroll.evaluate(element => { element.scrollTop = element.scrollHeight })
    assert.ok(await scroll.evaluate(element => element.scrollTop > 0))
    assert.deepEqual(await footer.boundingBox(), before, 'Actions stay fixed while versions scroll')
    await fits(footer, width, height)
    await tab.getByRole('button', { name: 'Close project picker', exact: true }).click()
    await modal.waitFor({ state: 'detached' })
    await tab.waitForFunction(() => document.querySelector('.rh-project-trigger') === document.activeElement)
    assert.equal(await tab.locator('.rh-project-trigger').evaluate(element => element === document.activeElement), true)
    await tab.close()
  }
})
