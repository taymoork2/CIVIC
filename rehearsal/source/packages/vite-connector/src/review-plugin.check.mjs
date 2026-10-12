import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { civicReview } from './review-plugin.mjs'

const workspace = fileURLToPath(new URL('../../../', import.meta.url))
const notebook = join(workspace, 'apps/web/examples/rehearsal-demo')
const page = '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>\n'
// The least a host gives the shell: no journey screens and no proposals.
const adapter = { screens: [], journeyGraph: () => [], pathId: (from, to, action) => JSON.stringify([from, to, action]), proposalProperties: [], captureFixture: async () => { throw Error('No fixture expected') } }

async function host(manifest) {
  const repo = await realpath(await mkdtemp(join(tmpdir(), 'civic-vite-connector-')))
  const web = join(repo, 'review'); await mkdir(web)
  for (const name of ['review.html', 'review-frame.html']) await writeFile(join(web, name), page)
  const app = join(repo, 'app'); await cp(notebook, app, { recursive: true })
  if (manifest) await writeFile(join(app, 'civic.project.json'), JSON.stringify({ ...JSON.parse(await readFile(join(app, 'civic.project.json'), 'utf8')), ...manifest }))
  await mkdir(join(repo, '.review-data'))
  await writeFile(join(repo, '.review-data/application.json'), JSON.stringify({ project: join(app, 'civic.project.json') }))
  return { repo, web, app }
}

test('the connector imports only Node, Vite and the CIVIC shell', async () => {
  for (const file of await readdir(fileURLToPath(new URL('.', import.meta.url)))) {
    if (file.endsWith('.check.mjs')) continue
    const code = await readFile(new URL(file, import.meta.url), 'utf8')
    // Module imports start a line; generated candidate code inside template strings does not.
    for (const [, specifier] of code.matchAll(/^(?:import|export)\s[^'"\n]*from\s*["']([^"']+)["']|\bawait import\(\s*["']([^"']+)["']/gm).map(([match, a, b]) => [match, a ?? b])) assert.match(specifier, /^(?:node:|vite\/?|@civic\/shell\/server|\.\/review-[a-z-]+\.mjs$)/, `${file} imports ${specifier}`)
  }
})

test('a plain module app connects through the connector alone, with no app connector registered', async () => {
  const { repo, web, app } = await host()
  const { createServer } = await import('vite')
  const server = await createServer({ configFile: false, root: web, cacheDir: join(repo, '.vite'), logLevel: 'silent', optimizeDeps: { noDiscovery: true, entries: [] }, server: { host: '127.0.0.1', port: 0, hmr: false, preTransformRequests: false }, plugins: [civicReview({ host: web, repo, engineRoots: [], review: () => ({ adapter }) })] })
  try {
    await server.listen()
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    const response = await fetch(origin + '/review')
    assert.equal(response.status, 200)
    const headers = { cookie: response.headers.get('set-cookie').split(';')[0] }
    const index = await (await fetch(origin + '/api/review/index', { headers })).json()
    assert.equal(index.project.adapter, 'module')
    assert.equal(index.project.name, 'Notebook')
    assert.equal(index.connection.applicationRoot, app)
    assert.ok(index.scenarios.length > 0)
    assert.deepEqual(Object.keys(index.fixtureHashes).sort(), index.scenarios.map((row) => row.id).sort())
    // The app's own sources are served to review frames; live app routes are not.
    assert.equal((await fetch(origin + '/@fs' + join(app, 'src/rehearsal.js'), { headers })).status, 200)
    assert.equal((await fetch(origin + '/api/auth/session', { headers })).status, 404)
    assert.equal((await fetch(origin + '/@fs' + join(repo, '.review-data/application.json'), { headers })).status, 404)
  } finally { await server.close() }
})

test('an app whose adapter kind has no registered connector is refused', async () => {
  const { repo, web } = await host({ adapter: { kind: 'laundry' } })
  assert.throws(() => civicReview({ host: web, repo }), /No connector is registered for adapter kind laundry/)
})
