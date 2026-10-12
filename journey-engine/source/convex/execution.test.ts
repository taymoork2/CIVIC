import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { startLoad as confirmAndStart, addDryer, capDetergent, capMeasure, dryingCare, finishSteps, intakeHousehold, label, newBackend, planFor, signedIn, type Backend, type Caller } from './harness.testing'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

async function startLoad(as: Caller, householdId: Id<'households'>, textileIds: Id<'textiles'>[], key = 'once', optionalSupplyIds: Id<'supplies'>[] = []) {
  const planned = await planFor(as, householdId, textileIds, { optionalSupplyIds })
  const started = await confirmAndStart(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: key, startedAt: 1_000_000 })
  return { planned, started }
}

const steps = async (t: Backend, sessionId: Id<'sessions'>) =>
  t.run(async (ctx) => (await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique())!.actions)

const scheduledReminders = (t: Backend) =>
  t.run(async (ctx) => (await ctx.db.query('reminders').collect()).filter((reminder) => reminder.status === 'scheduled'))

/** Records every pre-start step in order, confirming products at their planned dose. */
async function recordUntilStart(t: Backend, as: Caller, sessionId: Id<'sessions'>) {
  for (const step of (await steps(t, sessionId)).filter((entry) => entry.phase !== 'cycle')) {
    await as.mutation(api.actions.recordAction, step.kind === 'task'
      ? { sessionId, actionId: step.id, status: 'confirmed' }
      : { sessionId, actionId: step.id, status: 'confirmed', usage: { supplyId: step.supplyId as Id<'supplies'>, amount: step.dose.amount, unit: step.dose.unit, placement: step.placement } })
  }
}

test('a front-loader load runs in physical order: drum, garments, door, drawer, then start', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, applianceType: 'front_load_washer' })
  const oxi = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Oxi powder', kind: 'chemical', safety: { bleachKind: 'oxygen', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'oxygen powder', form: 'powder' }, provenance: label('Oxi tub') })
  await as.mutation(api.inventory.saveRule, { supplyId: oxi, dose: { amount: 35, unit: 'g' }, stage: 'wash', placement: 'direct_to_drum', timing: 'before loading garments', provenance: label('Oxi tub') })
  const { started } = await startLoad(as, home.householdId, [home.shirt], 'once', [oxi])

  const timeline = await steps(t, started.sessionId)
  expect(timeline.map((step) => (step.kind === 'task' ? step.task : step.phase))).toEqual(['drum', 'load', 'close', 'dispenser', 'start'])
  expect(timeline.find((step) => step.kind === 'task' && step.task === 'close')).toMatchObject({ title: 'Close the door' })
  // Loading names the garments going in.
  expect(timeline.find((step) => step.kind === 'task' && step.task === 'load')).toMatchObject({ title: 'Load the garment', garments: [{ textileId: home.shirt }] })
  // Nothing is timed until the machine actually starts.
  expect(timeline.every((step) => step.kind === 'task' || step.dueAt === undefined)).toBe(true)
  expect(await scheduledReminders(t)).toHaveLength(0)
  expect((await as.query(api.execution.sessionDetail, { sessionId: started.sessionId })).estimatedFinishAt).toBeNull()
})

test('a removed product compartment pauses preparation without recording usage; leaving it out clears the issue', async () => {
  const t = newBackend()
  const as = signedIn(t, 'placement-user')
  const home = await intakeHousehold(as)
  const { started } = await startLoad(as, home.householdId, [home.shirt])
  expect(await as.query(api.execution.preparationIssues, { sessionId: started.sessionId })).toEqual([])
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, placements: ['direct_to_drum'] })
  const issue = (await as.query(api.execution.preparationIssues, { sessionId: started.sessionId }))[0]!
  expect(issue).toMatchObject({ product: 'Tide HE liquid', placement: 'detergent_compartment' })
  await expect(as.mutation(api.actions.recordAction, {
    sessionId: started.sessionId, actionId: issue.actionId, status: 'confirmed',
    usage: { supplyId: home.detergent, amount: 28, unit: 'ml', placement: 'detergent_compartment' },
  })).rejects.toThrow('no longer supports')
  const start = (await steps(t, started.sessionId)).find((action) => action.kind === 'task' && action.task === 'start')!
  await expect(as.mutation(api.actions.recordAction, { sessionId: started.sessionId, actionId: start.id, status: 'confirmed' })).rejects.toThrow('no longer supports')
  expect(await t.run((ctx) => ctx.db.query('usage').collect())).toEqual([])
  await expect(signedIn(t, 'stranger').query(api.execution.preparationIssues, { sessionId: started.sessionId })).rejects.toThrow()
  await as.mutation(api.actions.recordAction, { sessionId: started.sessionId, actionId: issue.actionId, status: 'skipped' })
  expect(await as.query(api.execution.preparationIssues, { sessionId: started.sessionId })).toEqual([])
  for (const action of (await steps(t, started.sessionId)).filter((entry) => entry.status === 'pending')) {
    expect(action.kind).toBe('task')
    await as.mutation(api.actions.recordAction, { sessionId: started.sessionId, actionId: action.id, status: 'confirmed' })
  }
  expect((await as.query(api.execution.sessionDetail, { sessionId: started.sessionId })).machineStartedAt).not.toBeNull()
})

test('the machine cannot start before every earlier step is recorded; starting sets the finish time', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await intakeHousehold(as)
  const { started } = await startLoad(as, home.householdId, [home.shirt])
  const timeline = await steps(t, started.sessionId)
  const byTask = (name: 'load' | 'close' | 'start') => timeline.find((step) => step.kind === 'task' && step.task === name)!.id
  const tide = timeline.find((step) => step.kind === 'treatment')!
  const record = (actionId: string, status: 'confirmed' | 'skipped', usage?: { supplyId: Id<'supplies'>; amount: number; unit: string; placement: string }) =>
    as.mutation(api.actions.recordAction, { sessionId: started.sessionId, actionId, status, ...(usage === undefined ? {} : { usage }) })

  await expect(record(byTask('start'), 'confirmed')).rejects.toThrow('Record every step')
  await expect(record(byTask('load'), 'skipped')).rejects.toThrow('only be marked done')
  await record(byTask('load'), 'confirmed')
  await record(byTask('close'), 'confirmed')
  await record(tide.id, 'confirmed', { supplyId: home.detergent, amount: 28, unit: 'ml', placement: 'detergent_compartment' })
  await record(byTask('start'), 'confirmed')

  const detail = await as.query(api.execution.sessionDetail, { sessionId: started.sessionId })
  expect(detail.machineStartedAt).not.toBeNull()
  expect(detail.estimatedFinishAt).toBe(detail.machineStartedAt! + 40 * 60_000)
  expect(detail.actions.every((action) => action.status === 'confirmed')).toBe(true)
  expect(await t.run((ctx) => ctx.db.query('usage').collect())).toEqual([expect.objectContaining({ amount: 28, supplyId: home.detergent })])

  // Correcting the start time keeps every recorded step.
  await as.mutation(api.execution.reschedule, { sessionId: started.sessionId, startedAt: 2_000_000 })
  const corrected = await as.query(api.execution.sessionDetail, { sessionId: started.sessionId })
  expect(corrected.estimatedFinishAt).toBe(2_000_000 + 40 * 60_000)
  expect(corrected.actions.every((action) => action.status === 'confirmed')).toBe(true)
})

