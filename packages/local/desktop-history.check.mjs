import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { _electron } = createRequire(new URL('../canvas/package.json', import.meta.url))('@playwright/test')
const store = await mkdtemp(join(tmpdir(), 'civic-electron-history-'))
const env = { ...process.env, CIVIC_LOCAL_STORE: store, CIVIC_DESKTOP_ORIGIN: process.env.CIVIC_TEST_ORIGIN ?? 'http://127.0.0.1:3012' }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: env.CIVIC_ELECTRON_BINARY, args: [fileURLToPath(new URL('desktop.mjs', import.meta.url))], env, timeout: 30000 })
const budget = setTimeout(() => app.process().kill(), 120000)
try {
  const page = await app.firstWindow(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('button', { name: 'Open project or checkout', exact: true }).waitFor()
  for (const width of [1440, 768, 390, 360]) {
    await app.evaluate(({ BaseWindow }, width) => BaseWindow.getAllWindows()[0].setSize(width, 900), width)
    for (const name of ['Orca', 'Laundry App']) {
      await page.getByRole('button', { name: 'Open project or checkout', exact: true }).click()
      const picker = page.getByRole('dialog', { name: 'Projects & versions', exact: true })
      await picker.getByRole('button', { name: new RegExp(`^${name}(?:\\s*●)?$`) }).click()
      await picker.getByRole('button', { name: 'Preview options for Main branch', exact: true }).waitFor({ timeout: 30000 })
      const branch = picker.locator('.civic-version-toggle').filter({ hasText: 'Branch checkout' }).first()
      await branch.waitFor()
      const graph = picker.getByRole('region', { name: 'Branches', exact: true }).getByRole('img', { name: /^Version relationships\./ })
      assert.equal(await graph.count(), 1)
      await graph.locator('path').first().waitFor({ state: 'attached' })
      assert.ok(await graph.locator('path').count() > 0, 'The graph has visible relationships, not just an accessible label')
      assert.match(await branch.innerText(), /ahead|behind|Same commit/)
      assert.match(await branch.innerText(), /Committed/)
      assert.equal((await branch.innerText()).includes('History unavailable'), false)
      assert.equal(await picker.evaluate(element => element.scrollWidth <= element.clientWidth), true)
      const box = await picker.boundingBox()
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= 901)
      await page.screenshot({ path: join(store, `${name === 'Orca' ? 'orca' : 'laundry'}-history-electron-${width}.png`) })
      await picker.getByRole('button', { name: 'Close project picker', exact: true }).click()
    }
  }
  assert.deepEqual(errors, [])
  console.log(`Orca and Laundry Git history passed in Electron at 1440, 768, 390 and 360px. Evidence: ${store}`)
} finally {
  clearTimeout(budget)
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
  await app.close().catch(() => {})
}
