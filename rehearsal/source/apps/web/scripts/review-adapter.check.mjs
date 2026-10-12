import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { reviewMiddleware } from '@civic/shell/server'
import { pathId } from '../src/review/journey-graph.mjs'
import scenarios from '../src/review/scenarios.json' with { type: 'json' }
import { laundryReviewAdapter } from './review-adapter.mjs'

test('the Laundry adapter declares unique towel screens over registered scenarios', () => {
  const { screens, proposalProperties } = laundryReviewAdapter
  assert.equal(new Set(screens.map((screen) => screen.id)).size, screens.length)
  for (const screen of screens) assert.ok(scenarios.some((scenario) => scenario.id === screen.scenario), screen.id)
  assert.deepEqual(proposalProperties, ['title', 'action', 'color'])
})

const snapshot = { revision: { head: '0'.repeat(40), source: '1'.repeat(64), capturedAt: new Date().toISOString() }, design: { project: 'synthetic-test-design', hashes: {} } }
async function localHeaders(base) {
  const entry = await fetch(`${base}/review`)
  assert.equal(entry.status, 200)
  return { cookie: entry.headers.get('set-cookie').split(';')[0], 'content-type': 'application/json' }
}

// The shell validates review targets against the adapter's journey graph; this runs it on Laundry's.
test('journey, path and region reviews validate identities and retain agent context and historical fixtures', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'rehearsal-target-test-'))
  const metadata = { ...snapshot, scenarios: [
    { id: 'intake.towel.origin', component: 'apps/web/src/closet/add-clothes.tsx', checks: ['branch.spec.ts'] },
    { id: 'intake.towel.care', component: 'apps/web/src/closet/add-clothes.tsx' },
    { id: 'legacy.home-index', screen: 'home-index', renderer: 'legacy' },
    { id: 'family.drying', renderer: 'family', journey: 'Family simulation' },
    { id: 'route.closet.test', renderer: 'route-state', screen: 'closet-one', journey: 'Closet', component: 'closet.tsx', edges: [{ action: 'Finish', destination: 'legacy.home-index', when: 'Session completed', returnTo: '/closet' }] },
  ], connection: { rehearsalRoot: '/local/rehearsal', applicationRoot: '/local/application', mode: 'read-only-linked-checkout' } }
  const middleware = await reviewMiddleware({ dataDir, metadata, adapter: { ...laundryReviewAdapter, captureFixture: async () => Buffer.from('frozen-fixture') }, capture: async () => Buffer.from('map-or-live-image') })
  const server = createServer((req, res) => middleware(req, res, () => res.end('Local review')))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`, headers = await localHeaders(base)
  let sequence = 0
  const note = (target, evidence = { kind: 'map' }) => ({ requestId: `${String(++sequence).padStart(8, '0')}-1234-4234-8234-123456789abc`, kind: 'idea', message: 'Clarify this target and keep the return path.', target, evidence, snapshot, html: '<html><body>Frozen map</body></html>', context: { scenario: target.screen === 'route.closet.test' ? 'route.closet.test' : 'intake.towel.origin', ...(target.screen ? { screen: target.screen } : {}), persona: 'single', role: 'owner', condition: 'normal', theme: 'light', textScale: 1, viewport: { width: 393, height: 852 }, state: { dialogs: [], tabs: [], fields: [] } }, anchor: { label: 'Target region', x: .1, y: .2, width: .3, height: .4 } })
  const post = (input) => fetch(`${base}/api/review/feedback`, { method: 'POST', headers, body: JSON.stringify(input) })
  try {
    const flow = await post(note({ kind: 'flow', id: 'towel', flow: 'towel' }))
    assert.equal(flow.status, 201); assert.equal((await flow.json()).target.screens.length, 13)
    assert.equal((await post(note({ kind: 'flow', id: 'invented', flow: 'invented' }))).status, 400)
    assert.equal((await post(note({ kind: 'app', id: 'app' }))).status, 201)
    const family = note({ kind: 'screen', id: 'family.drying', screen: 'family.drying', flow: 'flow:Family simulation' }, { kind: 'live' })
    family.context.scenario = 'family.drying'
    family.context.simulation = { pieces: 500, stage: 'drying' }
    const familyRow = await (await post(family)).json()
    assert.deepEqual(familyRow.context.simulation, family.context.simulation)
    assert.match(familyRow.reproduction, /familySize=500&familyStage=drying/)
    assert.equal((await post({ ...family, requestId: 'eeeeeeee-1234-4234-8234-123456789abc', context: { ...family.context, simulation: { pieces: 5001, stage: 'drying' } } })).status, 400)
    assert.equal((await post({ ...family, requestId: 'ffffffff-1234-4234-8234-123456789abc', context: { ...family.context, simulation: { pieces: 500, stage: 'invented' } } })).status, 400)
    const target = { kind: 'path', id: pathId('origin', 'care:wash', 'Pre-owned · skip dye'), flow: 'towel', screen: 'origin', from: 'origin', to: 'care:wash', action: 'Pre-owned · skip dye', when: 'Forged condition' }
    const saved = await (await post(note(target))).json()
    assert.equal(saved.target.when, 'Item is pre-owned')
    assert.equal(saved.target.to, 'care:wash')
    assert.equal(saved.sourceContext[0].component, 'apps/web/src/closet/add-clothes.tsx')
    assert.equal((await post(note({ ...target, action: 'Invented transition' }))).status, 400)
    const cross = { kind: 'path', id: pathId('route.closet.test', 'legacy.home-index', 'Finish'), flow: 'area:Closet', screen: 'route.closet.test', from: 'route.closet.test', to: 'legacy.home-index', action: 'Finish' }
    const crossRow = await (await post(note(cross))).json()
    assert.equal(crossRow.target.returnTo, '/closet'); assert.equal(crossRow.target.when, 'Session completed')
    const brief = await fetch(`${base}/api/review/feedback/${crossRow.id}/handoff`, { headers })
    assert.equal(brief.status, 200); assert.match(brief.headers.get('content-disposition'), /attachment/)
    const packet = await brief.text()
    assert.match(packet, /Clarify this target/); assert.match(packet, /Session completed/); assert.match(packet, /\/local\/application/); assert.match(packet, /before resolving/)
    await fetch(`${base}/api/review/fixture.png?screen=origin`, { headers })
    const region = note({ kind: 'region', id: 'origin', flow: 'towel', screen: 'origin', selector: '#origin > button' }, { kind: 'fixture', fixtureSource: snapshot.revision.source })
    delete region.html
    metadata.fixtureSource = '2'.repeat(64)
    const regionRow = await (await post(region)).json()
    assert.equal(regionRow.target.selector, '#origin > button'); assert.equal(regionRow.sourceStale, true)
    assert.equal(await (await fetch(`${base}${regionRow.screenshot}`, { headers })).text(), 'frozen-fixture')
    assert.equal((await post({ ...region, requestId: 'bbbbbbbb-1234-4234-8234-123456789abc', evidence: { kind: 'fixture', fixtureSource: '../escape' } })).status, 400)
    assert.equal((await post({ ...region, requestId: 'cccccccc-1234-4234-8234-123456789abc', evidence: { kind: 'fixture', fixtureSource: '3'.repeat(64) } })).status, 400)
    assert.equal((await post({ ...region, requestId: 'dddddddd-1234-4234-8234-123456789abc', anchor: { ...region.anchor, width: 1 } })).status, 400)
    assert.equal((await post(region)).status, 200, 'retry does not duplicate the saved region')
  } finally { await new Promise((resolve) => server.close(resolve)) }
})