test('an explicit label time is measured from Start and its reminder only prompts', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await intakeHousehold(as)
  const rinseAid = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Rinse aid', kind: 'chemical', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'rinse aid', form: 'liquid' }, provenance: label('bottle') })
  await as.mutation(api.inventory.saveRule, { supplyId: rinseAid, dose: { amount: 60, unit: 'ml' }, stage: 'rinse', placement: 'direct_to_drum', timing: '10 minutes after starting the cycle', provenance: label('bottle') })
  const { started } = await startLoad(as, home.householdId, [home.shirt], 'once', [rinseAid])
  const rinse = (await steps(t, started.sessionId)).find((step) => step.kind === 'treatment' && step.supplyId === rinseAid)!
  expect(rinse).toMatchObject({ phase: 'cycle' })
  expect(rinse.kind === 'treatment' && rinse.dueAt).toBeUndefined()

  // Correcting the start time is only possible once the Start step has been recorded.
  await expect(as.mutation(api.execution.reschedule, { sessionId: started.sessionId, startedAt: 5_000_000 })).rejects.toThrow('not been started')
  await recordUntilStart(t, as, started.sessionId)
  await as.mutation(api.execution.reschedule, { sessionId: started.sessionId, startedAt: 5_000_000 })
  const timed = (await steps(t, started.sessionId)).find((step) => step.kind === 'treatment' && step.supplyId === rinseAid)!
  expect(timed.kind === 'treatment' && timed.dueAt).toBe(5_000_000 + 10 * 60_000)
  const reminders = await scheduledReminders(t)
  expect(reminders).toHaveLength(1)

  await t.mutation(internal.reminders.deliver, { reminderId: reminders[0]!._id })
  expect((await steps(t, started.sessionId)).find((step) => step.id === timed.id)!.status).toBe('pending')
})

test('a garment already in a running load cannot start in another', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await intakeHousehold(as)
  await startLoad(as, home.householdId, [home.shirt], 'first-plan')
  // A different selection that also holds the shirt: the plan says it cannot start, and start refuses it.
  const second = await planFor(as, home.householdId, [home.shirt, home.towel])
  const withShirt = second.result.loads.find((load) => load.textileIds.includes(home.shirt))!
  expect(second.loadStates.find((state) => state.loadId === withShirt.id)?.startable).toBe(false)
  await expect(confirmAndStart(as, { planId: second.planId, loadId: withShirt.id, idempotencyKey: 'second-plan' })).rejects.toThrow('already in a running load')
})

test('a front-loader will not plan a product that would have to go in by hand mid-rinse', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await intakeHousehold(as)
  const front = await as.mutation(api.inventory.createMachine, { householdId: home.householdId, name: 'Front-loader', applianceType: 'front_load_washer', capacityUnits: 8, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['detergent_compartment', 'direct_to_drum'], provenance: label('plate') })
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, archived: true })
  const rinseAid = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Rinse aid', kind: 'chemical', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'rinse aid', form: 'liquid' }, provenance: label('bottle') })
  await as.mutation(api.inventory.saveRule, { supplyId: rinseAid, dose: { amount: 60, unit: 'ml' }, stage: 'rinse', placement: 'direct_to_drum', timing: 'at the start of the rinse', provenance: label('bottle') })
  const planned = await planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [rinseAid] })
  expect(planned.status).toBe('needs_confirmation')
  expect(planned.result.reasons.some((reason) => reason.details.cause === 'locked_door_mid_cycle' && reason.machineId === front)).toBe(true)
  expect(planned.loadStates.every((state) => !state.startable)).toBe(true)
})

test('a load starts only when its own evidence is complete', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await intakeHousehold(as)
  const mixed = await planFor(as, home.householdId, [home.shirt, home.towel, home.sweater])
  expect(mixed.status).toBe('needs_confirmation')
  expect(mixed.result.exclusions.map((exclusion) => exclusion.textileId)).toEqual([home.sweater])
  const readyLoad = mixed.result.loads.find((load) => load.textileIds.includes(home.shirt))!
  await expect(confirmAndStart(as, { planId: mixed.planId, loadId: readyLoad.id, idempotencyKey: 'mixed' })).resolves.toMatchObject({ status: 'running' })

  const unread = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Unlabelled booster', kind: 'chemical', provenance: { source: 'no label', confidence: 'unknown' } })
  const blocked = await planFor(as, home.householdId, [home.towel], { optionalSupplyIds: [unread] })
  await expect(confirmAndStart(as, { planId: blocked.planId, loadId: blocked.result.loads[0]!.id, idempotencyKey: 'blocked' })).rejects.toThrow('Load needs confirmation')
})

test('a stale plan cannot start, and a load cannot be started twice', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await intakeHousehold(as)

  const edited = await planFor(as, home.householdId, [home.shirt])
  await as.mutation(api.inventory.setCare, { textileId: home.shirt, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, restrictions: [], provenance: label('label reread') })
  expect((await as.query(api.plans.get, { planId: edited.planId }))?.status).toBe('stale')
  await expect(confirmAndStart(as, { planId: edited.planId, loadId: edited.result.loads[0]!.id, idempotencyKey: 'edited' })).rejects.toThrow('Stale plan')

  // A change that bypassed the inventory functions is still caught by recomputing at start.
  const bypassed = await planFor(as, home.householdId, [home.shirt])
  await t.run((ctx) => ctx.db.patch(home.shirt, { bulkUnits: 3 }))
  await expect(confirmAndStart(as, { planId: bypassed.planId, loadId: bypassed.result.loads[0]!.id, idempotencyKey: 'bypassed' })).rejects.toThrow('Stale plan')

  const current = await planFor(as, home.householdId, [home.shirt])
  const loadId = current.result.loads[0]!.id
  const first = await confirmAndStart(as, { planId: current.planId, loadId, idempotencyKey: 'first' })
  await expect(confirmAndStart(as, { planId: current.planId, loadId, idempotencyKey: 'first' })).resolves.toMatchObject({ sessionId: first.sessionId })
  await expect(confirmAndStart(as, { planId: current.planId, loadId, idempotencyKey: 'second' })).rejects.toThrow('already has a session')

  await as.mutation(api.execution.cancel, { sessionId: first.sessionId })
  expect((await t.run((ctx) => ctx.db.query('reminders').collect())).every((reminder) => reminder.status === 'cancelled')).toBe(true)
  await expect(confirmAndStart(as, { planId: current.planId, loadId, idempotencyKey: 'after-cancel' })).resolves.toMatchObject({ status: 'running' })
})

test('Start after Cancel on the same load makes a new session, and a double tap still returns the running one', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt])
  const loadId = planned.result.loads[0]!.id
  const key = `${planned.planId}:${loadId}`
  const first = await confirmAndStart(as, { planId: planned.planId, loadId, idempotencyKey: key })
  await as.mutation(api.execution.cancel, { sessionId: first.sessionId })

  const again = await confirmAndStart(as, { planId: planned.planId, loadId, idempotencyKey: key })
  expect(again).toMatchObject({ status: 'running' })
  expect(again.sessionId).not.toBe(first.sessionId)
  await expect(confirmAndStart(as, { planId: planned.planId, loadId, idempotencyKey: key })).resolves.toMatchObject({ sessionId: again.sessionId, status: 'running' })
  const sessions = await t.run((ctx) => ctx.db.query('sessions').collect())
  expect(sessions.map((session) => session.status).sort()).toEqual(['cancelled', 'running'])
})

test('a cancelled session saved before keys were released does not block a new Start', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt])
  const loadId = planned.result.loads[0]!.id
  const key = `${planned.planId}:${loadId}`
  const first = await confirmAndStart(as, { planId: planned.planId, loadId, idempotencyKey: key })
  await as.mutation(api.execution.cancel, { sessionId: first.sessionId })
  // Older data: the cancelled session still holds the key.
  await t.run((ctx) => ctx.db.patch(first.sessionId, { idempotencyKey: key }))

  const again = await confirmAndStart(as, { planId: planned.planId, loadId, idempotencyKey: key })
  expect(again).toMatchObject({ status: 'running' })
  expect(again.sessionId).not.toBe(first.sessionId)
  const old = await t.run((ctx) => ctx.db.get(first.sessionId))
  expect(old).toMatchObject({ status: 'cancelled' })
  expect(old!.idempotencyKey).not.toBe(key)
})

