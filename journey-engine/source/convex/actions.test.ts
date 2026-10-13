import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { startLoad, capMeasure, intakeHousehold, label, newBackend, planFor, signedIn, type Backend, type Caller } from './harness.testing'
import { principalFromAuth } from './principal'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const timeline = (t: Backend, sessionId: Id<'sessions'>) =>
  t.run(async (ctx) => (await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique())!.actions)

/** A top-loader household with two extra products: a booster in its own slot, and one added by hand at the rinse. */
async function running(t: Backend, as: Caller) {
  const home = await intakeHousehold(as)
  const booster = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Booster', kind: 'chemical', formulation: { name: 'oxygen booster', form: 'powder' }, safety: { bleachKind: 'oxygen', incompatibleSupplyIds: [], incompatibleMaterials: [] }, provenance: label('booster tub') })
  // Its own slot: two products loose in the drum would share a placement, which the planner asks about first.
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, placements: ['detergent_compartment', 'bleach_compartment', 'direct_to_drum'] })
  await as.mutation(api.inventory.saveRule, { supplyId: booster, dose: { amount: 20, unit: 'g' }, stage: 'wash', placement: 'bleach_compartment', timing: 'before cycle start', provenance: label('booster tub') })
  const rinse = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Rinse aid', kind: 'chemical', formulation: { name: 'rinse aid', form: 'liquid' }, safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, provenance: label('bottle') })
  await as.mutation(api.inventory.saveRule, { supplyId: rinse, dose: { amount: 60, unit: 'ml' }, stage: 'rinse', placement: 'direct_to_drum', timing: 'Add 10 minutes after starting the cycle.', provenance: label('bottle') })
  const planned = await planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [booster, rinse] })
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'once' })
  return { home, booster, rinse, sessionId }
}

test('records actual use, skipped, and missed steps without hiding them from the timeline', async () => {
  const t = newBackend()
  const as = signedIn(t, 'action-test-user')
  const { home, booster, sessionId } = await running(t, as)
  const actions = await timeline(t, sessionId)
  const tide = actions.find((action) => action.kind === 'treatment' && action.supplyId === home.detergent)!
  const boost = actions.find((action) => action.kind === 'treatment' && action.supplyId === booster)!
  const rinse = actions.find((action) => action.kind === 'treatment' && action.phase === 'cycle')!

  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: tide.id, status: 'confirmed', usage: { supplyId: home.detergent, amount: 30, unit: 'ml', placement: 'detergent_compartment' } })).resolves.toMatchObject({ status: 'confirmed' })
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: boost.id, status: 'skipped' })).resolves.toMatchObject({ status: 'skipped' })
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: rinse.id, status: 'missed' })).resolves.toMatchObject({ status: 'missed' })
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: tide.id, status: 'skipped' })).rejects.toThrow('already recorded')
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: boost.id, status: 'confirmed' })).rejects.toThrow()
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: 'no-such-step', status: 'skipped' })).rejects.toThrow('Action not found')

  const actor = await as.run((ctx) => principalFromAuth(ctx))
  const { usage, history } = await t.run(async (ctx) => ({ usage: await ctx.db.query('usage').collect(), history: await ctx.db.query('history').collect() }))
  expect(usage).toEqual([expect.objectContaining({ actionId: tide.id, amount: 30, confirmedBy: actor.key })])
  expect(history.map((event) => [event.actionId, event.event])).toEqual([[tide.id, 'action_confirmed'], [boost.id, 'action_skipped'], [rinse.id, 'action_missed']])
  expect(history.every((event) => event.actorPrincipalKey === actor.key && event.textileId === home.shirt)).toBe(true)
  const statuses = new Map((await timeline(t, sessionId)).map((action) => [action.id, action.status]))
  expect([statuses.get(tide.id), statuses.get(boost.id), statuses.get(rinse.id)]).toEqual(['confirmed', 'skipped', 'missed'])
})

