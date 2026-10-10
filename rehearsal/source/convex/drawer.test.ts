import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import { recordedAdditionOffsetMinutes } from './execution'
import type { Id } from './_generated/dataModel'
import { startLoad as confirmAndStart, addDryer, capDetergent, finishSteps, label, newBackend, planFor, signedIn, type Backend, type Caller } from './harness.testing'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const steps = async (t: Backend, sessionId: Id<'sessions'>) =>
  t.run(async (ctx) => (await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique())!.actions)

test('by-hand timing comes only from explicit cycle-relative directions', () => {
  expect(recordedAdditionOffsetMinutes('At the start of the final rinse.')).toBeNull()
  expect(recordedAdditionOffsetMinutes('Soak for 10 minutes before washing')).toBeNull()
  expect(recordedAdditionOffsetMinutes(null)).toBeNull()
  expect(recordedAdditionOffsetMinutes('Add 10 minutes after starting the cycle.')).toBe(10)
  expect(recordedAdditionOffsetMinutes('at 15 minutes into the wash cycle')).toBe(15)
})

test.each(['direct_to_drum', 'downy_ball'] as const)('recovering just one missing compartment to %s keeps the usable drawer and recorded dose', async (placement) => {
  const t = newBackend()
  const as = signedIn(t, 'recovery-user')
  const home = await withDrawer(as, { sanitizer: true, standardTopLoader: placement === 'downy_ball' })
  const before = await steps(t, home.sessionId)
  const missing = before.find((action) => action.kind === 'treatment' && action.stage === 'rinse')!
  if (missing.kind !== 'treatment') throw new Error('Expected rinse product')
  const supplyId = missing.supplyId as Id<'supplies'>
  // Record the already completed work, including a deliberately different actual detergent dose.
  for (const action of before) {
    if (action.kind === 'task' && action.task === 'start') break
    if (placement === 'downy_ball' && action.kind === 'task' && action.task === 'close') continue
    if (action.kind === 'task' && action.task === 'drum_fullness') {
      await as.mutation(api.execution.recordDrumFullness, { sessionId: home.sessionId, machine: 'washer', size: 'medium' })
    } else if (action.kind === 'treatment' && action.supplyId === supplyId) continue
    else await as.mutation(api.actions.recordAction, { sessionId: home.sessionId, actionId: action.id, status: 'confirmed', ...(action.kind === 'treatment' ? { usage: { supplyId: home.detergent, amount: 2, unit: 'cap', mark: '1', placement: action.placement } } : {}) })
  }
  const recorded = (await steps(t, home.sessionId)).find((action) => action.kind === 'treatment' && action.supplyId === home.detergent)!
  const timing = placement === 'direct_to_drum' ? 'At the start of the final rinse.' : 'Before starting the cycle.'
  await as.mutation(api.inventory.saveRule, { supplyId, dose: { amount: 30, unit: 'ml' }, stage: 'rinse', placement, timing, provenance: label('Alternative printed on the bottle') })
  await as.mutation(api.inventory.updateMachine, { machineId: home.washer, applianceType: 'top_load_washer', rinseContact: { normal: { minutes: 16, placement, timing, source: 'Synthetic updated program observation' } }, ...(placement === 'downy_ball' ? { highEfficiency: false } : {}), placements: ['detergent_compartment', 'direct_to_drum', ...(placement === 'downy_ball' ? ['downy_ball' as const] : [])] })
  const options = await as.query(api.execution.preparationRecoveryOptions, { sessionId: home.sessionId, actionId: missing.id })
  expect(options.find((option) => option.placement === placement)).toMatchObject({ unavailable: null, timing })
  await as.mutation(api.execution.recoverPreparationPlacement, { sessionId: home.sessionId, actionId: missing.id, placement })
  const after = await steps(t, home.sessionId)
  expect(after.find((action) => action.id === recorded.id)).toMatchObject({ status: recorded.status, recordedAt: recorded.recordedAt, dose: recorded.kind === 'treatment' ? recorded.dose : undefined, placement: 'detergent_compartment' })
  expect(after.find((action) => action.id === missing.id)).toMatchObject({ placement, dose: { amount: 30, unit: 'ml' }, status: 'pending', phase: placement === 'direct_to_drum' ? 'cycle' : 'with_load' })
  expect(await as.query(api.execution.preparationIssues, { sessionId: home.sessionId })).toEqual([])
  expect((await t.run((ctx) => ctx.db.get(home.sessionId)))?.drawerUnusable).not.toBe(true)
  // An accepted recovery survives Start even if the household's current label is later edited.
  await as.mutation(api.inventory.setRanOut, { supplyId, ranOut: true })
  const start = after.find((action) => action.kind === 'task' && action.task === 'start')!
  if (placement === 'downy_ball') {
    await as.mutation(api.actions.recordAction, { sessionId: home.sessionId, actionId: missing.id, status: 'skipped' })
    const close = after.find((action) => action.kind === 'task' && action.task === 'close')!
    await as.mutation(api.actions.recordAction, { sessionId: home.sessionId, actionId: close.id, status: 'confirmed' })
  }
  await as.mutation(api.actions.recordAction, { sessionId: home.sessionId, actionId: start.id, status: 'confirmed', minutes: 40 })
  expect((await steps(t, home.sessionId)).find((action) => action.id === missing.id)).toMatchObject({ placement, dose: { amount: 30, unit: 'ml' }, offsetMinutes: null })
  expect((await steps(t, home.sessionId)).find((action) => action.id === recorded.id)).toMatchObject({ dose: recorded.kind === 'treatment' ? recorded.dose : undefined, status: 'confirmed' })
  expect(await as.query(api.execution.preparationRecoveryOptions, { sessionId: home.sessionId, actionId: missing.id })).toEqual([])
  await expect(as.mutation(api.execution.recoverPreparationPlacement, { sessionId: home.sessionId, actionId: missing.id, placement })).rejects.toThrow('washer has started')
})