test('a start key that already looks released is still released on Cancel, so Start again stays unique', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt])
  const loadId = planned.result.loads[0]!.id
  const key = 'k#cancelled:x'
  const first = await confirmAndStart(as, { planId: planned.planId, loadId, idempotencyKey: key })
  await as.mutation(api.execution.cancel, { sessionId: first.sessionId })

  const again = await confirmAndStart(as, { planId: planned.planId, loadId, idempotencyKey: key })
  expect(again.sessionId).not.toBe(first.sessionId)
  await expect(confirmAndStart(as, { planId: planned.planId, loadId, idempotencyKey: key })).resolves.toMatchObject({ sessionId: again.sessionId, status: 'running' })
})

test('Start, Cancel, Start replayed in order after being offline leaves one cancelled and one running session', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt])
  const loadId = planned.result.loads[0]!.id
  const key = `${planned.planId}:${loadId}`
  const now = Date.now()
  const first = await confirmAndStart(as, { planId: planned.planId, loadId, idempotencyKey: key, at: now - 60_000 })
  await as.mutation(api.execution.cancel, { sessionId: first.sessionId })
  const second = await confirmAndStart(as, { planId: planned.planId, loadId, idempotencyKey: key, at: now - 30_000 })

  const sessions = await t.run((ctx) => ctx.db.query('sessions').collect())
  expect(sessions).toHaveLength(2)
  expect(sessions.find((session) => session._id === first.sessionId)).toMatchObject({ status: 'cancelled' })
  expect(sessions.find((session) => session._id === second.sessionId)).toMatchObject({ status: 'running', idempotencyKey: key })
})

test('a plan made with a pass starts: moved clothes, an answered label question and a product left out round-trip', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await intakeHousehold(as)
  const booster = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Oxi', kind: 'chemical', safety: { bleachKind: 'oxygen', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'oxygen powder', form: 'powder' }, provenance: label('Oxi tub') })
  const softener = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Downy', kind: 'chemical', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'softener', form: 'liquid' }, provenance: label('Downy bottle') })
  const selection = [home.shirt, home.towel]
  const asked = await as.mutation(api.plans.recompute, { householdId: home.householdId, selectedTextileIds: selection, clientInputHash: 'pass', optionalSupplyIds: [booster], excludedSupplyIds: [softener] })
  const [card] = await as.query(api.plans.questions, { planId: asked.planId })
  expect(card).toMatchObject({ kind: 'label_row', key: { subjectId: booster } })

  // The shirt and towel would share a load; the person keeps them apart, and Oxi's label gives no dose for this load.
  const pass = {
    optionalSupplyIds: [booster],
    loadPins: [{ textileId: home.shirt, group: 1 }, { textileId: home.towel, group: 2 }],
    dismissedQuestions: [{ kind: 'label_row' as const, subjectId: booster, context: card!.key.context, answer: 'label_doesnt_say' as const }],
    excludedSupplyIds: [softener],
  }
  const { planId } = await as.mutation(api.plans.recompute, { householdId: home.householdId, selectedTextileIds: selection, clientInputHash: 'pass', ...pass })
  const planned = (await as.query(api.plans.get, { planId }))!
  expect(planned.pass).toEqual({ mode: 'normal', pretreatmentChoices: [], washGoals: ['ordinary'], ...pass })
  expect(planned.result.loads.map((load) => load.textileIds)).toEqual([[home.shirt], [home.towel]])
  expect(planned.loadStates.every((state) => state.startable)).toBe(true)

  const shirtLoad = planned.result.loads[0]!
  const started = await confirmAndStart(as, { planId, loadId: shirtLoad.id, idempotencyKey: 'pass' })
  expect(started.status).toBe('running')
  expect((await steps(t, started.sessionId)).filter((step) => step.kind === 'treatment').map((step) => step.supplyId)).toEqual([home.detergent])
})

test('planning the same garments again keeps an identical plan; a real change replaces it', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await intakeHousehold(as)
  const first = await planFor(as, home.householdId, [home.towel, home.shirt])
  // The same garments in another order are the same selection, so the plan and its hash match.
  const again = await planFor(as, home.householdId, [home.shirt, home.towel])
  expect(again.planId).toBe(first.planId)

  await as.mutation(api.inventory.updateTextile, { textileId: home.towel, bulkUnits: 3 })
  const changed = await planFor(as, home.householdId, [home.shirt, home.towel])
  expect(changed.planId).not.toBe(first.planId)
  expect(await as.query(api.plans.get, { planId: first.planId })).toBeNull()
})

test('a plan a running load came from is kept while it runs, retired when replaced, and released when the load ends', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await intakeHousehold(as)
  const { planned: used, started } = await startLoad(as, home.householdId, [home.shirt], 'kept')
  // Another tap on Plan for the same garments leaves the running load's plan alone.
  expect((await planFor(as, home.householdId, [home.shirt])).planId).toBe(used.planId)

  await as.mutation(api.inventory.updateTextile, { textileId: home.shirt, bulkUnits: 1.5 })
  expect((await as.query(api.plans.get, { planId: used.planId }))?.status).toBe('stale')
  const replacement = await planFor(as, home.householdId, [home.shirt])
  expect((await as.query(api.plans.get, { planId: used.planId }))?.status).toBe('retired')
  // The garment is still in the machine, so the new plan does not offer to start it again.
  expect(replacement.loadStates.every((state) => !state.startable)).toBe(true)

  await as.mutation(api.execution.cancel, { sessionId: started.sessionId })
  expect(await as.query(api.plans.get, { planId: used.planId })).toBeNull()
  expect(await t.run(async (ctx) => (await ctx.db.query('plans').collect()).length)).toBe(1)
})

test('on a locked-door washer every product is recorded before the machine can start', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, applianceType: 'front_load_washer' })
  const { started } = await startLoad(as, home.householdId, [home.shirt])
  const tide = (await steps(t, started.sessionId)).find((step) => step.kind === 'treatment')!
  for (const step of (await steps(t, started.sessionId)).filter((entry) => entry.kind === 'task' && entry.task !== 'start')) {
    await as.mutation(api.actions.recordAction, { sessionId: started.sessionId, actionId: step.id, status: 'confirmed' })
  }
  await expect(as.mutation(api.actions.recordAction, { sessionId: started.sessionId, actionId: (await steps(t, started.sessionId)).find((step) => step.kind === 'task' && step.task === 'start')!.id, status: 'confirmed' })).rejects.toThrow('Record every step')
  await as.mutation(api.actions.recordAction, { sessionId: started.sessionId, actionId: tide.id, status: 'skipped' })
  await as.mutation(api.actions.recordAction, { sessionId: started.sessionId, actionId: (await steps(t, started.sessionId)).find((step) => step.kind === 'task' && step.task === 'start')!.id, status: 'confirmed' })
  expect((await as.query(api.execution.sessionDetail, { sessionId: started.sessionId })).machineStartedAt).not.toBeNull()
})

/**
 * The intake household on an HE washer with two products whose labels go by load size: Sized, a cap
 * with lines for small and medium loads only, in the drawer; and Twin, whose label has two lines that
 * disagree for a large load and none for the rest, added with the clothes. The old detergent is put away.
 */
