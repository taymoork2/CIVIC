import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { loadProject } from '@civic/vite-connector/project'
import { runtimeService } from './review-runtime.mjs'
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('real application mutations remain isolated between runs and replay starts from the same seed', async () => {
  const project = loadProject(fileURLToPath(new URL('../../..', import.meta.url)))
  const service = runtimeService(project, () => 'test-source')
  try {
    const a = await service.handle({ action: 'start', scenario: 'app.home', role: 'owner', condition: 'normal', now: 1791745200000 })
    assert.doesNotMatch(JSON.stringify(a.seed), /review-session-|sessionId|tokenIdentifier/)
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

test('family seed keeps 1000 original pieces across same-run identities and enforces private visibility', async () => {
  const project = loadProject(fileURLToPath(new URL('../../..', import.meta.url)))
  const service = runtimeService(project, () => 'family-source')
  try {
    const run = await service.handle({ action: 'start', scenario: 'family.planning', persona: 'parent', role: 'owner', condition: 'normal', options: { pieces: 1000 }, now: 1791745200000 })
    let actor = run.seed.subject
    const query = () => service.handle({ action: 'query', run: run.id, actor, name: 'inventory:list', args: { householdId: run.seed.householdId } })
    const original = await query()
    assert.equal(original.textiles.length, 1000)
    assert.equal(original.wearers.length, 5)
    assert.equal(new Set(original.textiles.map(row => row.textileId)).size, 1000)
    assert.equal(original.textiles.filter(row => row.status === 'dirty').length, 1000)
    const privateId = original.textiles[0].textileId
    await service.handle({ action: 'mutation', run: run.id, actor, name: 'inventory:setPrivacy', args: { textileIds: [privateId], private: true } })
    actor = (await service.handle({ action: 'identity', run: run.id, args: { account: 'member' } })).subject
    await assert.rejects(service.handle({ action: 'query', run: run.id, actor: run.seed.subject, name: 'inventory:list', args: { householdId: run.seed.householdId } }), /account changed/)
    assert.equal((await query()).textiles.length, 999)
    assert.ok(!(await service.handle({ action: 'state', run: run.id, actor })).textiles.some(row => row._id === privateId))
    await assert.rejects(service.handle({ action: 'mutation', run: run.id, actor, name: 'inventory:updateTextile', args: { textileId: privateId, name: 'Forbidden' } }))
    actor = (await service.handle({ action: 'identity', run: run.id, args: { account: 'other' } })).subject
    await assert.rejects(query())
    actor = (await service.handle({ action: 'identity', run: run.id, args: { account: 'owner' } })).subject
    await assert.rejects(service.handle({ action: 'query', run: run.id, name: 'inventory:list', args: { householdId: run.seed.householdId } }), /account/)
    assert.deepEqual((await query()).textiles.map(row => row.textileId), original.textiles.map(row => row.textileId))
    await assert.rejects(service.handle({ action: 'identity', run: run.id, args: { account: 'invented' } }), /account/)
  } finally { await service.close() }
})

test('a durable synthetic run resumes the same effects and reset preserves unrelated review files', async () => {
  const project = loadProject(fileURLToPath(new URL('../../..', import.meta.url)))
  const directory = await mkdtemp(join(tmpdir(), 'civic-durable-'))
  await writeFile(join(directory, 'feedback.json'), 'saved-feedback')
  await writeFile(join(directory, 'proposals.json'), 'saved-proposal')
  let service = runtimeService(project, () => 'durable-source', { dataDir: directory })
  try {
    const run = await service.handle({ action: 'start', scenario: 'app.home', role: 'owner', condition: 'normal', now: 1791745200000 })
    const query = () => service.handle({ action: 'query', run: run.id, name: 'inventory:list', args: { householdId: run.seed.householdId } })
    const original = await query(), textileId = original.textiles[0].textileId
    await service.handle({ action: 'mutation', run: run.id, name: 'closet:markWorn', args: { textileIds: [textileId] } })
    await service.close()
    service = runtimeService(project, () => 'durable-source', { dataDir: directory })
    const [resumed] = await Promise.all([
      service.handle({ action: 'resume', run: run.id }),
      service.handle({ action: 'resume', run: run.id }).then(async receipt => {
        assert.equal((await query()).textiles.find(row => row.textileId === textileId).wearsSinceClean, 1)
        return receipt
      }),
    ])
    assert.equal(resumed.id, run.id)
    assert.deepEqual(resumed.seed, run.seed)
    assert.equal((await query()).textiles.find(row => row.textileId === textileId).wearsSinceClean, 1)
    await service.handle({ action: 'reset', run: run.id })
    assert.equal((await query()).textiles.find(row => row.textileId === textileId).wearsSinceClean, 0)
    assert.equal(await readFile(join(directory, 'feedback.json'), 'utf8'), 'saved-feedback')
    assert.equal(await readFile(join(directory, 'proposals.json'), 'utf8'), 'saved-proposal')
    const second = await service.handle({ action: 'start', scenario: 'app.home', role: 'owner', condition: 'normal' })
    assert.notEqual(second.id, run.id)
    const journal = await readFile(join(directory, 'runtime', `${run.id}.json`), 'utf8')
    assert.doesNotMatch(journal, /review-session-|sessionId|tokenIdentifier/)
  } finally { await service.close() }
})

test('the full 1000-piece day uses public planner, preparation, wash and partial drying functions without replacing IDs', async () => {
  const project = loadProject(fileURLToPath(new URL('../../..', import.meta.url)))
  const service = runtimeService(project, () => 'full-day-source')
  try {
    const run = await service.handle({ action: 'start', scenario: 'family.planning', persona: 'parent', role: 'owner', condition: 'normal', options: { pieces: 1000 }, now: 1791745200000 })
    const call = (action, name, args) => service.handle({ action, run: run.id, actor: run.seed.subject, name, args })
    const inventory = await call('query', 'inventory:list', { householdId: run.seed.householdId })
    const ids = inventory.textiles.map(row => row.textileId)
    const washer = inventory.machines.find(row => row.applianceType === 'top_load_washer').machineId
    for (let batch = 0; batch < 50; batch++) {
      const selected = ids.slice(batch * 20, batch * 20 + 20)
      const { planId } = await call('mutation', 'plans:recompute', { householdId: run.seed.householdId, selectedTextileIds: selected, clientInputHash: `day-${batch}` })
      const plan = await call('query', 'plans:get', { planId })
      assert.equal(plan.result.loads.length, 1, JSON.stringify({ questions: plan.result.questions, omitted: plan.result.omitted, warnings: plan.result.warnings, result: plan.result }).slice(0, 4500))
      const load = plan.result.loads[0]
      await call('mutation', 'plans:confirmRecipe', { planId, loadId: load.id, machineId: washer })
      const { sessionId } = await call('mutation', 'execution:start', { planId, loadId: load.id, machineId: washer, idempotencyKey: `wash-${batch}` })
      for (let steps = 0; steps < 30; steps++) {
        const detail = await call('query', 'execution:sessionDetail', { sessionId })
        if (detail.machineStartedAt !== null && detail.machineStartedAt !== undefined && detail.washFinishedAt === null) {
          await service.handle({ action: 'time', run: run.id, args: { minutes: 40 } })
          await call('mutation', 'execution:washFinished', { sessionId })
        }
        const action = detail.actions.find(row => row.status === 'pending' && !String(row.phase).includes('dry'))
        if (!action) break
        if (action.task === 'drum_fullness') await call('mutation', 'execution:recordDrumFullness', { sessionId, machine: 'washer', size: 'large' })
        else await call('mutation', 'actions:recordAction', { sessionId, actionId: action.id, status: 'confirmed', ...(action.task === 'start' ? { minutes: 40 } : {}), ...(action.kind !== 'task' && action.dose.amount > 0 ? { usage: { supplyId: action.supplyId, amount: action.dose.amount, unit: action.dose.unit, placement: action.placement } } : {}) })
      }
      await service.handle({ action: 'time', run: run.id, args: { minutes: 40 } })
      await call('mutation', 'execution:washFinished', { sessionId })
      await call('mutation', 'dryingQueue:queueFromWasher', { sessionId })
      const queue = await call('query', 'dryingQueue:queue', { householdId: run.seed.householdId })
      const pieces = queue.pieces.filter(row => row.washSessionId === sessionId || selected.includes(row.textileId))
      assert.equal(pieces.length, 20)
      const pieceIds = pieces.map(row => row.pieceId)
      const runId = await call('mutation', 'dryingQueue:startAirDry', { householdId: run.seed.householdId, pieceIds, method: 'rack_line' })
      if (batch === 0) {
        assert.deepEqual(await call('mutation', 'dryingQueue:checkDry', { runId, dryPieceIds: pieceIds.slice(0, 19) }), { dry: 19, damp: 1, hung: 0 })
        await call('mutation', 'dryingQueue:putAway', { householdId: run.seed.householdId, pieceIds: pieceIds.slice(0, 19) })
        assert.deepEqual(await call('mutation', 'dryingQueue:checkDry', { runId, dryPieceIds: pieceIds.slice(19) }), { dry: 1, damp: 0, hung: 0 })
        await call('mutation', 'dryingQueue:putAway', { householdId: run.seed.householdId, pieceIds: pieceIds.slice(19) })
      } else {
        await call('mutation', 'dryingQueue:checkDry', { runId, dryPieceIds: pieceIds })
        await call('mutation', 'dryingQueue:putAway', { householdId: run.seed.householdId, pieceIds })
      }
    }
    const final = await call('query', 'inventory:list', { householdId: run.seed.householdId })
    assert.deepEqual(final.textiles.map(row => row.textileId), ids)
    assert.equal(final.textiles.filter(row => row.status === 'clean' && row.washCount === 1).length, 1000)
  } finally { await service.close() }
})