test.each([true, undefined])('dispensing-ball recovery rejects highEfficiency=%s even with a recorded ball profile', async (highEfficiency) => {
  const t = newBackend()
  const as = signedIn(t, 'recovery-user')
  const home = await withDrawer(as, { sanitizer: true })
  const before = await steps(t, home.sessionId)
  const missing = before.find((action) => action.kind === 'treatment' && action.stage === 'rinse')!
  if (missing.kind !== 'treatment') throw new Error('Expected rinse product')
  await as.mutation(api.inventory.saveRule, { supplyId: missing.supplyId as Id<'supplies'>, dose: { amount: 30, unit: 'ml' }, stage: 'rinse', placement: 'downy_ball', timing: 'Before starting the cycle.', provenance: label('Alternative printed on the bottle') })
  await as.mutation(api.inventory.updateMachine, { machineId: home.washer, applianceType: 'top_load_washer', placements: ['detergent_compartment', 'direct_to_drum', 'downy_ball'] })
  await t.run((ctx) => ctx.db.patch(home.washer, { highEfficiency }))
  const options = await as.query(api.execution.preparationRecoveryOptions, { sessionId: home.sessionId, actionId: missing.id })
  expect(options.find((option) => option.placement === 'downy_ball')?.unavailable).toBeTruthy()
  await expect(as.mutation(api.execution.recoverPreparationPlacement, { sessionId: home.sessionId, actionId: missing.id, placement: 'downy_ball' })).rejects.toThrow('does not fit')
  expect(await steps(t, home.sessionId)).toEqual(before)
  expect((await t.run((ctx) => ctx.db.get(home.sessionId)))?.placementRecoveryLoad).toBeUndefined()
})