test('a recovered device receipt acknowledges exactly once and rejects changed payloads or stale steps', async () => {
  const t = newBackend()
  const as = signedIn(t, 'receipt-user')
  const { home, sessionId } = await running(t, as)
  const tide = (await timeline(t, sessionId)).find((action) => action.kind === 'treatment' && action.supplyId === home.detergent)!
  const revision = await t.run(async (ctx) => (await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique())!.revision)
  const tap = { sessionId, actionId: tide.id, status: 'confirmed' as const, at: Date.now(), receiptId: 'device-step-receipt-123', expectedTimelineRevision: revision,
    usage: { supplyId: home.detergent, amount: 30, unit: 'ml', placement: 'detergent_compartment' } }
  await as.mutation(api.actions.recordAction, tap)
  await expect(as.mutation(api.actions.recordAction, tap)).resolves.toMatchObject({ status: 'confirmed' })
  expect(await t.run((ctx) => ctx.db.query('usage').collect())).toHaveLength(1)
  expect(await t.run((ctx) => ctx.db.query('history').collect())).toHaveLength(1)
  await expect(as.mutation(api.actions.recordAction, { ...tap, usage: { ...tap.usage, amount: 60 } })).rejects.toThrow('different recorded details')
  await expect(signedIn(t, 'outsider').mutation(api.actions.recordAction, tap)).rejects.toThrow('Forbidden')
  const next = (await timeline(t, sessionId)).find((action) => action.status === 'pending')!
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: next.id, status: next.kind === 'task' ? 'confirmed' : 'skipped', expectedTimelineRevision: revision, receiptId: 'device-step-receipt-456' })).rejects.toThrow('load steps changed')
  await t.run((ctx) => ctx.db.patch(sessionId, { status: 'completed' }))
  await expect(as.mutation(api.actions.recordAction, tap)).resolves.toMatchObject({ status: 'confirmed' })
})

test('recording a timed step settles its reminder: completed when done, cancelled when skipped', async () => {
  const t = newBackend()
  const as = signedIn(t, 'action-test-user')
  const { sessionId } = await running(t, as)
  for (const step of (await timeline(t, sessionId)).filter((entry) => entry.phase !== 'cycle')) {
    await as.mutation(api.actions.recordAction, step.kind === 'task'
      ? { sessionId, actionId: step.id, status: 'confirmed' }
      : { sessionId, actionId: step.id, status: 'confirmed', usage: { supplyId: step.supplyId as Id<'supplies'>, amount: step.dose.amount, unit: step.dose.unit, placement: step.placement } })
  }
  const reminders = () => t.run((ctx) => ctx.db.query('reminders').collect())
  expect((await reminders()).map((reminder) => reminder.status)).toEqual(['scheduled'])
  const rinse = (await timeline(t, sessionId)).find((action) => action.phase === 'cycle')!
  await as.mutation(api.actions.recordAction, { sessionId, actionId: rinse.id, status: 'skipped' })
  expect((await reminders()).map((reminder) => reminder.status)).toEqual(['cancelled'])
})

test('an outsider cannot record a step in someone else\'s load', async () => {
  const t = newBackend()
  const { sessionId } = await running(t, signedIn(t, 'action-test-user'))
  const step = (await timeline(t, sessionId))[0]!
  await expect(signedIn(t, 'outsider').mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'skipped' })).rejects.toThrow('Forbidden')
})

test('once a locked door shuts, a washer step still cannot be confirmed, even after the timeline is rebuilt for another washer', async () => {
  const t = newBackend()
  const as = signedIn(t, 'action-test-user')
  const { home, rinse, sessionId } = await running(t, as)
  for (const step of (await timeline(t, sessionId)).filter((entry) => entry.phase !== 'cycle')) {
    await as.mutation(api.actions.recordAction, step.kind === 'task'
      ? { sessionId, actionId: step.id, status: 'confirmed' }
      : { sessionId, actionId: step.id, status: 'confirmed', usage: { supplyId: step.supplyId as Id<'supplies'>, amount: step.dose.amount, unit: step.dose.unit, placement: step.placement } })
  }
  // Moved to a front-loader: the rinse product can no longer wait for the rinse, and the door is shut.
  const front = await as.mutation(api.inventory.createMachine, { householdId: home.householdId, name: 'Front-loader', applianceType: 'front_load_washer', capacityUnits: 8, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['detergent_compartment', 'direct_to_drum'], provenance: label('plate') })
  await as.mutation(api.execution.reschedule, { sessionId, startedAt: Date.now(), machineId: front })
  const moved = (await timeline(t, sessionId)).find((action) => action.kind === 'treatment' && action.supplyId === rinse)!
  expect(moved).toMatchObject({ phase: 'with_load', status: 'pending' })
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: moved.id, status: 'confirmed', usage: { supplyId: rinse, amount: 60, unit: 'ml', placement: 'direct_to_drum' } })).rejects.toThrow('door is locked')
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: moved.id, status: 'missed' })).resolves.toMatchObject({ status: 'missed' })
})

