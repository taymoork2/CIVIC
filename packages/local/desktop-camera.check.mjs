import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { _electron } = createRequire(new URL('../canvas/package.json', import.meta.url))('@playwright/test')
assert.ok(process.env.CIVIC_TEST_ORIGIN)
const store = await mkdtemp(join(tmpdir(), 'civic-camera-'))
const env = { ...process.env, CIVIC_LOCAL_STORE: store, CIVIC_DESKTOP_ORIGIN: process.env.CIVIC_TEST_ORIGIN }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: env.CIVIC_ELECTRON_BINARY, args: [fileURLToPath(new URL('desktop.mjs', import.meta.url))], env })
const budget = setTimeout(() => app.process().kill(), 90000)
try {
  const page = await app.firstWindow()
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(1440, 900))
  await page.getByLabel('Application flow overview', { exact: true }).waitFor()
  await page.waitForTimeout(2500)
  const client = await page.context().newCDPSession(page)
  await client.send('Profiler.enable')
  await client.send('Profiler.start')
  const measure = () => page.evaluate(async () => {
    const canvas = document.querySelector('.rh-canvas'), scene = document.querySelector('.app-scene')
    const frames = [], longTasks = [], readouts = new Set()
    const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)))
    observer.observe({ type: 'longtask', buffered: false })
    let previous, updates = 0, outlineChanges = 0
    const mutations = new MutationObserver(records => {
      updates += records.filter(record => record.target === scene && record.attributeName === 'style').length
      outlineChanges += records.filter(record => record.type === 'childList').length
    })
    mutations.observe(document.querySelector('#civic-journey-outline'), { subtree: true, childList: true })
    mutations.observe(scene, { attributes: true, attributeFilter: ['style'] })
    const rect = canvas.getBoundingClientRect()
    for (let frame = 0; frame < 180; frame++) {
      const now = await new Promise(requestAnimationFrame)
      if (previous) frames.push(now - previous)
      previous = now
      if (frame >= 120) readouts.add(document.querySelector('[aria-label="Zoom options"]').textContent)
      canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, deltaX: frame < 120 ? (frame < 60 ? 9 : -9) : 0, deltaY: frame < 120 ? (frame < 60 ? 5 : -5) : (frame < 150 ? -5 : 5), ctrlKey: frame >= 120 }))
    }
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
    observer.disconnect(); mutations.disconnect()
    frames.sort((a, b) => a - b)
    return { frames: frames.length, p50: frames[Math.floor(frames.length * .5)], p95: frames[Math.floor(frames.length * .95)], max: frames.at(-1), over25ms: frames.filter(value => value > 25).length, longTasks, cameraUpdates: updates, outlineChanges, zoomReadouts: readouts.size, screenNodes: document.querySelectorAll('.app-screen').length, paths: document.querySelectorAll('.app-overview .rh-selectable-path').length }
  })
  const result = await measure()
  const { profile } = await client.send('Profiler.stop')
  await writeFile(join(store, 'profile.json'), JSON.stringify(profile))
  const hits = new Map(), nodes = new Map(profile.nodes.map(node => [node.id, node]))
  for (const id of profile.samples ?? []) {
    const frame = nodes.get(id).callFrame, name = `${frame.functionName} ${frame.url}:${frame.lineNumber}`
    hits.set(name, (hits.get(name) ?? 0) + 1)
  }
  await writeFile(join(store, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ ...result, hot: [...hits].sort((a, b) => b[1] - a[1]).slice(0, 16), evidence: store }, null, 2))
  assert.ok(result.cameraUpdates > 100)
  assert.ok(result.paths > 0)
  const check = result => {
    assert.ok(result.p95 < 25, `95th percentile frame interval exceeded 25ms: ${JSON.stringify(result)}`)
    assert.ok(result.over25ms < result.frames * .05, 'At least 95% of frames stay within 25ms')
    assert.equal(result.outlineChanges, 0, 'The outline does not rebuild during camera movement')
    assert.ok(result.zoomReadouts > 10, 'The zoom readout stays live during pinching')
  }
  check(result)
  await page.waitForFunction(() => !document.querySelector('.rh-canvas.is-navigating'))
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(390, 844))
  await page.getByRole('button', { name: 'App', exact: true }).click()
  await page.waitForTimeout(500)
  const narrow = await measure()
  console.log(JSON.stringify({ narrow }))
  check(narrow)
  await page.waitForFunction(() => !document.querySelector('.rh-canvas.is-navigating'))
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(1440, 900))
  await page.getByRole('button', { name: 'App', exact: true }).click()
  await page.getByRole('button', { name: 'Open Home flow', exact: true }).click()
  await page.getByLabel('Application flow overview', { exact: true }).waitFor({ state: 'hidden' })
  const detailPaths = await page.locator('.app-connection-edges .rh-selectable-path').count()
  assert.ok(detailPaths > 0)
  await page.waitForTimeout(2500)
  await client.send('Profiler.start')
  const detail = await measure()
  const detailProfile = await client.send('Profiler.stop')
  await writeFile(join(store, 'detail-profile.json'), JSON.stringify(detailProfile.profile))
  console.log(JSON.stringify({ detail }))
  check(detail)
  assert.equal(await page.locator('.app-connection-edges .rh-selectable-path').count(), detailPaths, 'Detail paths remain mounted throughout camera motion')
  const aligned = await page.evaluate(() => {
    const cards = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.app-scene')).transform)
    const edges = document.querySelector('.app-connection-edges > g').getCTM()
    return ['a', 'd', 'e', 'f'].every(key => Math.abs(cards[key] - edges[key]) < .01)
  })
  assert.ok(aligned, 'Paths and screen cards use the same camera transform')
  await writeFile(join(store, 'all-sizes.json'), JSON.stringify({ desktop: result, narrow, detail }, null, 2))
  console.log(JSON.stringify({ narrow, detail }, null, 2))
  await page.waitForFunction(() => !document.querySelector('.rh-canvas.is-navigating'))
  const scene = page.locator('.app-scene'), canvas = page.getByLabel('Entire application canvas', { exact: true })
  await page.getByRole('button', { name: 'Hand tool', exact: true }).click()
  const box = await canvas.boundingBox(), before = await scene.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).e)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 20 })
  await page.mouse.up()
  assert.ok(Math.abs(await scene.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).e) - before - 80) < 1)
  await page.getByRole('button', { name: 'Select tool', exact: true }).click()
  await page.getByRole('button', { name: 'App', exact: true }).click()
  await page.getByLabel('Application flow overview', { exact: true }).waitFor()
} finally {
  clearTimeout(budget)
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
  await app.close().catch(() => {})
}