test('by-hand recovery cannot reuse a dispenser contact observation or another addition time', async () => {
  const t = newBackend()
  const as = signedIn(t, 'contact-recovery-user')
  const home = await withDrawer(as, { sanitizer: true, standardTopLoader: true })
  const before = await steps(t, home.sessionId)
  const missing = before.find((action) => action.kind === 'treatment' && action.stage === 'rinse')!
  if (missing.kind !== 'treatment') throw new Error('Expected rinse product')
  await as.mutation(api.inventory.saveRule, { supplyId: missing.supplyId as Id<'supplies'>, dose: { amount: 30, unit: 'ml' }, stage: 'rinse', placement: 'direct_to_drum', timing: 'At the start of the final rinse.', provenance: label('Synthetic alternative directions') })
  await as.mutation(api.inventory.updateMachine, { machineId: home.washer, placements: ['detergent_compartment', 'direct_to_drum'] })
  for (const contact of [
    { minutes: 20, placement: 'softener_compartment', source: 'Synthetic dispenser observation' },
    { minutes: 20, placement: 'direct_to_drum', timing: 'At the start of the first rinse.', source: 'Synthetic other rinse observation' },
  ]) {
    await as.mutation(api.inventory.updateMachine, { machineId: home.washer, rinseContact: { normal: contact } })
    const options = await as.query(api.execution.preparationRecoveryOptions, { sessionId: home.sessionId, actionId: missing.id })
    expect(options.find((option) => option.placement === 'direct_to_drum')?.unavailable).toBeTruthy()
    await expect(as.mutation(api.execution.recoverPreparationPlacement, { sessionId: home.sessionId, actionId: missing.id, placement: 'direct_to_drum' })).rejects.toThrow('does not fit')
    expect(await steps(t, home.sessionId)).toEqual(before)
  }
})

test('a missing compartment does not authorize unrecorded by-hand or ball alternatives', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recovery-user')
  const home = await withDrawer(as, { sanitizer: true })
  await as.mutation(api.inventory.updateMachine, { machineId: home.washer, applianceType: 'top_load_washer', placements: ['detergent_compartment', 'direct_to_drum'] })
  const before = await steps(t, home.sessionId)
  const missing = before.find((action) => action.kind === 'treatment' && action.stage === 'rinse')!
  const options = await as.query(api.execution.preparationRecoveryOptions, { sessionId: home.sessionId, actionId: missing.id })
  expect(options.every((option) => option.unavailable !== null)).toBe(true)
  await expect(as.mutation(api.execution.recoverPreparationPlacement, { sessionId: home.sessionId, actionId: missing.id, placement: 'direct_to_drum' })).rejects.toThrow('recorded product directions')
  expect(await steps(t, home.sessionId)).toEqual(before)
  expect((await t.run((ctx) => ctx.db.get(home.sessionId)))?.placementRecoveryLoad).toBeUndefined()
})

/** A washer with a drawer, a cap detergent, and a load not yet started on it. */
async function withDrawer(as: Caller, options: { sanitizer?: boolean; drying?: boolean; standardTopLoader?: boolean } = {}) {
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Home', displayName: 'Pat' })
  const washer = await as.mutation(api.inventory.createMachine, { householdId, name: options.standardTopLoader ? 'Standard top-loader' : 'Front-loader', applianceType: options.standardTopLoader ? 'top_load_washer' : 'front_load_washer', highEfficiency: !options.standardTopLoader, capacityUnits: 12, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['detergent_compartment', 'softener_compartment', 'direct_to_drum'], cycleMinutes: { normal: 40 }, provenance: label('washer plate') })
  const detergent = await capDetergent(as, householdId)
  if (options.sanitizer === true) await as.mutation(api.inventory.updateMachine, { machineId: washer, rinseContact: { normal: { minutes: 16, placement: 'softener_compartment', source: 'Synthetic program contact observation' } } })
  if (options.drying === true) await addDryer(as, householdId)
  const optionalSupplyIds: Id<'supplies'>[] = []
  if (options.sanitizer === true) {
    const lysol = await as.mutation(api.inventory.createSupply, { householdId, name: 'Lysol Laundry Sanitizer', kind: 'chemical', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [], sanitizing: { route: 'rinse', minimumContactMinutes: 16, formulation: 'Synthetic placement-test pack', source: 'Synthetic label' } }, use: 'rinse_sanitizer', formulation: { name: 'laundry sanitizer', form: 'liquid' }, provenance: label('Lysol bottle') })
    optionalSupplyIds.push(lysol)
    await as.mutation(api.inventory.saveRule, { supplyId: lysol, dose: { amount: 60, unit: 'ml' }, stage: 'rinse', placement: 'softener_compartment', timing: 'before starting', provenance: label('Lysol bottle') })
  }
  const tee = await as.mutation(api.inventory.createTextile, { householdId, name: 'Tee', color: 'White', colorGroup: 'light', firstWash: false })
  await as.mutation(api.inventory.setCare, { textileId: tee, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, restrictions: [], ...(options.drying === true ? { dryMethod: 'tumble_dry' as const, dryHeat: 'low' as const } : {}), provenance: label('care label') })
  const planned = await planFor(as, householdId, [tee], { optionalSupplyIds })
  const load = planned.result.loads[0]!
  const started = await confirmAndStart(as, { planId: planned.planId, loadId: load.id, idempotencyKey: 'drawer', startedAt: 1_000_000 })
  return { householdId, washer, detergent, tee, planned, load, sessionId: started.sessionId }
}

