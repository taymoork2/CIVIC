import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, writeFile, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { applicationRoot, reviewOverlay } from './review-application.mjs'
import { reviewInventory } from './review-inventory.mjs'

const repo = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '')

test('linked application inventory uses product sources and local Rehearsal ownership', async () => {
  const app = await realpath(await mkdtemp(join(tmpdir(), 'rehearsal-linked-check-')))
  for (const path of ['apps/web/src', 'apps/web/public', 'packages', 'convex']) await cp(join(repo, path), join(app, path), { recursive: true, filter: (path) => !path.includes('/node_modules') && !path.includes('/dist') })
  for (const path of ['package.json', 'pnpm-lock.yaml', 'apps/web/package.json']) await cp(join(repo, path), join(app, path))
  await symlink(join(repo, '.git'), join(app, '.git'))
  await mkdir(join(app, '.review-data'))
  await writeFile(join(app, '.review-data/application.json'), JSON.stringify({ root: app }))
  assert.equal(applicationRoot(app, app), app)
  assert.equal(applicationRoot(app, ''), app)
  await writeFile(join(app, 'apps/web/src/review/scenarios.json'), 'invalid application-owned registry')
  const path = 'apps/web/src/routes/index.tsx'
  const original = await readFile(join(app, path), 'utf8')
  await writeFile(join(app, path), original + '\n// linked application marker\n')
  const first = await reviewInventory(repo, '/nonexistent-design', app)
  assert.equal(first.metadata.connection.applicationRoot, app)
  assert.equal(first.metadata.connection.rehearsalRoot, repo)
  assert.equal(first.metadata.connection.mode, 'read-only-linked-checkout')
  assert.match(first.evidence.get(path), /linked application marker/)
  assert.doesNotMatch(first.evidence.get('apps/web/src/review/scenarios.json'), /invalid application/)
  const assets = join(app, 'apps/web/public/rehearsal-test.svg')
  await writeFile(assets, '<svg/>')
  await mkdir(join(app, 'apps/web/public/design'), { recursive: true })
  await writeFile(join(app, 'apps/web/public/design/care-complete.webp'), 'synthetic-image')
  const next = await reviewInventory(repo, '/nonexistent-design', app)
  assert.notEqual(first.metadata.revision.source, next.metadata.revision.source)
  assert.notEqual(first.metadata.fixtureSource, next.metadata.fixtureSource)
  assert.equal(await readFile(join(app, path), 'utf8'), original + '\n// linked application marker\n', 'inventory never writes application files')

  // Exercise real Vite watching and cache invalidation in two disposable checkouts.
  const host = await realpath(await mkdtemp(join(tmpdir(), 'rehearsal-host-check-')))
  const hostWeb = join(host, 'apps/web')
  await mkdir(hostWeb, { recursive: true })
  await cp(join(repo, 'apps/web/scripts'), join(hostWeb, 'scripts'), { recursive: true })
  await cp(join(repo, 'apps/web/src'), join(hostWeb, 'src'), { recursive: true })
  for (const name of ['e2e', 'node_modules']) await symlink(join(repo, 'apps/web', name), join(hostWeb, name))
  for (const name of ['package.json', 'playwright.config.ts', 'tsconfig.json', 'vite.config.ts', 'review.html', 'review-frame.html']) await cp(join(repo, 'apps/web', name), join(hostWeb, name))
  for (const name of ['package.json', 'pnpm-lock.yaml', 'rehearsal.project.json']) await cp(join(repo, name), join(host, name))
  await symlink(join(repo, '.git'), join(host, '.git'))
  await mkdir(join(host, 'docs/design/review-product'), { recursive: true })
  await cp(join(repo, 'docs/design/review-product/coverage.json'), join(host, 'docs/design/review-product/coverage.json'))
  await mkdir(join(host, '.review-data'))
  await writeFile(join(host, '.review-data/application.json'), JSON.stringify({ root: app }))
  const { createServer } = await import('vite')
  const { reviewPlugin } = await import(join(hostWeb, 'scripts/review-plugin.mjs'))
  const server = await createServer({ configFile: false, root: hostWeb, cacheDir: join(host, '.vite'), optimizeDeps: { noDiscovery: true, entries: [] }, resolve: { alias: { '@': join(hostWeb, 'src'), '@convex': join(host, 'convex') } }, server: { host: '127.0.0.1', port: 0, hmr: false, preTransformRequests: false }, plugins: [reviewPlugin()] })
  try {
    await server.listen()
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    const entry = await fetch(origin + '/review')
    const headers = { cookie: entry.headers.get('set-cookie').split(';')[0] }
    const index = async () => { const response = await fetch(origin + '/api/review/index', { headers }); assert.equal(response.status, 200); return response.json() }
    const before = await index()
    const image = await fetch(origin + '/design/care-complete.webp', { headers })
    assert.equal(image.status, 200); assert.equal(await image.text(), 'synthetic-image')
    assert.equal((await fetch(origin + '/design/secret.txt', { headers })).status, 404)
    const watched = join(app, 'apps/web/src/copy/feedback.ts')
    const url = `${origin}/@fs/${watched}`
    assert.equal((await fetch(url, { headers })).status, 200)
    const prior = await readFile(watched, 'utf8')
    await writeFile(watched, prior + '\nexport const rehearsalWatchMarker = "linked change"\n')
    let after = before
    for (let attempt = 0; attempt < 50 && after.revision.source === before.revision.source; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      after = await index()
    }
    assert.notEqual(after.revision.source, before.revision.source, 'linked edits refresh source receipts without restarting')
    assert.notEqual(after.fixtureSource, before.fixtureSource, 'linked edits invalidate snapshots')
    assert.match(await (await fetch(url, { headers })).text(), /rehearsalWatchMarker/, 'new module requests compile the updated linked code')
    for (const denied of ['/api/live', '/@fs/etc/passwd', `/@fs/${app}/.env.local`, `/@fs/${app}/.git/config`]) assert.equal((await fetch(origin + denied, { headers })).status, 404, denied)
    assert.equal(await readFile(join(host, '.review-data/application.json'), 'utf8'), JSON.stringify({ root: app }), 'connection remains local to Rehearsal')
  } finally { await server.close() }
})

