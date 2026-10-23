import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import type { Annotation, Line } from '../../graph/src/index.ts'
import { createInjectingProxy, readCheckout, startReviewApp, Store, type Context, type ReviewApp } from '../src/index.ts'

// Decision 0019: a running app is served with the overlay in its pages, and filed under its checkout's line.
const repo = mkdtempSync(join(tmpdir(), 'civic-review-app-'))
const servers: Server[] = []
const apps: ReviewApp[] = []
if (!process.env.CIVIC_BROWSER_PATH && existsSync('/opt/pw-browsers/chromium')) process.env.CIVIC_BROWSER_PATH = '/opt/pw-browsers/chromium'

const listen = async (server: Server) => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
}
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
const TAG = '<script src="http://127.0.0.1:1/overlay.js" defer></script>'
let store: Store
let upstream = ''
let context: Context

before(async () => {
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'reviewer@example.com')
  writeFileSync(join(repo, 'README'), 'x'); git('add', '.'); git('commit', '-q', '-m', 'init')
  git('checkout', '-q', '-b', 'feat/screens')
  writeFileSync(join(repo, 'README'), 'y'); git('commit', '-q', '-am', 'screens')
  git('checkout', '-q', '--detach', 'feat/screens')
  const checkout = readCheckout(repo)
  store = Store.forCheckout(checkout)
  context = { store, checkout, identity: { type: 'person', handle: 'reviewer' } }
  upstream = await listen(createServer((req, res) => {
    if (req.url === '/app.json') return void res.writeHead(200, { 'content-type': 'application/json' }).end('{"head":"</head>"}')
    res.writeHead(200, { 'content-type': 'text/html', etag: 'x' })
    res.end(`<!doctype html><html><head><style>h2{color:rgb(200,0,0)}</style></head><body>
      <section data-civic-id="instance:demo.pack.label"><h2>Pick a colour</h2><button>Continue</button></section></body></html>`)
  }).on('upgrade', (_req, socket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: echo\r\nConnection: Upgrade\r\n\r\n')
    socket.pipe(socket)
  }))
})

after(async () => {
  for (const app of apps) await app.close()
  for (const server of servers) { server.closeAllConnections(); server.close() }
})

test('the proxy puts the tag in HTML only, and tunnels upgrades', async () => {
  const proxy = await listen(createInjectingProxy(upstream, TAG))
  const page = await fetch(`${proxy}/some/route`)
  const html = await page.text()
  assert.ok(html.includes(`${TAG}</head>`))
  assert.equal(page.headers.get('etag'), null)
  assert.equal(await (await fetch(`${proxy}/app.json`)).text(), '{"head":"</head>"}')

  const echoed = await new Promise<string>((resolve, reject) => {
    const req = request(`${proxy}/ws`, { headers: { Connection: 'Upgrade', Upgrade: 'echo' } })
    req.on('upgrade', (_res, socket) => { socket.once('data', (data) => { socket.destroy(); resolve(String(data)) }); socket.write('ping') })
    req.on('error', reject)
    req.end()
  })
  assert.equal(echoed, 'ping')
})

test('only a loopback app is proxied, and only to loopback callers', async () => {
  assert.throws(() => createInjectingProxy('http://example.com', TAG), /loopback/)
  const proxy = await listen(createInjectingProxy(upstream, TAG))
  const status = await new Promise<number>((resolve) => request(proxy, { headers: { host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode ?? 0) }).end())
  assert.equal(status, 403)
})

test('a checkout with uncommitted changes is not reviewed', async () => {
  writeFileSync(join(repo, 'README'), 'changed')
  await assert.rejects(startReviewApp(context, { upstream, branch: 'feat/screens' }), /uncommitted/)
  git('checkout', '--', 'README')
  await assert.rejects(startReviewApp(context, { upstream, branch: 'main' }), /not at the head of main/)
})

test('an annotation made through the proxy lands on the branch and revision, and stopping unregisters the preview', async (t) => {
  let chromium
  try { ({ chromium } = await import('playwright-core')) } catch { return t.skip('playwright-core is not installed') }
  let browser
  try { browser = await chromium.launch({ headless: true, ...(process.env.CIVIC_BROWSER_PATH ? { executablePath: process.env.CIVIC_BROWSER_PATH } : {}) }) } catch (error) { return t.skip(`No browser: ${(error as Error).message.split('\n')[0]}`) }
  const app = await startReviewApp(context, { upstream, branch: 'feat/screens' })
  apps.push(app)
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.goto(`${app.origin}/intake`)
    await page.waitForFunction(() => '__civicOverlay' in globalThis)
    await page.keyboard.press('Alt+Shift+KeyC')
    const button = await page.getByRole('button', { name: 'Continue' }).boundingBox()
    await page.mouse.click(button!.x + button!.width / 2, button!.y + button!.height / 2)
    await page.getByLabel('Comment').fill('Continue is too close to the heading.')
    await page.getByRole('button', { name: 'Save annotation' }).click()
    await page.getByRole('status').filter({ hasText: 'Saved' }).waitFor()
  } finally {
    await browser.close()
  }
  const annotation = store.read().records.find((record): record is Annotation => record.kind === 'annotation')!
  assert.equal(annotation.seenOn.line, 'line:git.feat.screens')
  assert.equal(annotation.seenOn.revision, git('rev-parse', 'feat/screens'))
  assert.deepEqual(annotation.anchor!.targetIds, ['instance:demo.pack.label'])
  assert.equal(annotation.seenOn.url, `${app.origin}/intake`)

  const line = () => store.read().records.find((record): record is Line => record.id === 'line:git.feat.screens')!
  assert.deepEqual(line().previews?.map((preview) => preview.url), [app.origin])
  await app.close()
  assert.deepEqual(line().previews, [])
})
