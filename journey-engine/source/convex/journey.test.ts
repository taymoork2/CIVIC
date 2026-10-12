import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { startLoad, intakeHousehold, label, newBackend, planFor, signedIn } from './harness.testing'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

// AE1 and AE5 through the public functions: intake, plan, act, complete, and read the outcome back.
test('a household plans, records each action, and completes a load exactly once', async () => {
  const t = newBackend()
  const as = signedIn(t, 'journey-user')
  const home = await intakeHousehold(as)
  const oxi = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Oxi powder', kind: 'chemical', safety: { bleachKind: 'oxygen', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'oxygen powder', form: 'powder' }, provenance: label('Oxi tub label') })
  await as.mutation(api.inventory.saveRule, { supplyId: oxi, dose: { amount: 35, unit: 'g', measurementCue: 'one scoop' }, stage: 'wash', placement: 'direct_to_drum', timing: 'before loading garments', provenance: label('Oxi tub label') })

  const planned = await planFor(as, home.householdId, [home.shirt, home.towel], { optionalSupplyIds: [oxi] })
  expect(planned.status).toBe('ready')
  const load = planned.result.loads[0]!
  expect(load.treatments.map((step) => step.placement).sort()).toEqual(['detergent_compartment', 'direct_to_drum'])

  const started = await startLoad(as, { planId: planned.planId, loadId: load.id, idempotencyKey: 'load-1' })
  const detail = await as.query(api.execution.sessionDetail, { sessionId: started.sessionId })
  expect(detail.actions.map((action) => (action.kind === 'task' ? action.task : action.phase))).toEqual(['drum', 'load', 'close', 'dispenser', 'start'])
  const [oxiAction, loadTask, closeTask, detergentAction, startTask] = detail.actions
  expect(detergentAction!.supplyName).toBe('Tide HE liquid')
  expect(oxiAction!.supplyName).toBe('Oxi powder')
  const sessionId = started.sessionId

  await expect(as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'load-1' })).rejects.toThrow('Pending actions')

  await as.mutation(api.actions.recordAction, { sessionId, actionId: oxiAction!.id, status: 'skipped' })
  await as.mutation(api.actions.recordAction, { sessionId, actionId: loadTask!.id, status: 'confirmed' })
  await as.mutation(api.actions.recordAction, { sessionId, actionId: closeTask!.id, status: 'confirmed' })
  const confirm = { sessionId, actionId: detergentAction!.id, status: 'confirmed' as const, usage: { supplyId: home.detergent, amount: 32, unit: 'ml', placement: 'detergent_compartment' } }
  await as.mutation(api.actions.recordAction, confirm)
  await expect(as.mutation(api.actions.recordAction, confirm)).rejects.toThrow('already recorded')
  await as.mutation(api.actions.recordAction, { sessionId, actionId: startTask!.id, status: 'confirmed' })
  expect((await as.query(api.execution.sessionDetail, { sessionId })).estimatedFinishAt).not.toBeNull()

  const completion = { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'load-1' }
  await expect(as.mutation(api.sessions.complete, completion)).resolves.toMatchObject({ status: 'completed' })
  await expect(as.mutation(api.sessions.complete, completion)).resolves.toMatchObject({ status: 'already_completed' })

  const done = await as.query(api.execution.sessionDetail, { sessionId })
  expect(done.status).toBe('completed')
  expect(done.usage).toEqual([expect.objectContaining({ supplyName: 'Tide HE liquid', amount: 32, unit: 'ml' })])
  expect(done.reminders.every((entry) => entry.status !== 'scheduled')).toBe(true)

  const wardrobe = await as.query(api.inventory.list, { householdId: home.householdId })
  const washed = wardrobe.textiles.filter((textile) => textile.textileId === home.shirt || textile.textileId === home.towel)
  // No dryer is recorded, so washed garments hang until All dry.
  expect(washed.every((textile) => textile.status === 'hanging' && textile.washCount === 1)).toBe(true)
  const stored = await t.run(async (ctx) => ({ history: await ctx.db.query('history').collect(), usage: await ctx.db.query('usage').collect() }))
  expect(stored.history.filter((entry) => entry.event === 'washed')).toHaveLength(2)
  expect(stored.usage).toHaveLength(1)
  expect((await as.query(api.execution.householdSessions, { householdId: home.householdId }))[0]).toMatchObject({ sessionId, status: 'completed', textileCount: 2, machineName: null, dryerName: null })
  await expect(as.mutation(api.closet.allDry, { sessionId })).resolves.toEqual({ changed: 2 })
  expect((await as.query(api.closet.today, { householdId: home.householdId })).readyCount).toBe(2)
  expect((await t.run(async (ctx) => ctx.db.query('history').collect())).filter((entry) => entry.event === 'dried')).toHaveLength(2)
})