async function sizedHousehold(as: Caller) {
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, highEfficiency: true })
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, archived: true })
  const product = (name: string, use: 'detergent' | 'booster' = 'detergent') => as.mutation(api.inventory.createSupply, { householdId: home.householdId, name, kind: 'chemical', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, use, formulation: { name: 'HE liquid', form: 'liquid' }, measure: capMeasure, provenance: label(`${name} bottle`) })
  const sized = await product('Sized')
  await as.mutation(api.inventory.saveLabelDirections, {
    supplyId: sized, measure: capMeasure, stage: 'wash', placement: 'detergent_compartment', timing: 'before starting',
    rows: [{ loadSizes: ['small'], cells: [{ amount: 1, unit: 'cap', mark: '1' }] }, { loadSizes: ['medium'], cells: [{ amount: 1, unit: 'cap', mark: '3' }] }],
    provenance: label('Sized bottle'),
  })
  // A load takes one detergent, so the second product is an add-in.
  const twin = await product('Twin', 'booster')
  const twinRules: Id<'rules'>[] = []
  for (const mark of ['1', '3']) {
    twinRules.push(await as.mutation(api.inventory.saveRule, { supplyId: twin, dose: { amount: 1, unit: 'cap', mark }, stage: 'wash', placement: 'direct_to_drum', timing: 'with the clothes, before starting', conditions: { loadSizes: ['large'] }, provenance: label('Twin bottle') }))
  }
  return { ...home, sized, twin, twinRules }
}

const taskId = (timeline: Awaited<ReturnType<typeof steps>>, name: string) => timeline.find((step) => step.kind === 'task' && step.task === name)!.id
const productStep = (timeline: Awaited<ReturnType<typeof steps>>, supplyId: string) => timeline.find((step) => step.kind === 'treatment' && step.supplyId === supplyId)!

test('the timeline asks how full the drum is right after loading, only when a dose goes by it', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await sizedHousehold(as)
  const { planned, started } = await startLoad(as, home.householdId, [home.shirt], 'once', [home.twin])
  expect(planned.status).toBe('ready')
  const timeline = await steps(t, started.sessionId)
  expect(timeline.map((step) => (step.kind === 'task' ? step.task : step.phase))).toEqual(['load', 'drum_fullness', 'with_load', 'close', 'dispenser', 'start'])
  expect(timeline[1]).toMatchObject({ title: 'How full is the drum?', status: 'pending' })
  expect(productStep(timeline, home.sized)).toMatchObject({
    dose: { amount: 0, unit: 'at_machine' },
    atMachine: { machine: 'washer', context: { washerClassKnown: true, machineClasses: ['top_load_washer', 'he'] }, candidates: [expect.objectContaining({ size: 'small' }), expect.objectContaining({ size: 'medium' })] },
  })
  expect(productStep(timeline, home.twin)).toMatchObject({ dose: { amount: 0, unit: 'at_machine' }, atMachine: { machine: 'washer', candidates: [] } })
  // Without the sized products every dose is known now, and nothing asks.
  for (const supplyId of [home.sized, home.twin]) await as.mutation(api.inventory.updateSupply, { supplyId, archived: true })
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, archived: false })
  const known = await startLoad(as, home.householdId, [home.towel], 'known')
  expect((await steps(t, known.started.sessionId)).map((step) => step.phase)).toEqual(['load', 'close', 'dispenser', 'start'])
  await expect(as.mutation(api.execution.recordDrumFullness, { sessionId: known.started.sessionId, machine: 'washer', size: 'small' })).rejects.toThrow('Nothing in this load goes by how full the drum is')
})

test('how full the drum is doses each step from its label line for that size, asks for a missing or disputed line, and is settled before Start', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await sizedHousehold(as)
  const { started } = await startLoad(as, home.householdId, [home.shirt], 'once', [home.twin])
  const sessionId = started.sessionId
  const timeline = await steps(t, sessionId)
  const sized = productStep(timeline, home.sized).id
  const twin = productStep(timeline, home.twin).id
  const fullness = (size: 'small' | 'medium' | 'large' | 'extra_large') => as.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size })
  const record = (actionId: string, status: 'confirmed' | 'skipped' = 'confirmed') => as.mutation(api.actions.recordAction, { sessionId, actionId, status })

  await expect(fullness('small')).rejects.toThrow('Put the clothes in the drum first')
  await expect(record(taskId(timeline, 'drum_fullness'))).rejects.toThrow('Pick how full the drum is first')
  await record(taskId(timeline, 'load'))

  // Small: Sized has its line; Twin has none for a small load, asked for this load's HE washer.
  await expect(fullness('small')).resolves.toEqual({ steps: [
    { actionId: twin, status: 'label_row_needed', supplyId: home.twin, context: { loadSize: 'small', washerClass: 'he' } },
    { actionId: sized, status: 'resolved' },
  ] })
  expect(productStep(await steps(t, sessionId), home.sized)).toMatchObject({ dose: { amount: 1, unit: 'cap', mark: '1', marks: ['1', '3', '5'] }, atMachine: { resolvedSize: 'small' } })
  expect(await steps(t, sessionId)).toEqual(expect.arrayContaining([expect.objectContaining({ id: taskId(timeline, 'drum_fullness'), status: 'confirmed' })]))

  // Picked again before Start: Sized has no large line any more and waits again; Twin's two lines both fit.
  await expect(fullness('large')).resolves.toEqual({ steps: [
    { actionId: twin, status: 'conflicting_rows', supplyId: home.twin, context: { loadSize: 'large', washerClass: 'he' }, rows: [
      { ruleId: home.twinRules[0], row: null, rowText: null, dose: { amount: 1, unit: 'cap', mark: '1' } },
      { ruleId: home.twinRules[1], row: null, rowText: null, dose: { amount: 1, unit: 'cap', mark: '3' } },
    ] },
    { actionId: sized, status: 'label_row_needed', supplyId: home.sized, context: { loadSize: 'large', washerClass: 'he' } },
  ] })
  const waiting = productStep(await steps(t, sessionId), home.sized)
  expect(waiting.kind === 'treatment' && waiting.dose).toEqual({ amount: 0, unit: 'at_machine' })
  expect(waiting.kind === 'treatment' && waiting.atMachine?.resolvedSize).toBeUndefined()
  expect((await t.run((ctx) => ctx.db.get(sessionId)))!.drumFullness).toBe('large')

  // The person reads the label: a line for this load, and which of Twin's lines they use. Both are settled.
  await as.mutation(api.inventory.answerLabelRow, { supplyId: home.sized, context: { loadSize: 'large', washerClass: 'he' }, dose: { amount: 1, unit: 'cap', mark: '5' }, rowText: 'Large load' })
  await as.mutation(api.inventory.answerLabelRow, { supplyId: home.twin, context: { loadSize: 'large', washerClass: 'he' }, dose: { amount: 1, unit: 'cap', mark: '3' } })
  await expect(fullness('large')).resolves.toEqual({ steps: [{ actionId: twin, status: 'resolved' }, { actionId: sized, status: 'resolved' }] })
  const settled = await steps(t, sessionId)
  expect(productStep(settled, home.sized)).toMatchObject({ dose: { amount: 1, unit: 'cap', mark: '5' }, atMachine: { resolvedSize: 'large', lineText: 'Large load' } })
  expect(productStep(settled, home.twin)).toMatchObject({ dose: { amount: 1, unit: 'cap', mark: '3' }, atMachine: { resolvedSize: 'large' } })
  expect(productStep(settled, home.twin)).not.toHaveProperty('atMachine.lineText')
  expect((await t.run((ctx) => ctx.db.query('history').collect())).filter((event) => event.actionId === taskId(timeline, 'drum_fullness'))).toHaveLength(1)

  for (const step of settled.filter((entry) => entry.status === 'pending')) {
    await as.mutation(api.actions.recordAction, step.kind === 'task'
      ? { sessionId, actionId: step.id, status: 'confirmed' }
      : { sessionId, actionId: step.id, status: 'confirmed', usage: { supplyId: step.supplyId as Id<'supplies'>, amount: step.dose.amount, unit: step.dose.unit, ...(step.dose.mark === undefined ? {} : { mark: step.dose.mark }), placement: step.placement } })
  }
  expect((await as.query(api.execution.sessionDetail, { sessionId })).machineStartedAt).not.toBeNull()
  // Starting rebuilds the steps from the plan; the doses given at the machine are kept.
  expect(productStep(await steps(t, sessionId), home.sized)).toMatchObject({ status: 'confirmed', dose: { amount: 1, unit: 'cap', mark: '5' }, atMachine: { lineText: 'Large load' } })
  await expect(fullness('small')).rejects.toThrow('already started')
  expect(await t.run((ctx) => ctx.db.query('usage').collect())).toEqual(expect.arrayContaining([expect.objectContaining({ supplyId: home.sized, amount: 1, unit: 'cap' })]))
  await expect(signedIn(t, 'outsider').mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'small' })).rejects.toThrow('Forbidden')
  // Lines answered at the machine re-read the plan in place; finishing sends the plan as it is now.
  await as.mutation(api.sessions.complete, { sessionId, planInputHash: (await as.query(api.execution.sessionDetail, { sessionId })).planInputHash!, idempotencyKey: 'once' })
  await expect(fullness('small')).rejects.toThrow('not running')
})

