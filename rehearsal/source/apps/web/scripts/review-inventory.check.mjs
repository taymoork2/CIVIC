import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { reviewInventory } from './review-inventory.mjs'
import { fixtureHashes } from './review-fixture-hashes.mjs'

test('fixture fingerprints track component dependencies and shared styles, excluding expectations and Git identity', () => {
  const metadata = { scenarios: [{ id: 'a', component: 'src/a.tsx' }, { id: 'b', component: 'src/b.tsx' }] }
  const project = { root: '/app', aliases: { '@': '/app/src' }, manifest: { id: 'test' } }
  const evidence = new Map([['src/a.tsx', 'import { thing } from "@/shared"; export const A = thing'], ['src/shared.ts', 'export const thing = 1'], ['src/b.tsx', 'export const B = 1'], ['src/app.css', 'body { color: red }']])
  const first = fixtureHashes(metadata, evidence, project)
  evidence.set('src/b.tsx', 'export const B = 2')
  const next = fixtureHashes(metadata, evidence, project, [['connection', 'new-head'], ['coverage.json', 'new-intent']])
  assert.equal(next.a, first.a); assert.notEqual(next.b, first.b)
  evidence.set('src/shared.ts', 'export const thing = 2')
  assert.notEqual(fixtureHashes(metadata, evidence, project).a, next.a)
  evidence.set('src/app.css', 'body { color: blue }')
  assert.notEqual(fixtureHashes(metadata, evidence, project).b, next.b)
  assert.notEqual(fixtureHashes(metadata, evidence, project, [['src/photo.webp', 'changed-image']]).a, fixtureHashes(metadata, evidence, project).a)
})

test('initial scenario graph links present components and check sources; absent design and acceptance stay explicit', async () => {
  const repo = fileURLToPath(new URL('../../../', import.meta.url))
  const { metadata, evidence } = await reviewInventory(repo, '/nonexistent-review-design', repo)
  const scenarios = metadata.scenarios.filter((entry) => entry.renderer !== 'legacy')
  const ids = new Set(metadata.scenarios.map((entry) => entry.id))
  assert.equal(ids.size, metadata.scenarios.length)
  for (const entry of scenarios) {
    assert.equal(entry.implementation, 'present', entry.id)
    assert.equal(entry.designCoverage, 'missing', entry.id)
    assert.equal(entry.device, 'unverified', entry.id)
    assert.equal(entry.native, 'missing', entry.id)
    for (const check of entry.checks) assert.ok(evidence.has(check), check)
    for (const edge of entry.edges ?? []) assert.ok(ids.has(edge.destination), `${entry.id} -> ${edge.destination}`)
  }
  assert.ok(metadata.surfaces.some((entry) => entry.scenarios.length === 0))
  for (const screen of ['sign-in', 'create-account', 'drying-index', 'laundry-day-plan']) assert.ok(metadata.scenarios.some((entry) => entry.screen === screen), screen)
  assert.ok(!metadata.scenarios.some((entry) => entry.screen === 'string'), 'a typeof search.screen check is not a screen')
  assert.match(metadata.revision.source, /^[0-9a-f]{64}$/)
  assert.ok([...evidence.keys()].every((path) => !/\.env|access-key|feedback\.json/.test(path)))
  const actions = metadata.routeActions
  assert.ok(actions.every((action) => action.status !== 'source binding stale' && action.status !== 'origin preview missing'))
  for (const action of actions) assert.ok(evidence.get(action.source)?.includes(action.anchor), `Resolved binding: ${action.action}`)
  const homePlan = actions.find((action) => action.from === 'legacy.home-planned')
  assert.equal(homePlan.route, '/laundry?plan=<planId>')
  const history = metadata.scenarios.find((entry) => entry.id === 'legacy.me-history')
  assert.ok(history.edges.some((edge) => edge.destination === 'legacy.laundry-completed'))
  assert.match(history.routeActions[0].returnTo, /itemReturnTo/)
  const running = actions.find((action) => action.action === "Open garment's running wash")
  assert.equal(running.from, 'route.closet.running')
  assert.equal(running.destination, 'route.laundry.session-closet')
  assert.match(running.when, /inLoad/)
  const queue = actions.find((action) => action.action === 'Move washed pieces to Drying')
  assert.match(queue.when, /queueFromWasher succeeds/)
  assert.equal(queue.from, 'route.laundry.washed')
  assert.equal(queue.destination, 'route.drying.washer-queued')
  assert.ok(actions.every((action) => action.status === 'source-declared; representative preview'))
  assert.ok(metadata.scenarios.find((entry) => entry.id === queue.from).edges.some((edge) => edge.action === queue.action && edge.when === queue.when && edge.returnTo === queue.returnTo))
  for (const id of ['route.closet.add-choose', 'route.laundry.session-closet', 'route.laundry.hamper-item', 'route.drying.washer-queued', 'route.closet.history']) {
    assert.ok(actions.some((action) => action.destination === id), id)
    assert.ok(actions.some((action) => action.from === id && action.returnTo), id)
  }
})