test('a new household sees ready clothes separately from clothes waiting to wash', async () => {
  const t = newBackend()
  const as = signedIn(t, 'first-household')
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Home' })
  const [ready] = await as.mutation(api.inventory.createTextiles, { householdId, name: 'Work shirt', quantity: 1, status: 'clean', kind: 'shirt' })
  await as.mutation(api.inventory.createTextiles, { householdId, name: 'Towels', quantity: 2, status: 'dirty', kind: 'towel' })
  expect((await as.query(api.closet.today, { householdId })).readyCount).toBe(1)
  expect((await as.query(api.closet.attention, { householdId, now: Date.now() })).hamper.count).toBe(2)
  await as.mutation(api.closet.flagDirty, { textileIds: [ready!], reasons: [], soilLevel: 'normal' })
  expect((await as.query(api.closet.attention, { householdId, now: Date.now() })).hamper.count).toBe(3)
  await as.mutation(api.closet.unflag, { textileIds: [ready!] })
  expect((await as.query(api.closet.today, { householdId })).readyCount).toBe(1)
})

test('another household cannot read or act on a session', async () => {
  const t = newBackend()
  const as = signedIn(t, 'journey-user')
  const outsider = signedIn(t, 'journey-outsider')
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt])
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'x' })

  await expect(outsider.query(api.execution.sessionDetail, { sessionId })).rejects.toThrow('Forbidden')
  await expect(outsider.mutation(api.actions.recordAction, { sessionId, actionId: 'load-001:task:load', status: 'confirmed' })).rejects.toThrow('Forbidden')
  await expect(outsider.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'x' })).rejects.toThrow('Forbidden')
  await expect(outsider.mutation(api.execution.cancel, { sessionId })).rejects.toThrow('Forbidden')
  await expect(outsider.query(api.execution.householdSessions, { householdId: home.householdId })).rejects.toThrow('Forbidden')
})

