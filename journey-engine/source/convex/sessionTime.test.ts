import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { FunctionArgs } from 'convex/server'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { startLoad as confirmAndStart, capDetergent, label, newBackend, planFor, signedIn, type Caller } from './harness.testing'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000) })
afterEach(() => { vi.useRealTimers() })

const minute = 60_000

/** A home with two front-loaders (40-minute normal cycle on record), a cap detergent and one load not yet started on the first. */
async function home(as: Caller) {
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Home', displayName: 'Pat' })
  const washerArgs = { householdId, applianceType: 'front_load_washer', highEfficiency: true, capacityUnits: 12, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['detergent_compartment', 'softener_compartment', 'direct_to_drum'], cycleMinutes: { normal: 40 }, provenance: label('washer plate') } satisfies Omit<FunctionArgs<typeof api.inventory.createMachine>, 'name'>
  const washer = await as.mutation(api.inventory.createMachine, { ...washerArgs, name: 'Washer 1' })
  const other = await as.mutation(api.inventory.createMachine, { ...washerArgs, name: 'Washer 2' })
  await capDetergent(as, householdId)
  const tee = await as.mutation(api.inventory.createTextile, { householdId, name: 'Tee', color: 'White', colorGroup: 'light', firstWash: false })
  await as.mutation(api.inventory.setCare, { textileId: tee, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, restrictions: [], provenance: label('care label') })
  const planned = await planFor(as, householdId, [tee])
  const load = planned.result.loads[0]!
  const started = await confirmAndStart(as, { planId: planned.planId, loadId: load.id, idempotencyKey: 'time', startedAt: 1_000_000, machineId: washer })
  return { householdId, washer, other, planned, load, sessionId: started.sessionId }
}

/** Records every step up to (not including) "Start the machine", then returns that step's id. */
async function upToStart(as: Caller, sessionId: Id<'sessions'>): Promise<string> {
  for (;;) {
    const detail = await as.query(api.execution.sessionDetail, { sessionId })
    const step = detail.actions.find((action) => action.status === 'pending')!
    if (step.kind === 'task' && step.task === 'start') return step.id
    if (step.kind === 'task' && step.task === 'drum_fullness') await as.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'medium' })
    else if (step.kind === 'task') await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed' })
    else await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed', usage: { supplyId: step.supplyId as Id<'supplies'>, amount: step.dose.amount, unit: step.dose.unit, placement: step.placement } })
  }
}

test('the minutes the washer shows at Start set the finish time, and Add time extends it', async () => {
  const t = newBackend()
  const as = signedIn(t, 'timer')
  const { sessionId } = await home(as)
  // Minutes belong to the Start step alone, and only as the washer would show them.
  const first = (await as.query(api.execution.sessionDetail, { sessionId })).actions.find((action) => action.status === 'pending')!
  expect(first).not.toMatchObject({ kind: 'task', task: 'start' })
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: first.id, status: 'confirmed', minutes: 55 })).rejects.toThrow('minutes')
  const startId = await upToStart(as, sessionId)
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: startId, status: 'confirmed', minutes: 0 })).rejects.toThrow('minutes')
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: startId, status: 'confirmed', minutes: 12.5 })).rejects.toThrow('minutes')
  // Before the washer runs there is nothing to add to.
  await expect(as.mutation(api.sessionTime.addMinutes, { sessionId, minutes: 10 })).rejects.toThrow('not been started')

  vi.setSystemTime(2_000_000)
  await as.mutation(api.actions.recordAction, { sessionId, actionId: startId, status: 'confirmed', minutes: 55 })
  const started = await as.query(api.execution.sessionDetail, { sessionId })
  expect(started.machineStartedAt).toBe(2_000_000)
  // 55 shown minutes win over the 40 on record.
  expect(started.estimatedFinishAt).toBe(2_000_000 + 55 * minute)
  expect((await t.run((ctx) => ctx.db.get(sessionId)))?.cycleMinutesShown).toBe(55)

  await expect(signedIn(t, 'outsider').mutation(api.sessionTime.addMinutes, { sessionId, minutes: 10 })).rejects.toThrow('Forbidden')
  await expect(as.mutation(api.sessionTime.addMinutes, { sessionId, minutes: 121 })).rejects.toThrow('between 1 and 120')
  expect(await as.mutation(api.sessionTime.addMinutes, { sessionId, minutes: 10 })).toEqual({ sessionId, cycleMinutesShown: 65 })
  const extended = await as.query(api.execution.sessionDetail, { sessionId })
  expect(extended.estimatedFinishAt).toBe(2_000_000 + 65 * minute)
  // The recorded steps survive the rebuild.
  expect(extended.actions.find((action) => action.id === startId)?.status).toBe('confirmed')
  expect(extended.actions.filter((action) => action.kind === 'treatment').every((action) => action.status === 'confirmed')).toBe(true)

  await as.mutation(api.execution.washFinished, { sessionId })
  await expect(as.mutation(api.sessionTime.addMinutes, { sessionId, minutes: 10 })).rejects.toThrow('already finished')
})

test('a load that has not started moves to another washer in the room, and never once the washer runs', async () => {
  const t = newBackend()
  const as = signedIn(t, 'mover')
  const { planned, load, washer, other, sessionId } = await home(as)
  const options = await as.query(api.execution.moveOptions, { sessionId, machineId: other })
  expect(options.currentName).toBe('Washer 1')
  expect(options.washers.map((entry) => entry.machineId)).toEqual([other])
  expect(options.unavailable).toBeNull()

  await expect(signedIn(t, 'outsider').mutation(api.execution.moveWasher, { sessionId, machineId: other })).rejects.toThrow('Forbidden')
  await expect(as.mutation(api.execution.moveWasher, { sessionId, machineId: washer })).rejects.toThrow('already on that washer')

  await as.mutation(api.execution.moveWasher, { sessionId, machineId: other })
  const timeline = await t.run((ctx) => ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique())
  expect(timeline?.machineId).toBe(other)
  expect(timeline?.actions.every((action) => action.status === 'pending')).toBe(true)
  const plan = await t.run((ctx) => ctx.db.get(planned.planId))
  expect(plan?.recipeConfirmations).toEqual([expect.objectContaining({ loadId: load.id, machineId: other })])
  expect(await t.run((ctx) => ctx.db.query('machineExecutionEvents').collect())).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'machine_substitution', machineId: other, details: expect.objectContaining({ previousMachineId: washer }) })]))

  const startId = await upToStart(as, sessionId)
  await as.mutation(api.actions.recordAction, { sessionId, actionId: startId, status: 'confirmed' })
  await expect(as.query(api.execution.moveOptions, { sessionId })).rejects.toThrow('has started')
  await expect(as.mutation(api.execution.moveWasher, { sessionId, machineId: washer })).rejects.toThrow('has started')
  await expect(as.mutation(api.execution.withoutDrawer, { sessionId })).rejects.toThrow('has started')
})