test('a load started under the older planner records its steps and completes as before', async () => {
  const t = newBackend()
  const as = signedIn(t, 'action-test-user')
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt])
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'legacy' })
  // The plan as the older planner stored it: no load size, soil, washer class or drying.
  await t.run(async (ctx) => {
    const stored = (await ctx.db.get(planned.planId))!
    const result = stored.result as { loads: Record<string, unknown>[] }
    const loads = result.loads.map(({ drying: _drying, loadSize: _size, soilLevel: _soil, washerClass: _class, ...load }) => load)
    await ctx.db.patch(planned.planId, { plannerVersion: 'planner-v1', result: { ...result, loads } })
  })
  for (const step of await timeline(t, sessionId)) {
    await as.mutation(api.actions.recordAction, step.kind === 'task'
      ? { sessionId, actionId: step.id, status: 'confirmed' }
      : { sessionId, actionId: step.id, status: 'confirmed', usage: { supplyId: step.supplyId as Id<'supplies'>, amount: step.dose.amount, unit: step.dose.unit, placement: step.placement } })
  }
  expect((await timeline(t, sessionId)).map((action) => action.phase)).toEqual(['load', 'close', 'dispenser', 'start'])
  await expect(as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'legacy' })).resolves.toMatchObject({ status: 'completed' })
})

test('a recorded mark goes with a cap or scoop only', async () => {
  const t = newBackend()
  const as = signedIn(t, 'action-test-user')
  const { home, sessionId } = await running(t, as)
  const tide = (await timeline(t, sessionId)).find((action) => action.kind === 'treatment' && action.supplyId === home.detergent)!
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: tide.id, status: 'confirmed', usage: { supplyId: home.detergent, amount: 30, unit: 'ml', mark: 'Line 2', placement: 'detergent_compartment' } })).rejects.toThrow('cap or scoop')
})

test('a dose that goes by how full the drum is cannot be confirmed until the person says, but it can be left out', async () => {
  const t = newBackend()
  const as = signedIn(t, 'action-test-user')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, archived: true })
  const tide = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Tide', kind: 'chemical', use: 'detergent', formulation: { name: 'liquid', form: 'liquid' }, measure: capMeasure, safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, provenance: label('Tide bottle') })
  await as.mutation(api.inventory.saveLabelDirections, {
    supplyId: tide, measure: capMeasure, stage: 'wash', placement: 'detergent_compartment', timing: 'before starting',
    rows: [{ loadSizes: ['small', 'medium'], cells: [{ amount: 1, unit: 'cap', mark: '1' }] }, { loadSizes: ['large', 'extra_large'], cells: [{ amount: 1, unit: 'cap', mark: '3' }] }],
    provenance: label('Tide bottle'),
  })
  const planned = await planFor(as, home.householdId, [home.shirt])
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'sized' })
  const steps = await timeline(t, sessionId)
  const step = steps.find((action) => action.kind === 'treatment')!
  const task = (name: string) => steps.find((action) => action.kind === 'task' && action.task === name)!.id
  const confirm = { sessionId, actionId: step.id, status: 'confirmed' as const, usage: { supplyId: tide, amount: 1, unit: 'cap', mark: '1', placement: 'detergent_compartment' } }

  await expect(as.mutation(api.actions.recordAction, confirm)).rejects.toThrow('Pick how full the drum is first')
  await as.mutation(api.actions.recordAction, { sessionId, actionId: task('load'), status: 'confirmed' })
  // The picture is the only way past this step: it cannot be ticked off or skipped without a size.
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: task('drum_fullness'), status: 'confirmed' })).rejects.toThrow('Pick how full the drum is first')
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: task('drum_fullness'), status: 'skipped' })).rejects.toThrow('only be marked done')
  await as.mutation(api.actions.recordAction, { sessionId, actionId: task('close'), status: 'confirmed' })
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: task('start'), status: 'confirmed' })).rejects.toThrow('Record every step')
  // "The label doesn't say" or "Leave it out this time" at the machine: the step is skipped.
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'skipped' })).resolves.toMatchObject({ status: 'skipped' })
  await as.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'medium' })
  // A step already left out is not dosed again.
  expect((await timeline(t, sessionId)).find((action) => action.id === step.id)).toMatchObject({ status: 'skipped', dose: { amount: 0, unit: 'at_machine' } })
  await as.mutation(api.actions.recordAction, { sessionId, actionId: task('start'), status: 'confirmed' })
  expect(await t.run((ctx) => ctx.db.query('usage').collect())).toEqual([])
})

