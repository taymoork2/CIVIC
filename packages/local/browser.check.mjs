import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { store } from './onboard.mjs'

const { chromium, expect } = createRequire(new URL('../canvas/package.json', import.meta.url))('@playwright/test')
const base = process.env.CIVIC_TEST_ORIGIN ?? 'http://127.0.0.1:3012'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const deadline = setTimeout(() => { console.error('Browser check exceeded its two-minute budget'); void browser.close() }, 120_000)
const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 } })
context.setDefaultTimeout(20_000)
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const index = async () => (await context.request.get('/api/review/index')).json()
const select = async key => {
  const response = await context.request.post('/api/review/projects', { data: { action: 'select', key } })
  assert.equal(response.status(), 200)
  await expect.poll(async () => {
    try { await context.request.get('/review'); return (await index()).project?.key } catch { return null }
  }, { timeout: 30_000 }).toBe(key)
}
try {
  assert.equal((await context.request.get('/api/review/index')).status(), 401)
  await page.goto('/review')
  await expect(page.locator('.rh-project-trigger')).toBeVisible()
  assert.equal(await page.getByLabel('Review key', { exact: true }).count(), 0)
  const connections = await (await context.request.get('/api/review/projects')).json()
  const orca = connections.projects.find(project => project.id === 'orca-design-study')
  const laundry = connections.projects.find(project => project.id === 'laundry-app')
  assert.ok(orca && laundry)
  if ((await index()).project.key !== orca.key) await select(orca.key)
  const orcaIndex = await index()
  assert.equal(new Set(orcaIndex.scenarios.map(screen => screen.fixture.family)).size, 40)
  assert.ok(orcaIndex.scenarios.length >= 195)
  assert.equal(orcaIndex.coverage.targets.length, 12)
  assert.ok(orcaIndex.coverage.targets.every(target => target.verification === 'unverified'))
  assert.ok(orcaIndex.scenarios.every(screen => screen.preview === 'visual-or-partial' && screen.edges.length === 0))
  await page.goto('/review-frame.html?scenario=orca.30.missing&width=1024')
  await expect(page.locator('#review-root')).toHaveAttribute('data-rehearsal-ready', 'true')
  const design = page.frameLocator('iframe[title="Orca design · 30/missing"]')
  await expect(design.locator('#product-main')).not.toBeEmpty()
  await expect(design.locator('#study-current')).toContainText('30 · Metrics overview / missing')
  await page.screenshot({ path: join(store, 'orca-study-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/review')
  await expect(page.locator('.rh-project-trigger')).toBeVisible()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: join(store, 'canvas-phone.png') })
  await page.goto('about:blank')
  await select(laundry.key)
  const laundryIndex = await index()
  assert.ok(laundryIndex.scenarios.length >= 173)
  await page.goto('/review-frame.html?scenario=intake.towel.fabric&journey=towel')
  await expect(page.locator('#review-root')).toHaveAttribute('data-rehearsal-ready', 'true', { timeout: 45_000 })
  await page.getByLabel('Other material 1', { exact: true }).fill('CIVIC migration cotton')
  await expect(page.getByLabel('Other material 1', { exact: true })).toHaveValue('CIVIC migration cotton')
  await page.getByRole('button', { name: /^Next/ }).click()
  await expect.poll(() => page.evaluate(() => window.reviewPreview?.state?.()?.screen)).toBe('intake.towel.color')
  const tape = await page.evaluate(async () => { const bridge = window.reviewPreview?.recording; return typeof bridge === 'function' ? await bridge() : bridge })
  assert.ok(tape.steps.length > 0)
  await page.screenshot({ path: join(store, 'laundry-live-phone.png') })
  await page.goto('about:blank')
  await select(orca.key)
  assert.equal((await index()).project.key, orca.key)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ origin: base, keylessBrowser: true, projects: connections.projects.map(project => project.id), orcaStates: orcaIndex.scenarios.length, laundryScenarios: laundryIndex.scenarios.length, laundryObservedTransition: 'Fabric → Color', screenshots: store }))
} finally { clearTimeout(deadline); await browser.close() }
