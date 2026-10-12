import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { loadProject } from './review-project.mjs'
import { runtimeService } from './review-runtime.mjs'

test('real application mutations remain isolated between runs and replay starts from the same seed', async () => {
  const project = loadProject(fileURLToPath(new URL('../../..', import.meta.url)))
  const service = runtimeService(project, () => 'test-source')
  try {
    const a = await service.handle({ action: 'start', scenario: 'app.home', role: 'owner', condition: 'normal', now: 1791745200000 })
    const b = await service.handle({ action: 'start', scenario: 'app.home', role: 'owner', condition: 'normal', now: 1791745200000 })
    const query = (run, name, args = {}) => service.handle({ action: 'query', run, name, args })
    const before = await query(a.id, 'inventory:list', { householdId: a.seed.householdId })
    const chosen = before.textiles.filter((piece) => piece.status === 'clean')[0]
    await service.handle({ action: 'mutation', run: a.id, name: 'closet:markWorn', args: { textileIds: [chosen.textileId] } })
    const changed = await query(a.id, 'inventory:list', { householdId: a.seed.householdId })
    assert.equal(changed.textiles.find((piece) => piece.textileId === chosen.textileId).wearsSinceClean, 1)
    assert.equal((await query(b.id, 'inventory:list', { householdId: b.seed.householdId })).textiles.find((piece) => piece.textileId === chosen.textileId).wearsSinceClean, 0)
    await service.handle({ action: 'reset', run: a.id })
    assert.equal((await query(a.id, 'inventory:list', { householdId: a.seed.householdId })).textiles.find((piece) => piece.textileId === chosen.textileId).wearsSinceClean, 0)
    await assert.rejects(service.handle({ action: 'action', run: a.id, name: 'research:run', args: {} }), /actions are disabled/)
    await assert.rejects(service.handle({ action: 'mutation', run: a.id, name: 'inventory:updateTextile', args: { textileId: 'a-production-id', name: 'Forbidden' } }))
  } finally { await service.close() }
})

test('source drift, unknown identities and malformed effects stop before executing', async () => {
  const project = loadProject(fileURLToPath(new URL('../../..', import.meta.url)))
  let source = 'one'
  const service = runtimeService(project, () => source)
  try {
    await assert.rejects(service.handle({ action: 'start', scenario: 'app.home', role: 'invented', condition: 'normal' }), /declared preset/)
    await assert.rejects(service.handle({ action: 'start', scenario: 'app.home', persona: 'invented', role: 'owner', condition: 'normal' }), /declared persona/)
    const run = await service.handle({ action: 'start', scenario: 'app.drying', role: 'owner', condition: 'normal' })
    await assert.rejects(service.handle({ action: 'query', run: run.id, name: '../private:secret', args: {} }), /function name/)
    source = 'two'
    await assert.rejects(service.handle({ action: 'query', run: run.id, name: 'inventory:list', args: {} }), /Source changed/)
  } finally { await service.close() }
})

test('declared personas seed data separately from the role and condition', async () => {
  const project = loadProject(fileURLToPath(new URL('../../..', import.meta.url)))
  const service = runtimeService(project, () => 'source')
  try {
    const parent = await service.handle({ action: 'start', scenario: 'app.home', persona: 'parent', role: 'owner', condition: 'normal' })
    const inventory = await service.handle({ action: 'query', run: parent.id, name: 'inventory:list', args: { householdId: parent.seed.householdId } })
    assert.ok(inventory.wearers.some((wearer) => wearer.name === 'Riley' && wearer.kind === 'child'))
    const student = await service.handle({ action: 'start', scenario: 'app.home', persona: 'student', role: 'member', condition: 'normal' })
    const onboarding = await service.handle({ action: 'query', run: student.id, name: 'households:onboardingStatus', args: {} })
    assert.equal(onboarding.households[0].washPlace, 'shared')
    assert.equal(onboarding.households[0].role, 'member')
  } finally { await service.close() }
})