test.each(['ran out', 'care changed', 'washer changed'])('the accepted no-drawer steps survive every rebuild after %s', async (change) => {
  const t = newBackend()
  const as = signedIn(t, 'drawer-user')
  const { sessionId, detergent, tee, washer } = await withDrawer(as, { drying: true })
  await as.mutation(api.execution.withoutDrawer, { sessionId })
  // Record preparation, including the actual cap dose, before the household records change.
  await as.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'medium' })
  for (const step of await steps(t, sessionId)) {
    if (step.kind === 'task' && step.task === 'start') break
    if (step.status !== 'pending') continue
    if (step.kind === 'task') await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed' })
    else await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed', usage: { supplyId: detergent, amount: step.dose.amount, unit: step.dose.unit, mark: step.dose.mark, placement: step.placement } })
  }
  const recorded = (await steps(t, sessionId)).filter((step) => step.kind === 'treatment')
  expect(recorded).toHaveLength(1)
  expect(recorded[0]).toMatchObject({ supplyId: detergent, placement: 'direct_to_drum', status: 'confirmed', dose: { amount: 1, unit: 'cap', mark: '1' } })
  if (change === 'ran out') await as.mutation(api.inventory.setRanOut, { supplyId: detergent, ranOut: true })
  if (change === 'care changed') await as.mutation(api.inventory.setCare, { textileId: tee, washMethod: 'hand_wash', restrictions: [], provenance: label('updated care label') })
  if (change === 'washer changed') await as.mutation(api.inventory.updateMachine, { machineId: washer, placements: ['detergent_compartment'] })

  const start = (await steps(t, sessionId)).find((step) => step.kind === 'task' && step.task === 'start')!
  await as.mutation(api.actions.recordAction, { sessionId, actionId: start.id, status: 'confirmed', minutes: 40 })
  expect((await steps(t, sessionId)).filter((step) => step.kind === 'treatment')).toEqual(recorded)
  await as.mutation(api.sessionTime.addMinutes, { sessionId, minutes: 10 })
  expect((await steps(t, sessionId)).filter((step) => step.kind === 'treatment')).toEqual(recorded)
  await as.mutation(api.execution.reschedule, { sessionId, startedAt: Date.now() })
  expect((await steps(t, sessionId)).filter((step) => step.kind === 'treatment')).toEqual(recorded)
  await as.mutation(api.execution.washFinished, { sessionId })
  await finishSteps(as, sessionId)
  const detail = await as.query(api.execution.sessionDetail, { sessionId })
  expect(detail.dryerStartedAt).not.toBeNull()
  expect((await steps(t, sessionId)).filter((step) => step.kind === 'treatment')).toEqual(recorded)
})

test('an older no-drawer session requires saving its recipe again instead of silently replanning', async () => {
  const t = newBackend()
  const as = signedIn(t, 'drawer-user')
  const { sessionId } = await withDrawer(as)
  await as.mutation(api.execution.withoutDrawer, { sessionId })
  await t.run(async (ctx) => {
    const { drawerlessLoad: _load, _id, _creationTime, ...legacy } = (await ctx.db.get(sessionId))!
    await ctx.db.replace(sessionId, legacy)
  })
  await expect(finishSteps(as, sessionId)).rejects.toThrow('Recalculate without the drawer again')
  expect((await t.run((ctx) => ctx.db.get(sessionId)))?.machineStartedAt).toBeUndefined()
  expect((await steps(t, sessionId)).find((step) => step.kind === 'task' && step.task === 'start')?.status).toBe('pending')
  await as.mutation(api.execution.withoutDrawer, { sessionId })
  await finishSteps(as, sessionId)
  expect((await as.query(api.execution.sessionDetail, { sessionId })).machineStartedAt).not.toBeNull()
})

