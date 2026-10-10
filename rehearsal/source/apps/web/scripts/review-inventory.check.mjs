import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { reviewInventory } from './review-inventory.mjs'

test('initial scenario graph links present components and check sources; absent design and acceptance stay explicit', async () => {
  const repo = fileURLToPath(new URL('../../../', import.meta.url))
  const { metadata, evidence } = await reviewInventory(repo, '/nonexistent-review-design')
  const scenarios = metadata.scenarios.filter((entry) => entry.renderer !== 'legacy')
  const ids = new Set(scenarios.map((entry) => entry.id))
  assert.equal(ids.size, scenarios.length)
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
})