// The busy-household path to a dose: nothing typed from a label until a load needs it, and the size read off the drum.
test('a product saved without lines is asked about when a load needs it, and its line for a large load is read at the machine', async () => {
  const t = newBackend()
  const as = signedIn(t, 'journey-user')
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Home', displayName: 'Pat' })
  await as.mutation(api.inventory.createMachine, {
    householdId, name: 'Washer', location: 'home', applianceType: 'front_load_washer', placements: ['detergent_compartment', 'direct_to_drum'],
    supportedCycles: ['normal', 'delicate'], cycleMinutes: { normal: 50 }, provenance: { source: 'machine_taps', confidence: 'observed' },
  })
  const jerseys = await as.mutation(api.inventory.createTextiles, {
    householdId, name: 'Soccer jersey', quantity: 2, status: 'dirty', soilLevel: 'normal', kind: 'workout', colorGroup: 'light',
    tag: { washMethod: 'machine', maxTemperatureC: 40, cycle: 'normal', dryMethod: 'line_dry' },
  })
  const tide = await as.mutation(api.inventory.createSupply, {
    householdId, name: 'Tide Original', use: 'detergent', kind: 'chemical', measure: { kind: 'cap', marks: [{ label: '1' }, { label: '3' }, { label: '5' }] },
    safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] },
    formulation: { name: 'Tide Original', form: 'liquid' }, provenance: { source: 'label_taps', confidence: 'observed' },
  })

  // Make loads: the label has no line for this load yet, so one card asks.
  const recompute = (dismissedQuestions: { kind: 'label_row'; subjectId: string; context: { soilLevel?: 'normal' }; answer: 'depends_on_size' }[] = []) =>
    as.mutation(api.plans.recompute, { householdId, selectedTextileIds: jerseys, clientInputHash: 'make-loads', ...(dismissedQuestions.length === 0 ? {} : { dismissedQuestions }) })
  const asked = await recompute()
  expect(asked.status).toBe('needs_confirmation')
  const cards = await as.query(api.plans.questions, { planId: asked.planId })
  expect(cards).toEqual([expect.objectContaining({ kind: 'label_row', key: { kind: 'label_row', subjectId: tide, context: { soilLevel: 'normal' } }, product: expect.objectContaining({ use: 'detergent' }) })])

  // "It depends on how full the washer is": the load is ready, and the dose waits for the drum.
  const answered = await recompute([{ kind: 'label_row', subjectId: cards[0]!.key.subjectId, context: { soilLevel: 'normal' }, answer: 'depends_on_size' }])
  expect(answered.status).toBe('ready')
  const planned = (await as.query(api.plans.get, { planId: answered.planId }))!
  expect(await as.query(api.plans.questions, { planId: answered.planId })).toEqual([])
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'journey' })
  const steps = async () => (await as.query(api.execution.sessionDetail, { sessionId })).actions
  expect((await steps()).map((action) => (action.kind === 'task' ? action.task : action.phase))).toEqual(['load', 'drum_fullness', 'close', 'dispenser', 'start'])
  const dose = (await steps()).find((action) => action.kind === 'treatment')!
  expect(dose).toMatchObject({ supplyName: 'Tide Original', placement: 'detergent_compartment', dose: { amount: 0, unit: 'at_machine' } })

  // At the machine: the clothes go in, the drum looks large, and the label is read for that load.
  await as.mutation(api.actions.recordAction, { sessionId, actionId: (await steps())[0]!.id, status: 'confirmed' })
  const large = { sessionId, machine: 'washer' as const, size: 'large' as const }
  const missing = await as.mutation(api.execution.recordDrumFullness, large)
  expect(missing).toEqual({ steps: [{ actionId: dose.id, status: 'label_row_needed', supplyId: tide, context: { loadSize: 'large', soilLevel: 'normal' } }] })
  const step = missing.steps[0]!
  if (step.status !== 'label_row_needed') throw new Error('Expected a label question')
  await as.mutation(api.inventory.answerLabelRow, { supplyId: step.supplyId, context: step.context, dose: { amount: 1, unit: 'cap', mark: '5' }, rowText: 'Large load' })
  await expect(as.mutation(api.execution.recordDrumFullness, large)).resolves.toEqual({ steps: [{ actionId: dose.id, status: 'resolved' }] })
  const resolved = (await steps()).find((action) => action.id === dose.id)!
  if (resolved.kind !== 'treatment') throw new Error('Expected the dose step')
  expect(resolved.atMachine?.lineText).toBe('Large load')
  expect(resolved).toMatchObject({ dose: { amount: 1, unit: 'cap', mark: '5' }, atMachine: { resolvedSize: 'large' } })

  for (const action of (await steps()).filter((entry) => entry.status === 'pending')) {
    await as.mutation(api.actions.recordAction, action.kind === 'task'
      ? { sessionId, actionId: action.id, status: 'confirmed' }
      : { sessionId, actionId: action.id, status: 'confirmed', usage: { supplyId: action.supplyId as Id<'supplies'>, amount: action.dose.amount, unit: action.dose.unit, mark: action.dose.mark!, placement: action.placement } })
  }
  // The line answered at the machine re-read the plan in place, so finishing sends the plan as it is now.
  const { planInputHash } = await as.query(api.execution.sessionDetail, { sessionId })
  expect(planInputHash).not.toBe(planned.inputHash)
  await expect(as.mutation(api.sessions.complete, { sessionId, planInputHash: planInputHash!, idempotencyKey: 'journey' })).resolves.toMatchObject({ status: 'completed', ready: 0, hanging: 2 })
  expect((await as.query(api.execution.sessionDetail, { sessionId })).usage).toEqual([expect.objectContaining({ supplyName: 'Tide Original', amount: 1, unit: 'cap', mark: '5' })])
  // The line is the product's now, saved for exactly the load it was asked about.
  expect((await as.query(api.inventory.list, { householdId })).supplies[0]!.rules).toEqual([expect.objectContaining({ row: 1, rowText: 'Large load', conditions: { loadSizes: ['large'], soilLevels: ['normal'] } })])
})
