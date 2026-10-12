import { expect, test } from 'vitest'
import { isDryerPhase } from '@washcloset/planner'
import { api } from './_generated/api'
import { intakeHousehold, newBackend, planFor, signedIn, startLoad } from './harness.testing'

test.each([100, 500, 1_000])('a five-person %i-piece household completes every planned load and returns every piece to ready exactly once', async size => {
  const t = newBackend()
  const as = signedIn(t, `family-${size}`)
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.trashTextiles, { textileIds: [home.shirt, home.towel, home.sweater] })
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, capacityUnits: 20 })
  const people = await Promise.all(['Alex', 'Blair', 'Casey', 'Devon', 'Ellis'].map(name => as.mutation(api.inventory.createWearer, { householdId: home.householdId, name, kind: 'adult' })))
  for (let i = 0; i < size / 20; i++) await as.mutation(api.inventory.createTextiles, {
    householdId: home.householdId, name: `Batch ${i}`, quantity: 20, wearerId: people[i % 5]!,
    kind: 't_shirt', color: 'White', colorGroup: 'light', material: 'cotton', firstWash: false, status: 'dirty',
    tag: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, dryMethod: 'line_dry', bleach: 'none' },
  })
  const inventory = await as.query(api.inventory.list, { householdId: home.householdId })
  expect(inventory.textiles).toHaveLength(size)
  const ids = inventory.textiles.map(row => row.textileId)
  const plan = await planFor(as, home.householdId, ids)
  expect(new Set(plan.result.loads.flatMap(load => load.textileIds))).toEqual(new Set(ids))
  const completedIds = new Set<string>()
  for (const load of plan.result.loads) {
    const { sessionId } = await startLoad(as, { planId: plan.planId, loadId: load.id, machineId: home.machine, idempotencyKey: `family-wash-${size}-${load.id}` })
    for (let i = 0; i < 40; i++) {
      const detail = await as.query(api.execution.sessionDetail, { sessionId })
      const step = detail.actions.find(action => action.status === 'pending' && !isDryerPhase(action.phase))
      if (!step) break
      if (step.kind === 'task') await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed' })
      else await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed', usage: { supplyId: home.detergent, amount: step.dose.amount, unit: step.dose.unit, placement: step.placement } })
    }
    await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
    const queue = await as.query(api.dryingQueue.queue, { householdId: home.householdId })
    expect(queue.pieces).toHaveLength(load.textileIds.length)
    const pieceIds = queue.pieces.map(piece => piece.pieceId)
    const runId = await as.mutation(api.dryingQueue.startAirDry, { householdId: home.householdId, pieceIds, method: 'rack_line' })
    await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: pieceIds })
    await as.mutation(api.dryingQueue.putAway, { householdId: home.householdId, pieceIds })
    for (const id of load.textileIds) {
      expect(completedIds.has(id)).toBe(false)
      completedIds.add(id)
    }
    expect((await as.query(api.dryingQueue.queue, { householdId: home.householdId })).pieces).toHaveLength(0)
    const after = await as.query(api.inventory.list, { householdId: home.householdId })
    expect(after.textiles).toHaveLength(size)
    expect(after.textiles.filter(piece => piece.status === 'clean')).toHaveLength(completedIds.size)
    expect(after.textiles.filter(piece => piece.status === 'dirty')).toHaveLength(size - completedIds.size)
    expect(after.textiles.filter(piece => piece.washCount === 1)).toHaveLength(completedIds.size)
    expect(after.textiles.every(piece => piece.inLoad === null)).toBe(true)
  }
  expect(completedIds).toEqual(new Set(ids))
  expect((await as.query(api.closet.today, { householdId: home.householdId })).readyCount).toBe(size)
  const records = await t.run(ctx => ctx.db.query('washRecords').collect())
  expect(records).toHaveLength(size)
  expect(new Set(records.map(record => record.textileId))).toEqual(new Set(ids))
}, 900_000) // All three sizes take about 7 minutes on a 4-core Linux container, well past the original 3.