test('soft water is kept on a step dosed at the machine, and a drum-fullness pick still reads its line', async () => {
  // EBMUD's 2025 report stops counting after 2026, so the clock is pinned.
  vi.setSystemTime(Date.UTC(2026, 9, 6))
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await sizedHousehold(as)
  await as.mutation(api.inventory.setWater, { householdId: home.householdId, water: { zip: '94596', utility: 'ebmud', area: 'walnut_creek', source: 'lookup' } })
  const { started } = await startLoad(as, home.householdId, [home.shirt], 'soft', [home.twin])
  const sessionId = started.sessionId
  const timeline = await steps(t, sessionId)
  expect(productStep(timeline, home.sized)).toMatchObject({ atMachine: { context: { waterCondition: 'soft' } } })
  await as.mutation(api.actions.recordAction, { sessionId, actionId: taskId(timeline, 'load'), status: 'confirmed' })
  await as.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'small' })
  expect(productStep(await steps(t, sessionId), home.sized)).toMatchObject({ dose: { amount: 1, unit: 'cap', mark: '1' }, atMachine: { resolvedSize: 'small', context: { waterCondition: 'soft' } } })
})

/** The intake household on a washer with no drawer slot, dosing with pods whose label goes by load size. */
async function podHousehold(as: Caller) {
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, archived: true })
  const pods = await as.mutation(api.inventory.createSupply, {
    householdId: home.householdId, name: 'Tide pods', use: 'pods', kind: 'single_use', formulation: { name: 'Tide pods', form: 'pod' }, measure: { kind: 'count', countUnit: 'pod' }, provenance: { source: 'label_taps', confidence: 'observed' },
    safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] },
  })
  await as.mutation(api.inventory.answerLabelRow, { supplyId: pods, context: { loadSize: 'small' }, dose: { amount: 1, unit: 'pod' }, rowText: 'Small load' })
  await as.mutation(api.inventory.answerLabelRow, { supplyId: pods, context: { loadSize: 'large' }, dose: { amount: 2, unit: 'pod' }, rowText: 'Large load' })
  return { ...home, pods }
}

test('pods that go in the empty drum are dosed from the estimate of the pile, which answers how full the drum is', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await podHousehold(as)
  const { planned, started } = await startLoad(as, home.householdId, [home.shirt])
  expect(planned.status).toBe('ready')
  const sessionId = started.sessionId
  const timeline = await steps(t, sessionId)
  expect(timeline.map((step) => (step.kind === 'task' ? step.task : step.phase))).toEqual(['drum', 'load', 'drum_fullness', 'close', 'start'])
  const pods = productStep(timeline, home.pods)
  expect(pods).toMatchObject({ atMachine: { machine: 'washer', candidates: [
    expect.objectContaining({ size: 'small', rowText: 'Small load' }),
    expect.objectContaining({ size: 'large', rowText: 'Large load' }),
  ] } })

  // Before the clothes go in, the person's estimate of the pile is the drum's fullness.
  await expect(as.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'large' })).resolves.toEqual({ steps: [{ actionId: pods.id, status: 'resolved' }] })
  const estimated = await steps(t, sessionId)
  expect(productStep(estimated, home.pods)).toMatchObject({ status: 'pending', dose: { amount: 2, unit: 'pod' }, atMachine: { resolvedSize: 'large', lineText: 'Large load' } })
  expect(estimated.find((step) => step.id === taskId(timeline, 'drum_fullness'))).toMatchObject({ status: 'confirmed' })
  expect((await as.query(api.execution.sessionDetail, { sessionId })).drumFullness).toBe('large')

  // The later "How full is the drum?" is already answered: the pods, the clothes, the door, Start.
  await as.mutation(api.actions.recordAction, { sessionId, actionId: pods.id, status: 'confirmed', usage: { supplyId: home.pods, amount: 2, unit: 'pod', placement: 'direct_to_drum' } })
  for (const name of ['load', 'close', 'start']) await as.mutation(api.actions.recordAction, { sessionId, actionId: taskId(timeline, name), status: 'confirmed' })
  expect((await as.query(api.execution.sessionDetail, { sessionId })).machineStartedAt).not.toBeNull()
})

test('only pods in the empty drum are asked about before loading; other steps wait for the clothes', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await sizedHousehold(as)
  const { started } = await startLoad(as, home.householdId, [home.shirt])
  await expect(as.mutation(api.execution.recordDrumFullness, { sessionId: started.sessionId, machine: 'washer', size: 'small' })).rejects.toThrow('Put the clothes in the drum first')
  expect((await as.query(api.execution.sessionDetail, { sessionId: started.sessionId })).drumFullness).toBeNull()
})

test('a label that splits by the washer logo asks about the washer at the machine, and reads the answer when picked again', async () => {
  const t = newBackend()
  const as = signedIn(t, 'execution-user')
  const home = await sizedHousehold(as)
  // The washer's logo was never recorded; the label's large line is added mid-load, one for each kind of washer.
  await t.run(async (ctx) => ctx.db.patch(home.machine, { highEfficiency: undefined }))
  await as.mutation(api.inventory.updateSupply, { supplyId: home.twin, archived: true })
  const { started } = await startLoad(as, home.householdId, [home.shirt])
  const sessionId = started.sessionId
  const timeline = await steps(t, sessionId)
  const sized = productStep(timeline, home.sized)
  expect(sized).toMatchObject({ atMachine: { context: { washerClassKnown: false } } })
  await as.mutation(api.actions.recordAction, { sessionId, actionId: taskId(timeline, 'load'), status: 'confirmed' })
  await as.mutation(api.inventory.answerLabelRow, { supplyId: home.sized, context: { loadSize: 'large', washerClass: 'he' }, dose: { amount: 1, unit: 'cap', mark: '5' } })
  await as.mutation(api.inventory.answerLabelRow, { supplyId: home.sized, context: { loadSize: 'large', washerClass: 'standard' }, dose: { amount: 1, unit: 'cap', mark: '3' } })

  const fullness = () => as.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'large' })
  await expect(fullness()).resolves.toEqual({ steps: [{ actionId: sized.id, status: 'needs_input', supplyId: home.sized, missing: 'washer_class', machineId: home.machine }] })
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, highEfficiency: true })
  await expect(fullness()).resolves.toEqual({ steps: [{ actionId: sized.id, status: 'resolved' }] })
  expect(productStep(await steps(t, sessionId), home.sized)).toMatchObject({
    dose: { amount: 1, unit: 'cap', mark: '5' },
    atMachine: { resolvedSize: 'large', context: { washerClassKnown: true, machineClasses: ['top_load_washer', 'he'] } },
  })
})