test('moving to another washer clears the no-drawer recipe and uses that washer’s steps', async () => {
  const t = newBackend()
  const as = signedIn(t, 'drawer-user')
  const { sessionId, washer } = await withDrawer(as)
  const other = await as.mutation(api.inventory.addMachineLikeIt, { machineId: washer, name: 'Other front-loader' })
  await as.mutation(api.execution.withoutDrawer, { sessionId })
  // A copied machine's capacity still needs explicit confirmation.
  await expect(as.mutation(api.execution.moveWasher, { sessionId, machineId: other })).rejects.toThrow('no steps for that washer')
  expect((await t.run((ctx) => ctx.db.get(sessionId)))?.drawerUnusable).toBe(true)
  await as.mutation(api.inventory.updateMachine, { machineId: other, capacityUnits: 12, capacityConfidence: 'verified' })
  await as.mutation(api.execution.moveWasher, { sessionId, machineId: other })
  const session = await t.run((ctx) => ctx.db.get(sessionId))
  expect(session?.drawerUnusable).toBeUndefined()
  expect(session?.drawerlessLoad).toBeUndefined()
  await finishSteps(as, sessionId)
  expect((await steps(t, sessionId)).find((step) => step.kind === 'treatment')).toMatchObject({ placement: 'detergent_compartment', status: 'confirmed' })
})

test('without the drawer, a wash product goes in the drum, the recipe is confirmed, and the start keeps it', async () => {
  const t = newBackend()
  const as = signedIn(t, 'drawer-user')
  const home = await withDrawer(as)
  expect((await steps(t, home.sessionId)).find((step) => step.kind === 'treatment')).toMatchObject({ placement: 'detergent_compartment', phase: 'dispenser' })

  const preview = await as.query(api.execution.withoutDrawerPreview, { sessionId: home.sessionId })
  expect(preview.unavailable).toBeNull()
  expect(preview.changes[0]).toMatchObject({ from: expect.stringContaining('detergent compartment'), to: expect.stringContaining('direct to drum') })

  await as.mutation(api.execution.withoutDrawer, { sessionId: home.sessionId })
  const after = await steps(t, home.sessionId)
  expect(after.find((step) => step.kind === 'treatment')).toMatchObject({ placement: 'direct_to_drum', phase: 'drum', status: 'pending' })
  const session = await t.run((ctx) => ctx.db.get(home.sessionId))
  expect(session?.drawerUnusable).toBe(true)
  expect(await t.run((ctx) => ctx.db.query('machineExecutionEvents').collect())).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'drawer_unusable', source: 'manual', confidence: 'user-supplied' })]))
  expect((await as.query(api.execution.withoutDrawerPreview, { sessionId: home.sessionId })).changes).toEqual([])

  // Starting the machine rebuilds the steps; they stay drawer-free.
  await finishSteps(as, home.sessionId)
  expect((await steps(t, home.sessionId)).find((step) => step.kind === 'treatment')).toMatchObject({ placement: 'direct_to_drum' })
  expect((await as.query(api.execution.sessionDetail, { sessionId: home.sessionId })).machineStartedAt).not.toBeNull()
})

test('without the drawer, a product with nowhere to go blocks the recalculation and changes nothing', async () => {
  const t = newBackend()
  const as = signedIn(t, 'drawer-user')
  const home = await withDrawer(as, { sanitizer: true })
  const before = await steps(t, home.sessionId)
  const preview = await as.query(api.execution.withoutDrawerPreview, { sessionId: home.sessionId })
  expect(preview.unavailable).toContain('Lysol Laundry Sanitizer')
  await expect(as.mutation(api.execution.withoutDrawer, { sessionId: home.sessionId })).rejects.toThrow('Lysol Laundry Sanitizer')
  expect(await steps(t, home.sessionId)).toEqual(before)
  expect((await t.run((ctx) => ctx.db.get(home.sessionId)))?.drawerUnusable).toBeUndefined()
})