test('a step queued offline keeps the phone\'s own time, held within 12 hours of the server\'s', async () => {
  const t = newBackend()
  const as = signedIn(t, 'action-test-user')
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt])
  const loadId = planned.result.loads[0]!.id
  const now = Date.now()
  // The load was started on the phone 20 minutes before the tap reached the server.
  const { sessionId, startedAt } = await startLoad(as, { planId: planned.planId, loadId, idempotencyKey: 'queued', at: now - 20 * 60_000 })
  expect(startedAt).toBe(now - 20 * 60_000)
  const steps = await timeline(t, sessionId)
  const [first, ...rest] = steps
  // A phone clock two days behind is held to 12 hours before the server's time.
  await as.mutation(api.actions.recordAction, { sessionId, actionId: first!.id, status: 'confirmed', ...(first!.kind === 'task' ? {} : { usage: { supplyId: first!.supplyId as Id<'supplies'>, amount: first!.dose.amount, unit: first!.dose.unit, placement: first!.placement } }), at: now - 2 * 86_400_000 })
  expect((await timeline(t, sessionId))[0]!.recordedAt).toBe(now - 12 * 3_600_000)
  for (const step of rest) {
    await as.mutation(api.actions.recordAction, step.kind === 'task'
      ? { sessionId, actionId: step.id, status: 'confirmed', at: now - 5 * 60_000 }
      : { sessionId, actionId: step.id, status: 'confirmed', usage: { supplyId: step.supplyId as Id<'supplies'>, amount: step.dose.amount, unit: step.dose.unit, placement: step.placement }, at: now - 5 * 60_000 })
  }
  // Start was pressed five minutes ago by the phone: the clock for the finish runs from then.
  const detail = await as.query(api.execution.sessionDetail, { sessionId })
  expect(detail.machineStartedAt).toBe(now - 5 * 60_000)
  const recorded = await timeline(t, sessionId)
  expect(recorded.find((step) => step.kind === 'task' && step.task === 'start')!.recordedAt).toBe(now - 5 * 60_000)
})

test('a phone clock far ahead is held to 12 hours after the server\'s, and a non-finite time is refused', async () => {
  const t = newBackend()
  const as = signedIn(t, 'action-test-user')
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt])
  const loadId = planned.result.loads[0]!.id
  const now = Date.now()
  await expect(startLoad(as, { planId: planned.planId, loadId, idempotencyKey: 'nan', at: Number.NaN })).rejects.toThrow('finite')
  const { sessionId, startedAt } = await startLoad(as, { planId: planned.planId, loadId, idempotencyKey: 'ahead', at: now + 3 * 86_400_000 })
  expect(startedAt).toBe(now + 12 * 3_600_000)
  const step = (await timeline(t, sessionId)).find((entry) => entry.kind === 'task')!
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed', at: Number.POSITIVE_INFINITY })).rejects.toThrow('finite')
  // Without a time, the server's own clock, as before.
  await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed' })
  expect((await timeline(t, sessionId)).find((entry) => entry.id === step.id)!.recordedAt).toBe(now)
})