/**
 * A shared room with two kinds of washer, as in the owner's building: lid top-loaders (standard, no
 * drawer, 47 minutes) and HE front-loaders (drawer, door locks, 35 minutes), the front-loaders
 * preferred. The cap detergent's lines split by HE and standard and by how full the drum is; the
 * sanitizer goes in the rinse. With `delicate`, the garments need a cycle only the front-loaders have.
 */
async function mixedRoom(t: Backend, as: Caller, options: { delicate?: boolean; dryer?: boolean; before?: (householdId: Id<'households'>, lysol: Id<'supplies'>) => Promise<Id<'supplies'>[] | void> } = {}) {
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Building', displayName: 'Pat' })
  const cycle = options.delicate === true ? 'delicate' : 'normal'
  const shared = { householdId, location: 'shared' as const, pricePerStart: 2, capacityConfidence: 'verified' as const, provenance: label('washer plate') }
  const tops = await as.mutation(api.inventory.createMachines, { ...shared, name: 'Top-loader', count: 3, model: 'SWNNX2HP115TW01', applianceType: 'top_load_washer', highEfficiency: false, capacityUnits: 11.5, supportedCycles: ['normal'], placements: ['direct_to_drum'], cycleMinutes: { normal: 47 } })
  const fronts = await as.mutation(api.inventory.createMachines, { ...shared, name: 'Front-loader', count: 2, model: 'SFNNXRSP115TW07', applianceType: 'front_load_washer', highEfficiency: true, capacityUnits: 13.5, supportedCycles: ['normal', 'delicate'], placements: ['detergent_compartment', 'bleach_compartment', 'softener_compartment', 'direct_to_drum'], cycleMinutes: { normal: 35, delicate: 35 } })
  const home = await as.mutation(api.inventory.createMachine, { householdId, name: 'Washer at home', applianceType: 'top_load_washer', highEfficiency: false, capacityUnits: 8, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['direct_to_drum'], location: 'home', provenance: label('plate') })
  for (const machineId of [...tops, ...fronts, home]) {
    const contact = { minutes: 16, source: 'Synthetic program observation', placement: fronts.includes(machineId) ? 'softener_compartment' : 'direct_to_drum', timing: 'at the start of the rinse' }
    await as.mutation(api.inventory.updateMachine, { machineId, rinseContact: { normal: contact, delicate: contact } })
  }
  await as.mutation(api.inventory.updateMachine, { machineId: tops[2]!, archived: true })
  const dryer = options.dryer === true ? await addDryer(as, householdId) : null
  await t.run(async (ctx) => ctx.db.patch(householdId, { planning: { colorPolicy: 'separate_first_wash', optimization: 'protect_clothes', currency: 'USD', washerPricePerStart: 2, preferredMachineId: fronts[0]! } }))
  const detergent = await capDetergent(as, householdId)
  const lysol = await as.mutation(api.inventory.createSupply, { householdId, name: 'Lysol Laundry Sanitizer', kind: 'chemical', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [], sanitizing: { route: 'rinse', minimumContactMinutes: 16, formulation: 'Synthetic placement-test pack', source: 'Synthetic label' } }, use: 'rinse_sanitizer', formulation: { name: 'laundry sanitizer', form: 'liquid' }, provenance: label('Lysol bottle') })
  await as.mutation(api.inventory.saveRule, { supplyId: lysol, dose: { amount: 60, unit: 'ml' }, stage: 'rinse', placement: 'softener_compartment', timing: 'before starting', provenance: label('Lysol bottle') })
  const tee = await as.mutation(api.inventory.createTextile, { householdId, name: 'Tee', color: 'White', colorGroup: 'light', firstWash: false })
  if (options.dryer === true) await dryingCare(as, tee, 'tumble_dry', 'low')
  else await as.mutation(api.inventory.setCare, { textileId: tee, material: 'cotton', washMethod: 'machine', cycle, maxTemperatureC: 40, restrictions: [], provenance: label('care label') })
  const optionalSupplyIds = await options.before?.(householdId, lysol) ?? [lysol]
  const planned = await planFor(as, householdId, [tee], { optionalSupplyIds })
  const load = planned.result.loads[0]!
  const alternate = load.alternates![0]!
  // A top-loader that is not the one standing for its kind: the steps still come from its kind.
  const topLoader2 = alternate.machineIds.find((id) => id !== alternate.machineId)! as Id<'machines'>
  return { householdId, tops, fronts, home, dryer, detergent, lysol, tee, planned, load, alternate, topLoader2 }
}

const startOn = (as: Caller, room: Awaited<ReturnType<typeof mixedRoom>>, machineId: Id<'machines'>, key = 'room', extra: { numberSkipped?: boolean; loadName?: string; loadNumber?: number; loadCount?: number } = {}) =>
  confirmAndStart(as, { planId: room.planned.planId, loadId: room.load.id, idempotencyKey: key, startedAt: 1_000_000, machineId, ...extra })

test('in a mixed room, a load planned for a front-loader starts on a top-loader with the top-loader steps', async () => {
  const t = newBackend()
  const as = signedIn(t, 'room-user')
  const room = await mixedRoom(t, as)
  expect(room.load.machineId).toBe(room.fronts[0])
  expect(room.load.roomMachineIds).toEqual([...room.fronts].sort())
  expect(room.alternate).toMatchObject({ status: 'ready', washerClass: 'standard', machineIds: [room.tops[0], room.tops[1]].sort() })

  const started = await startOn(as, room, room.topLoader2)
  const sessionId = started.sessionId
  const timeline = await steps(t, sessionId)
  expect(await t.run(async (ctx) => (await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique())!.machineId)).toBe(room.topLoader2)
  // Detergent into the empty tub first, read for a standard washer; the sanitizer waits for the rinse.
  expect(timeline[0]).toMatchObject({ kind: 'treatment', supplyId: room.detergent, phase: 'drum', placement: 'direct_to_drum', atMachine: { context: { machineClasses: expect.arrayContaining(['standard']) } } })
  expect(productStep(timeline, room.lysol)).toMatchObject({ phase: 'cycle', placement: 'direct_to_drum', stage: 'rinse' })
  expect(timeline.find((step) => step.kind === 'task' && step.task === 'close')).toMatchObject({ title: 'Close the lid' })

  // The standard column's line: small and medium loads take the cap to line 3.
  await as.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'medium' })
  expect(productStep(await steps(t, sessionId), room.detergent)).toMatchObject({ dose: { amount: 1, unit: 'cap', mark: '3' } })

  for (;;) {
    const step = (await steps(t, sessionId)).find((entry) => entry.status === 'pending' && entry.phase !== 'cycle')
    if (step === undefined) break
    await as.mutation(api.actions.recordAction, step.kind === 'task'
      ? { sessionId, actionId: step.id, status: 'confirmed' }
      : { sessionId, actionId: step.id, status: 'confirmed', usage: { supplyId: step.supplyId as Id<'supplies'>, amount: step.dose.amount, unit: step.dose.unit, placement: step.placement } })
    if (step.kind === 'task' && step.task === 'start') break
  }
  const detail = await as.query(api.execution.sessionDetail, { sessionId })
  expect(detail.machineStartedAt).not.toBeNull()
  // A stage name is not a clock time. The recorded rinse instruction requires watching the washer.
  const rinse = productStep(await steps(t, sessionId), room.lysol)
  expect(rinse).toMatchObject({ phase: 'cycle', placement: 'direct_to_drum', offsetMinutes: null })
  expect(rinse.kind === 'treatment' && rinse.dueAt).toBeUndefined()
  expect(detail.estimatedFinishAt).toBe(detail.machineStartedAt! + 47 * 60_000)

  // Correcting the start on another top-loader keeps its steps; a front-loader takes different ones.
  const otherTop = [room.tops[0], room.tops[1]].find((id) => id !== room.topLoader2)!
  await as.mutation(api.execution.reschedule, { sessionId, startedAt: 2_000_000, machineId: otherTop })
  const correctedRinse = productStep(await steps(t, sessionId), room.lysol)
  expect(correctedRinse).toMatchObject({ placement: 'direct_to_drum', offsetMinutes: null })
  expect(correctedRinse.kind === 'treatment' && correctedRinse.dueAt).toBeUndefined()
  await expect(as.mutation(api.execution.reschedule, { sessionId, startedAt: 2_000_000, machineId: room.fronts[1]! }))
    .rejects.toThrow('That washer takes different steps: cancel this load and start it again there')
})

