// Decision 0010, step 3: an app outside CIVIC installs CIVIC's packages from a CIVIC commit and opens in the
// standalone canvas. It installs @civic/canvas, @civic/shell and @civic/vite-connector from git, pinned to one
// commit, into an empty folder, copies the Notebook example out of the installed canvas, starts `civic-canvas`
// from the installed package and reads the canvas and its review index.
//
//   node packages/install.check.mjs [--source <git url>] [--commit <sha>]
//
// The source defaults to this checkout (`git+file://`), so it checks exactly the committed tree; an app uses
// `git+https://github.com/taymoork2/CIVIC.git`. Uncommitted changes are never installed.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const civic = join(dirname(fileURLToPath(import.meta.url)), '..')
const { values } = parseArgs({ options: { source: { type: 'string' }, commit: { type: 'string' }, keep: { type: 'boolean' } } })
const commit = values.commit ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: civic, encoding: 'utf8' }).trim()
const source = values.source ?? `git+${pathToFileURL(civic).href}`
const names = ['canvas', 'shell', 'vite-connector']
const spec = (name) => `${source}#${commit}&path:/packages/${name}`

const app = await realpath(await mkdtemp(join(tmpdir(), 'civic-install-')))
try {
  // The app depends on all three: the canvas and the connector take the shell (and the canvas the connector) as peers.
  await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'empty-app', private: true, type: 'module', dependencies: Object.fromEntries(names.map((name) => [`@civic/${name}`, spec(name)])) }, null, 2))
  await writeFile(join(app, 'pnpm-workspace.yaml'), 'allowBuilds:\n  esbuild: true\n')
  execFileSync('pnpm', ['install'], { cwd: app, stdio: ['ignore', 'ignore', 'inherit'] })
  const lock = await readFile(join(app, 'pnpm-lock.yaml'), 'utf8')
  for (const name of names) assert.match(lock, new RegExp(`${commit}&path:/packages/${name}\\b`), `@civic/${name} is pinned to ${commit}`)

  // An app of its own, outside CIVIC's tree, taken from the installed canvas.
  const installed = join(app, 'node_modules/@civic/canvas')
  await cp(join(installed, 'examples/notebook'), join(app, 'notebook'), { recursive: true })
  const { startCanvas } = await import(pathToFileURL(join(installed, 'server/canvas-host.mjs')).href)
  const server = await startCanvas({ project: join(app, 'notebook/civic.project.json'), store: join(app, '.civic'), port: 0, logLevel: 'silent' })
  try {
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    const page = await fetch(origin + '/review')
    assert.equal(page.status, 200)
    const cookie = page.headers.get('set-cookie').split(';')[0]
    const index = await (await fetch(origin + '/api/review/index', { headers: { cookie } })).json()
    assert.equal(index.project.name, 'Notebook')
    assert.equal(index.connection.applicationRoot, join(app, 'notebook'))
    assert.ok(index.scenarios.length > 0)
    // The canvas's own entry compiles from the installed package.
    const main = await fetch(`${origin}/@fs${await realpath(installed)}/src/main.tsx`, { headers: { cookie } })
    assert.equal(main.status, 200)
    // And it draws the app and plays a screen in a browser, when one is installed.
    const { moduleReviewAdapter } = await import(pathToFileURL(join(installed, 'server/module-adapter.mjs')).href)
    let browser
    try { browser = await moduleReviewAdapter.launchFixtureBrowser() } catch { console.log('No browser for Playwright; skipped drawing the canvas.') }
    if (browser) {
      try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } })
        const errors = []
        tab.on('pageerror', (error) => errors.push(error.message))
        await tab.goto(origin + '/review')
        await tab.locator('.app-nav-section button', { hasText: 'Write a note' }).click({ timeout: 30000 })
        await tab.locator('.app-screen > button', { hasText: 'Notebook home' }).click()
        await tab.getByRole('button', { name: 'Play this screen' }).click()
        await tab.frameLocator('iframe[title="Live Notebook home"]').locator('[data-rehearsal-ready="true"]').waitFor({ state: 'attached', timeout: 30000 })
        assert.deepEqual(errors, [])
      } finally {
        await browser.close()
      }
    }
    console.log(`Installed @civic/canvas, shell and vite-connector from ${commit.slice(0, 12)} into an empty app; the canvas opened Notebook with ${index.scenarios.length} screens.`)
  } finally {
    await server.close()
  }
} finally {
  if (values.keep) console.log(`Kept ${app}`)
  else await rm(app, { recursive: true, force: true })
}
