import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import type { Annotation } from '../../graph/src/index.ts'
import { createOverlayServer } from '../src/overlay/server.ts'
import { readCheckout, Store } from '../src/index.ts'

// D40: the capture overlay in a dev page writes the same Annotation a canvas capture does.
const repo = mkdtempSync(join(tmpdir(), 'civic-overlay-'))
const servers: Server[] = []
if (!process.env.CIVIC_BROWSER_PATH && existsSync('/opt/pw-browsers/chromium')) process.env.CIVIC_BROWSER_PATH = '/opt/pw-browsers/chromium'

const listen = async (server: Server) => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
}
let overlay = ''
let store: Store

before(async () => {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'reviewer@example.com')
  writeFileSync(join(repo, 'README'), 'x'); git('add', '.'); git('commit', '-q', '-m', 'init')
  const checkout = readCheckout(repo)
  store = Store.forCheckout(checkout)
  overlay = await listen(createOverlayServer(() => ({ store, checkout: readCheckout(repo), identity: { type: 'person', handle: 'reviewer' } })))
})

after(() => { for (const server of servers) server.close() })

test('only loopback pages can write, and the page URL must be the sender', async () => {
  const post = (origin: string, url: string) => fetch(`${overlay}/annotate`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ comment: 'x', url, viewport: { width: 400, height: 400 }, rect: { x: 0, y: 0, width: 1, height: 1 }, html: '<p>x</p>' }) })
  assert.equal((await post('https://evil.example', 'https://evil.example/')).status, 403)
  assert.equal((await post('http://127.0.0.1:9', 'http://127.0.0.1:10/')).status, 400)
  assert.equal((await fetch(`${overlay}/overlay.js`)).status, 200)
})

test('selecting an element in a dev page records an anchored annotation with its capture', async (t) => {
  let chromium
  try { ({ chromium } = await import('playwright-core')) } catch { return t.skip('playwright-core is not installed') }
  const app = await listen(createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><html><head><style>h2{color:rgb(200,0,0)}</style></head><body>
      <section data-civic-id="instance:demo.pack.label"><h2>Pick a colour</h2><button>Continue</button></section>
      <script src="${overlay}/overlay.js" defer></script></body></html>`)
  }))
  let browser
  try { browser = await chromium.launch({ headless: true, ...(process.env.CIVIC_BROWSER_PATH ? { executablePath: process.env.CIVIC_BROWSER_PATH } : {}) }) } catch (error) { return t.skip(`No browser: ${(error as Error).message.split('\n')[0]}`) }
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.goto(`${app}/intake?step=color`)
    await page.waitForFunction(() => '__civicOverlay' in globalThis)
    await page.keyboard.press('Alt+Shift+KeyC')
    const button = await page.getByRole('button', { name: 'Continue' }).boundingBox()
    await page.mouse.click(button!.x + button!.width / 2, button!.y + button!.height / 2)
    await page.getByLabel('Comment').fill('Continue should stay visible at 200% text.')
    await page.getByRole('button', { name: 'Save annotation' }).click()
    await page.getByRole('status').filter({ hasText: 'Saved' }).waitFor()
  } finally {
    await browser.close()
  }
  const annotation = store.read().records.find((record): record is Annotation => record.kind === 'annotation')!
  assert.equal(annotation.comment, 'Continue should stay visible at 200% text.')
  assert.deepEqual(annotation.anchor!.targetIds, ['instance:demo.pack.label'])
  assert.deepEqual(annotation.anchor!.locator, { role: 'button', name: 'Continue' })
  assert.equal(annotation.anchor!.rect!.label, 'Continue')
  assert.equal(annotation.capture!.reproduction, '/intake?step=color')
  assert.deepEqual(annotation.capture!.viewport, { width: 800, height: 600 })
  assert.ok(existsSync(store.capturePath(annotation.capture!)))
  assert.equal(annotation.writtenBy, 'actor:person.reviewer')
  assert.equal(annotation.seenOn.line, 'line:git.main')
})