test('in a mixed room, drying after a top-loader keeps the top-loader steps', async () => {
  const t = newBackend()
  const as = signedIn(t, 'room-user')
  const room = await mixedRoom(t, as, { dryer: true })
  expect(room.load.drying?.status).toBe('ready')
  const { sessionId } = await startOn(as, room, room.topLoader2)
  await finishSteps(as, sessionId)
  const timeline = await steps(t, sessionId)
  expect(timeline.some((step) => step.kind === 'task' && step.task === 'dryer_start' && step.status === 'confirmed')).toBe(true)
  expect(productStep(timeline, room.detergent)).toMatchObject({ phase: 'drum', placement: 'direct_to_drum' })
  expect(productStep(timeline, room.lysol)).toMatchObject({ phase: 'cycle', placement: 'direct_to_drum' })
})

test('in a mixed room, a start on the front-loaders takes the same steps with or without a picked washer', async () => {
  const t = newBackend()
  const as = signedIn(t, 'room-user')
  const room = await mixedRoom(t, as)
  const picked = await startOn(as, room, room.fronts[0]!, 'picked')
  const withPick = await steps(t, picked.sessionId)
  await as.mutation(api.execution.cancel, { sessionId: picked.sessionId })
  const plain = await confirmAndStart(as, { planId: room.planned.planId, loadId: room.load.id, idempotencyKey: 'plain', startedAt: 1_000_000 })
  expect(await steps(t, plain.sessionId)).toEqual(withPick)
  expect(productStep(withPick, room.detergent)).toMatchObject({ placement: 'detergent_compartment' })
  expect(productStep(withPick, room.lysol)).toMatchObject({ placement: 'softener_compartment', phase: 'dispenser' })
})

test('in a mixed room, a dryer, an archived washer, and a washer elsewhere are refused', async () => {
  const t = newBackend()
  const as = signedIn(t, 'room-user')
  const room = await mixedRoom(t, as, { dryer: true })
  await expect(startOn(as, room, room.dryer!)).rejects.toThrow('Pick one of the washers in this room')
  await expect(startOn(as, room, room.tops[2]!)).rejects.toThrow('Pick one of the washers in this room')
  await expect(startOn(as, room, room.home)).rejects.toThrow('Pick one of the washers in this room')
  expect(await t.run((ctx) => ctx.db.query('sessions').collect())).toHaveLength(0)
})

test('in a mixed room, a kind that cannot take the load is refused, and the same tap on a front-loader starts', async () => {
  const t = newBackend()
  const as = signedIn(t, 'room-user')
  const room = await mixedRoom(t, as, { delicate: true })
  expect(room.alternate).toMatchObject({ status: 'blocked', problems: [{ cause: 'unsupported_machine_cycle' }] })
  await expect(startOn(as, room, room.topLoader2, 'tap')).rejects.toThrow("That washer can't take this load")
  expect(await t.run((ctx) => ctx.db.query('sessions').collect())).toHaveLength(0)
  const started = await startOn(as, room, room.fronts[1]!, 'tap')
  expect(started.status).toBe('running')
})

test('in a mixed room, "No number on it?" keeps that the washer number is unknown', async () => {
  const t = newBackend()
  const as = signedIn(t, 'room-user')
  const room = await mixedRoom(t, as)
  const skipped = await startOn(as, room, room.alternate.machineId as Id<'machines'>, 'skip', { numberSkipped: true })
  expect(await t.run((ctx) => ctx.db.get(skipped.sessionId))).toMatchObject({ washerNumberUnknown: true })
  await as.mutation(api.execution.cancel, { sessionId: skipped.sessionId })
  const numbered = await startOn(as, room, room.topLoader2, 'numbered')
  expect(await t.run((ctx) => ctx.db.get(numbered.sessionId))).not.toHaveProperty('washerNumberUnknown')
})

test('a start keeps the load\'s name, number and the day\'s load count, and refuses a bad name', async () => {
  const t = newBackend()
  const as = signedIn(t, 'room-user')
  const room = await mixedRoom(t, as)
  await expect(startOn(as, room, room.alternate.machineId as Id<'machines'>, 'blank', { loadName: '  ' })).rejects.toThrow()
  const started = await startOn(as, room, room.alternate.machineId as Id<'machines'>, 'named', { loadName: ' Whites ', loadNumber: 1, loadCount: 3 })
  expect(await t.run((ctx) => ctx.db.get(started.sessionId))).toMatchObject({ loadName: 'Whites', loadNumber: 1, loadCount: 3 })
  expect(await as.query(api.execution.sessionDetail, { sessionId: started.sessionId })).toMatchObject({ loadName: 'Whites', loadNumber: 1, loadCount: 3, putAwayAt: null })
  await as.mutation(api.execution.cancel, { sessionId: started.sessionId })
  const plain = await startOn(as, room, room.topLoader2, 'plain')
  expect(await as.query(api.execution.sessionDetail, { sessionId: plain.sessionId })).toMatchObject({ loadName: null, loadNumber: null, loadCount: null })
})

test('in a mixed room, a load the front-loaders cannot run still starts on a top-loader that can', async () => {
  const t = newBackend()
  const as = signedIn(t, 'room-user')
  // A rinse aid poured by hand at the start of the rinse, in place of the sanitizer: a front-loader's door is locked by then.
  const room = await mixedRoom(t, as, {
    before: async (householdId, lysol) => {
      await as.mutation(api.inventory.updateSupply, { supplyId: lysol, archived: true })
      const rinseAid = await as.mutation(api.inventory.createSupply, { householdId, name: 'Rinse aid', kind: 'chemical', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'rinse aid', form: 'liquid' }, provenance: label('bottle') })
      await as.mutation(api.inventory.saveRule, { supplyId: rinseAid, dose: { amount: 60, unit: 'ml' }, stage: 'rinse', placement: 'direct_to_drum', timing: 'at the start of the rinse', provenance: label('bottle') })
      return [rinseAid]
    },
  })
  expect(room.load.status).toBe('needs_confirmation')
  expect(room.alternate).toMatchObject({ status: 'ready' })
  await expect(confirmAndStart(as, { planId: room.planned.planId, loadId: room.load.id, idempotencyKey: 'plain', startedAt: 1_000_000 })).rejects.toThrow('Load needs confirmation')
  await expect(startOn(as, room, room.fronts[1]!, 'front')).rejects.toThrow('Load needs confirmation')
  expect(await startOn(as, room, room.topLoader2, 'top')).toMatchObject({ status: 'running' })
})

