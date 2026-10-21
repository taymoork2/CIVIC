import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { _electron } = createRequire(new URL('../canvas/package.json', import.meta.url))('@playwright/test')
assert.ok(process.env.CIVIC_TEST_ORIGIN, 'Set CIVIC_TEST_ORIGIN to a running project with cross-journey connections')
const store = await mkdtemp(join(tmpdir(), 'civic-electron-paths-'))
const env = { ...process.env, CIVIC_LOCAL_STORE: store, CIVIC_DESKTOP_ORIGIN: process.env.CIVIC_TEST_ORIGIN }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: env.CIVIC_ELECTRON_BINARY, args: [fileURLToPath(new URL('desktop.mjs', import.meta.url))], env, timeout: 30000 })
const budget = setTimeout(() => app.process().kill(), 120000)
try {
  const page = await app.firstWindow(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  const overview = page.getByLabel('Application flow overview', { exact: true })
  const paths = overview.locator('.rh-selectable-path')
  await paths.first().waitFor()
  const labels = await paths.evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')))
  const originalCount = labels.reduce((total, label) => total + Number(/(\d+) paths?/.exec(label)?.[1] ?? 0), 0)
  const count = labels.length
  assert.ok(count > 0 && originalCount > count, 'Overview aggregates paths while retaining the original counts')
  for (const width of [1440, 768, 390, 360]) {
    await app.evaluate(({ BaseWindow }, width) => BaseWindow.getAllWindows()[0].setSize(width, 900), width)
    await page.getByRole('button', { name: 'App', exact: true }).click()
    assert.equal(await paths.count(), count)
    assert.equal(await overview.locator('.civic-connection-label').evaluateAll(elements => elements.every(element => getComputedStyle(element).opacity === '0')), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: join(store, `overview-${width}.png`) })
    const scene = page.locator('.app-scene'), before = await scene.getAttribute('style')
    const box = await page.getByLabel('Entire application canvas', { exact: true }).boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(180, 120)
    await page.waitForFunction(before => document.querySelector('.app-scene').getAttribute('style') !== before, before)
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
    assert.equal(await paths.count(), count, 'Panning and zooming retain every overview relationship')
    assert.equal(await paths.locator('.rh-path-hit').evaluateAll(elements => elements.every(element => element.getTotalLength() > 0)), true)
  }
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(1440, 900))
  await page.getByRole('button', { name: 'App', exact: true }).click()
  const index = labels.findIndex(label => Number(/(\d+) paths?/.exec(label)?.[1] ?? 0) > 1)
  const selected = paths.nth(index)
  const pointer = await selected.locator('.rh-path-hit').evaluate(element => {
    const point = element.getPointAtLength(element.getTotalLength() / 2)
    const screen = new DOMPoint(point.x, point.y).matrixTransform(element.getScreenCTM())
    return { x: screen.x, y: screen.y }
  })
  await page.mouse.move(pointer.x, pointer.y)
  await page.waitForFunction(() => [...document.querySelectorAll('.app-overview .civic-connection-label')].some(element => getComputedStyle(element).opacity === '1'))
  await page.mouse.click(pointer.x, pointer.y)
  await page.locator('.rh-shared-navigation').waitFor()
  await page.getByRole('button', { name: 'App', exact: true }).click()
  await selected.focus()
  await page.waitForFunction(() => getComputedStyle(document.activeElement.querySelector('.civic-connection-label')).opacity === '1')
  await selected.press('Enter')
  const connections = page.locator('.rh-shared-navigation')
  await connections.waitFor()
  assert.equal(await connections.getByRole('button').count(), Number(/(\d+) paths?/.exec(labels[index])[1]))
  await page.screenshot({ path: join(store, 'overview-selected.png') })
  await connections.getByRole('button').first().click()
  await overview.waitFor({ state: 'hidden' })
  assert.ok(await page.locator('.app-detail-scene .rh-selectable-path.is-selected, .app-connection-edges .rh-selectable-path.is-selected').count() > 0, 'The original screen path remains reviewable')
  assert.deepEqual(errors, [])
  console.log(`${originalCount} screen paths consolidated into ${count} journey relationships. Zoom, pan, keyboard labels and member review passed at 1440, 768, 390 and 360px. Evidence: ${store}`)
} finally {
  clearTimeout(budget)
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
  await app.close().catch(() => {})
}