test('preview hook overlay is bounded, preserves app code, and refuses drift', async () => {
  const paths = ['closet/add-clothes', 'dev/closet-preview', 'dev/household-preview', 'dev/fixture-preview', 'routes/design-preview']
  for (const name of paths) {
    const path = `apps/web/src/${name}.tsx`
    const current = await readFile(join(repo, path), 'utf8')
    const overlaid = reviewOverlay(path, current)
    if (name === 'closet/add-clothes') {
      assert.match(overlaid, /review\?: ReviewIntakeProps/)
      const nativeCalls = (code) => code.match(/const calls: AddCalls = \{[\s\S]*?\n  \}/)?.[0]
      assert.equal(nativeCalls(overlaid), nativeCalls(current), 'native mutation hooks stay unchanged')
      assert.equal(reviewOverlay(path, overlaid), overlaid, 'overlay is idempotent')
    } else assert.equal(overlaid, current, 'existing review hooks remain unchanged')
  }
  // Remove only the fixture export to exercise the account-free external adapter.
  const path = 'apps/web/src/dev/closet-preview.tsx'
  const product = (await readFile(join(repo, path), 'utf8')).replace('export { textiles as reviewTextiles, record as reviewGarmentRecord }', '')
  const overlaid = reviewOverlay(path, product)
  assert.ok(overlaid.startsWith(product), 'product behavior is preserved')
  assert.match(overlaid, /as reviewTextiles/)
  assert.throws(() => reviewOverlay('apps/web/src/closet/add-clothes.tsx', 'export function ChangedIntake() {}'), /adapter drift/)
  assert.equal(reviewOverlay('apps/web/src/closet/unrelated.tsx', 'unchanged'), 'unchanged')
  const movedHome = "const Home = lazy(() => import('@/home/home-page'))"
  const adaptedHome = reviewOverlay('apps/web/src/routes/index.tsx', movedHome)
  assert.match(adaptedHome, /export \{ HomeOverview \} from '@\/home\/home-page'/)
  assert.equal(reviewOverlay('apps/web/src/routes/index.tsx', adaptedHome), adaptedHome)
})