test('in a mixed room, a question for the whole household still stops a top-loader start', async () => {
  const t = newBackend()
  const as = signedIn(t, 'room-user')
  const room = await mixedRoom(t, as, {
    before: async (householdId) => [await as.mutation(api.inventory.createSupply, { householdId, name: 'Unread bottle', kind: 'chemical', formulation: { name: 'detergent', form: 'liquid' }, provenance: { source: 'not read yet', confidence: 'unknown' } })],
  })
  expect(room.planned.result.reasons.some((reason) => reason.code === 'needs_confirmation' && reason.textileIds.length === 0)).toBe(true)
  await expect(startOn(as, room, room.topLoader2)).rejects.toThrow("That washer can't take this load")
})

test('in a mixed room, a plan lists every washer the load may start on: both kinds when both can take it, else only the kind that can', async () => {
  const t = newBackend()
  const as = signedIn(t, 'room-user')
  const room = await mixedRoom(t, as)
  const state = (await as.query(api.plans.get, { planId: room.planned.planId }))!.loadStates[0]!
  expect(state.startable).toBe(true)
  expect([...state.startableMachineIds].sort()).toEqual([room.fronts[0], room.fronts[1], room.tops[0], room.tops[1]].sort())
  expect((await as.query(api.plans.upNext, { householdId: room.householdId }))!.loads[0]!.startableMachineIds).toEqual(state.startableMachineIds)

  // Once the load has a session it starts nowhere else.
  await startOn(as, room, room.topLoader2)
  const started = (await as.query(api.plans.get, { planId: room.planned.planId }))!.loadStates[0]!
  expect(started).toMatchObject({ startable: false, startableMachineIds: [] })

  const other = signedIn(t, 'delicate-room-user')
  const blockedRoom = await mixedRoom(t, other, { delicate: true })
  const blocked = (await other.query(api.plans.get, { planId: blockedRoom.planned.planId }))!.loadStates[0]!
  expect(blocked.startable).toBe(true)
  expect([...blocked.startableMachineIds].sort()).toEqual([...blockedRoom.fronts].sort())
})

test('in a mixed room, a start with its number skipped is listed by the kind of washer, a numbered one by its name', async () => {
  const t = newBackend()
  const as = signedIn(t, 'room-user')
  const room = await mixedRoom(t, as)
  const skipped = await startOn(as, room, room.alternate.machineId as Id<'machines'>, 'skip', { numberSkipped: true })
  expect((await as.query(api.execution.sessionDetail, { sessionId: skipped.sessionId })).machineName).toBe('a top-loader')
  expect((await as.query(api.execution.householdSessions, { householdId: room.householdId })).find((row) => row.sessionId === skipped.sessionId)!.machineName).toBe('a top-loader')
  await as.mutation(api.execution.cancel, { sessionId: skipped.sessionId })

  const numbered = await startOn(as, room, room.topLoader2, 'numbered')
  expect((await as.query(api.execution.sessionDetail, { sessionId: numbered.sessionId })).machineName).toBe('Top-loader 2')
  expect((await as.query(api.execution.householdSessions, { householdId: room.householdId })).find((row) => row.sessionId === numbered.sessionId)!.machineName).toBe('Top-loader 2')
})

test('in a mixed room, a load only a top-loader can run is not startable on its planned front-loader, but lists the top-loaders', async () => {
  const t = newBackend()
  const as = signedIn(t, 'room-user')
  const room = await mixedRoom(t, as, {
    before: async (householdId, lysol) => {
      await as.mutation(api.inventory.updateSupply, { supplyId: lysol, archived: true })
      const rinseAid = await as.mutation(api.inventory.createSupply, { householdId, name: 'Rinse aid', kind: 'chemical', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'rinse aid', form: 'liquid' }, provenance: label('bottle') })
      await as.mutation(api.inventory.saveRule, { supplyId: rinseAid, dose: { amount: 60, unit: 'ml' }, stage: 'rinse', placement: 'direct_to_drum', timing: 'at the start of the rinse', provenance: label('bottle') })
      return [rinseAid]
    },
  })
  expect(room.load.status).toBe('needs_confirmation')
  const state = (await as.query(api.plans.get, { planId: room.planned.planId }))!.loadStates[0]!
  // "Start" still means the planned washer, so its question stays in view.
  expect(state.startable).toBe(false)
  expect([...state.startableMachineIds].sort()).toEqual([room.tops[0], room.tops[1]].sort())
  const next = (await as.query(api.plans.upNext, { householdId: room.householdId }))!.loads[0]!
  expect(next).toMatchObject({ startable: false, startableMachineIds: state.startableMachineIds })
})

test('in a room where only one kind could be planned, a washer of the other kind is refused, and siblings of the planned kind are listed', async () => {
  const t = newBackend()
  const as = signedIn(t, 'room-user')
  const room = await mixedRoom(t, as)
  // The top-loaders are out of order when the pass is planned: the load has no top-loader steps.
  await t.run(async (ctx) => { for (const id of room.tops) await ctx.db.patch(id, { pool: 'offline' }) })
  const planned = await planFor(as, room.householdId, [room.tee])
  const load = planned.result.loads[0]!
  expect(load.alternates).toBeUndefined()
  expect(load.roomMachineIds).toBeUndefined()
  const state = (await as.query(api.plans.get, { planId: planned.planId }))!.loadStates[0]!
  expect([...state.startableMachineIds].sort()).toEqual([...room.fronts].sort())

  const startAt = (machineId: Id<'machines'>, key: string) =>
    confirmAndStart(as, { planId: planned.planId, loadId: load.id, idempotencyKey: key, startedAt: 1_000_000, machineId })
  await expect(startAt(room.topLoader2, 'top')).rejects.toThrow('This load has no steps for that washer')
  expect(await t.run((ctx) => ctx.db.query('sessions').collect())).toHaveLength(0)
  expect(await startAt(room.fronts[1]!, 'front')).toMatchObject({ status: 'running' })
})

test('in a mixed room, naming the washer when correcting a skipped-number start lists it by its name', async () => {
  const t = newBackend()
  const as = signedIn(t, 'room-user')
  const room = await mixedRoom(t, as)
  const { sessionId } = await startOn(as, room, room.alternate.machineId as Id<'machines'>, 'skip', { numberSkipped: true })
  await t.run((ctx) => ctx.db.patch(sessionId, { machineStartedAt: 1_000_000 }))
  expect((await as.query(api.execution.sessionDetail, { sessionId })).machineName).toBe('a top-loader')
  await as.mutation(api.execution.reschedule, { sessionId, startedAt: 2_000_000, machineId: room.topLoader2 })
  expect(await t.run((ctx) => ctx.db.get(sessionId))).not.toHaveProperty('washerNumberUnknown')
  expect((await as.query(api.execution.sessionDetail, { sessionId })).machineName).toBe('Top-loader 2')
})

test('Start refuses a load whose recipe was not confirmed, or was confirmed for another washer', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recipe-guard')
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt])
  const loadId = planned.result.loads[0]!.id
  await expect(as.mutation(api.execution.start, { planId: planned.planId, loadId, idempotencyKey: 'unconfirmed' })).rejects.toThrow('Confirm the recipe')
  await as.mutation(api.plans.confirmRecipe, { planId: planned.planId, loadId, machineId: planned.result.loads[0]!.machineId as Id<'machines'> })
  await expect(as.mutation(api.execution.start, { planId: planned.planId, loadId, idempotencyKey: 'confirmed' })).resolves.toMatchObject({ status: 'running' })
})
