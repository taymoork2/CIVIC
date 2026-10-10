import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { isDryerPhase } from '@washcloset/planner'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { startLoad, addDryer, dryerHousehold, intakeHousehold, label, newBackend, planFor, signedIn, type Backend, type Caller } from './harness.testing'

const t0 = Date.UTC(2026, 8, 26, 18, 0)
const minutes = (count: number) => count * 60_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(t0)
})
afterEach(() => { vi.useRealTimers() })

const steps = async (t: Backend, sessionId: Id<'sessions'>) =>
  t.run(async (ctx) => (await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique())!.actions)

type Step = Awaited<ReturnType<typeof steps>>[number]

/** Records a step as done at its planned dose: the cap mark as printed, and nothing for a reusable product. */
function done(as: Caller, sessionId: Id<'sessions'>, step: Step) {
  if (step.kind === 'task' || step.reusable === true) return as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed' })
  const { amount, unit, mark } = step.dose
  return as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed', usage: { supplyId: step.supplyId as Id<'supplies'>, amount, unit, ...(mark === undefined ? {} : { mark }), placement: step.placement } })
}

const byPhase = (timeline: Step[], phase: string) => timeline.find((step) => step.phase === phase)!

async function startDrying(t: Backend, as: Caller, home: Awaited<ReturnType<typeof dryerHousehold>>, textileIds = [home.tee, home.sweater, home.scarf]) {
  const planned = await planFor(as, home.householdId, textileIds)
  const load = planned.result.loads[0]!
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: load.id, idempotencyKey: 'dry-run' })
  return { planned, load, sessionId }
}

/**
 * Records every washer step up to and including Start, at the current time, in order: the drum is
 * said to be a quarter full, which doses the cap detergent from its small-load line.
 */
async function washUntilRunning(t: Backend, as: Caller, sessionId: Id<'sessions'>) {
  for (;;) {
    const step = (await steps(t, sessionId)).find((entry) => entry.status === 'pending' && !isDryerPhase(entry.phase) && entry.phase !== 'cycle')
    if (step === undefined) return
    if (step.kind === 'task' && step.task === 'drum_fullness') await as.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'small' })
    else await done(as, sessionId, step)
  }
}

test('a load that dries follows the wash: what stays out, what goes in, its sheet, the heat in the dryer\'s words, collecting', async () => {
  const t = newBackend()
  const as = signedIn(t, 'dryer-user')
  const home = await dryerHousehold(as)
  const { planned, load, sessionId } = await startDrying(t, as, home)

  expect(planned.status).toBe('ready')
  expect(load.drying).toMatchObject({ status: 'ready', dryerId: home.dryer, heat: 'low', heatLabel: 'Low temp', tumbleTextileIds: [home.tee] })
  // The cap's lines go by load size, so the detergent's dose waits for how full the drum is.
  expect(load.treatments[0]).toMatchObject({ supplyId: home.detergent, dose: { amount: 0, unit: 'at_machine' }, atMachine: { machine: 'washer', candidates: expect.arrayContaining([expect.objectContaining({ size: 'small', dose: expect.objectContaining({ amount: 1, unit: 'cap', mark: '1' }) })]) } })

  const timeline = await steps(t, sessionId)
  expect(timeline.map((step) => step.phase)).toEqual(['load', 'drum_fullness', 'close', 'dispenser', 'start', 'hold_out', 'dryer_load', 'dryer_with_load', 'dryer_start', 'dryer_unload'])
  expect(byPhase(timeline, 'dispenser')).toMatchObject({ dose: { amount: 0, unit: 'at_machine' }, atMachine: { machine: 'washer' } })
  await done(as, sessionId, byPhase(timeline, 'load'))
  await expect(as.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'small' })).resolves.toEqual({ steps: [{ actionId: byPhase(timeline, 'dispenser').id, status: 'resolved' }] })
  expect(byPhase(await steps(t, sessionId), 'dispenser')).toMatchObject({ dose: { amount: 1, unit: 'cap', mark: '1', marks: ['1', '3', '5'] }, atMachine: { resolvedSize: 'small' } })
  expect(byPhase(timeline, 'hold_out')).toMatchObject({
    title: 'Keep 2 out',
    garments: expect.arrayContaining([{ textileId: home.sweater, method: 'do_not_tumble_dry' }, { textileId: home.scarf, method: 'unknown' }]),
  })
  expect(byPhase(timeline, 'dryer_load')).toMatchObject({ title: 'Into the dryer · 1 garment', garments: [{ textileId: home.tee }] })
  expect(byPhase(timeline, 'dryer_with_load')).toMatchObject({ supplyId: home.sheets, dose: { amount: 1, unit: 'sheet' }, placement: 'dryer_drum' })
  expect(byPhase(timeline, 'dryer_start')).toMatchObject({ title: 'Start the dryer', detail: 'Low temp · 64 min' })
  // Nothing is due until the washer runs.
  expect((await steps(t, sessionId)).every((step) => step.dueAt === undefined)).toBe(true)
  const detail = await as.query(api.execution.sessionDetail, { sessionId })
  expect(detail.drying).toMatchObject({ status: 'ready', dryerName: 'Dryer', heatLabel: 'Low temp', minutes: 64, tumbleCount: 1, readyAt: null })
  expect((await as.query(api.execution.householdSessions, { householdId: home.householdId }))[0]).toMatchObject({
    status: 'running', machineName: 'Front-loader', dryerName: 'Dryer', machineStartedAt: null, washFinishAt: null, washMinutes: 40, washConfidence: 'verified', dryMinutes: 64, dryFinishAt: null, hasDrying: true, dryerStepRecorded: false,
    textileIds: [home.tee, home.sweater, home.scarf].sort(),
  })
  expect(detail.drying!.heldOut.map((held) => held.name).sort()).toEqual(['Scarf', 'Sweater'])
})

test('drying steps wait for the wash: refused before Start and mid-cycle, then in order, and the load finishes with its record kept', async () => {
  const t = newBackend()
  const as = signedIn(t, 'dryer-user')
  const home = await dryerHousehold(as)
  const balls = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Wool dryer balls', kind: 'wool_dryer_ball', measure: { kind: 'count', countUnit: 'ball' }, provenance: label('ball pack') })
  await as.mutation(api.inventory.saveLabelDirections, { supplyId: balls, measure: { kind: 'count', countUnit: 'ball' }, stage: 'dry', placement: 'dryer_drum', timing: 'before starting the dryer', rows: [{ cells: [{ amount: 3, unit: 'ball' }] }], provenance: label('ball pack') })
  const { planned, sessionId } = await startDrying(t, as, home)
  const holdOut = byPhase(await steps(t, sessionId), 'hold_out')

  await expect(done(as, sessionId, holdOut)).rejects.toThrow('start the washer first')
  await washUntilRunning(t, as, sessionId)
  const running = await steps(t, sessionId)
  const washFinish = t0 + minutes(40)
  expect(byPhase(running, 'hold_out').dueAt).toBe(washFinish)
  expect(byPhase(running, 'dryer_load').dueAt).toBe(washFinish)
  const reminders = await t.run((ctx) => ctx.db.query('reminders').collect())
  expect(reminders.filter((reminder) => reminder.status === 'scheduled').map((reminder) => reminder.actionId).sort()).toEqual([byPhase(running, 'dryer_load').id, holdOut.id].sort())

  // The front-loader's door is locked until the cycle ends: nothing comes out early.
  vi.setSystemTime(t0 + minutes(25))
  await expect(done(as, sessionId, holdOut)).rejects.toThrow('has not finished')

  vi.setSystemTime(washFinish)
  await done(as, sessionId, holdOut)
  expect((await as.query(api.execution.sessionDetail, { sessionId })).washFinishedAt).toBe(washFinish)
  const dryerStart = byPhase(running, 'dryer_start')
  await expect(done(as, sessionId, dryerStart)).rejects.toThrow('Record every drying step')
  await expect(done(as, sessionId, byPhase(running, 'dryer_unload'))).rejects.toThrow('Start the dryer')
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: byPhase(running, 'dryer_load').id, status: 'missed' })).rejects.toThrow('done or skipped')
  await done(as, sessionId, byPhase(running, 'dryer_load'))
  const products = running.filter((step) => step.phase === 'dryer_with_load')
  const ballStep = products.find((step) => step.kind === 'treatment' && step.supplyId === balls)!
  expect(ballStep).toMatchObject({ reusable: true, dose: { amount: 3, unit: 'ball' } })
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: ballStep.id, status: 'confirmed', usage: { supplyId: balls, amount: 3, unit: 'ball', placement: 'dryer_drum' } })).rejects.toThrow('reused')
  for (const product of products) await done(as, sessionId, product)

  const dryerStartedAt = washFinish + minutes(5)
  vi.setSystemTime(dryerStartedAt)
  await done(as, sessionId, dryerStart)
  const dryReady = dryerStartedAt + minutes(64)
  const detail = await as.query(api.execution.sessionDetail, { sessionId })
  expect(detail).toMatchObject({ dryerStartedAt, estimatedDoneAt: dryReady, drying: { startedAt: dryerStartedAt, readyAt: dryReady, readyEstimated: false } })
  const unload = byPhase(await steps(t, sessionId), 'dryer_unload')
  expect(unload).toMatchObject({ dueAt: dryReady, detail: 'Take the dryer balls back out too.' })
  expect((await t.run((ctx) => ctx.db.query('reminders').collect())).filter((reminder) => reminder.status === 'scheduled').map((reminder) => reminder.actionId)).toEqual([unload.id])
  expect((await as.query(api.execution.householdSessions, { householdId: home.householdId }))[0]).toMatchObject({ dryerStartedAt, dryFinishAt: dryReady, dryMinutes: 64, hasDrying: true, dryerStepRecorded: true, dryerUnloaded: false })

  vi.setSystemTime(dryReady)
  await done(as, sessionId, unload)
  await as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'dry-run' })

  // The plan is released once the load is finished; the session keeps how it dried.
  expect(await t.run((ctx) => ctx.db.get(planned.planId))).toBeNull()
  const finished = await as.query(api.execution.sessionDetail, { sessionId })
  expect(finished.drying).toMatchObject({ status: 'ready', dryerName: 'Dryer', heatLabel: 'Low temp', minutes: 64, tumbleCount: 1 })
  expect(finished.usage).toEqual(expect.arrayContaining([
    expect.objectContaining({ supplyId: home.detergent, amount: 1, unit: 'cap', mark: '1' }),
    expect.objectContaining({ supplyId: home.sheets, amount: 1, unit: 'sheet', mark: null }),
  ]))
  expect(finished.usage.some((use) => use.supplyId === balls)).toBe(false)
  const recent = (await as.query(api.execution.householdSessions, { householdId: home.householdId }))[0]!
  expect(recent.garments.map((garment) => garment.name).sort()).toEqual(['Scarf', 'Sweater', 'Tee'])
  expect(recent.usage).toEqual(expect.arrayContaining([{ supplyName: 'Tide cap', amount: 1, unit: 'cap', mark: '1' }]))
})

test('with no cycle length on record, drying waits until the wash is said to have finished, and is timed from then', async () => {
  const t = newBackend()
  const as = signedIn(t, 'dryer-user')
  const home = await dryerHousehold(as)
  await as.mutation(api.inventory.updateMachine, { machineId: home.washer, cycleMinutes: {} })
  const { sessionId } = await startDrying(t, as, home)
  await expect(as.mutation(api.execution.washFinished, { sessionId })).rejects.toThrow('not been started')
  await washUntilRunning(t, as, sessionId)
  const holdOut = byPhase(await steps(t, sessionId), 'hold_out')
  expect(holdOut.dueAt).toBeUndefined()

  vi.setSystemTime(t0 + minutes(90))
  await expect(done(as, sessionId, holdOut)).rejects.toThrow('has not finished')
  await as.mutation(api.execution.washFinished, { sessionId, at: t0 + minutes(38) })
  expect((await as.query(api.execution.sessionDetail, { sessionId })).washFinishedAt).toBe(t0 + minutes(38))
  expect(byPhase(await steps(t, sessionId), 'hold_out').dueAt).toBe(t0 + minutes(38))
  await done(as, sessionId, holdOut)
})

test('"It finished" queued with no signal keeps the phone\'s time, held between the start and now', async () => {
  const early = async (at: number) => {
    vi.setSystemTime(t0)
    const t = newBackend()
    const as = signedIn(t, 'dryer-user')
    const home = await dryerHousehold(as)
    await as.mutation(api.inventory.updateMachine, { machineId: home.washer, cycleMinutes: {} })
    const { sessionId } = await startDrying(t, as, home)
    await washUntilRunning(t, as, sessionId)
    vi.setSystemTime(t0 + minutes(90))
    await as.mutation(api.execution.washFinished, { sessionId, at })
    return (await as.query(api.execution.sessionDetail, { sessionId })).washFinishedAt
  }
  // Reaches the server 50 minutes late: the tap's own time is kept.
  expect(await early(t0 + minutes(40))).toBe(t0 + minutes(40))
  // A phone clock running ahead cannot finish the wash in the future, nor one behind before it started.
  expect(await early(t0 + minutes(120))).toBe(t0 + minutes(90))
  expect(await early(t0 - minutes(30))).toBe(t0)

  vi.setSystemTime(t0)
  const t = newBackend()
  const as = signedIn(t, 'dryer-user')
  const home = await dryerHousehold(as)
  const { sessionId } = await startDrying(t, as, home)
  await washUntilRunning(t, as, sessionId)
  await expect(as.mutation(api.execution.washFinished, { sessionId, at: Number.NaN })).rejects.toThrow('at must be finite')
})

test('"Not drying here" skips every drying step, and the load can be finished', async () => {
  const t = newBackend()
  const as = signedIn(t, 'dryer-user')
  const home = await dryerHousehold(as)
  const { planned, sessionId } = await startDrying(t, as, home)
  await washUntilRunning(t, as, sessionId)
  await expect(as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'dry-run' })).rejects.toThrow('Pending actions')

  await expect(as.mutation(api.actions.skipDrying, { sessionId })).resolves.toMatchObject({ skipped: 5 })
  const timeline = await steps(t, sessionId)
  expect(timeline.filter((step) => isDryerPhase(step.phase)).every((step) => step.status === 'skipped')).toBe(true)
  expect((await t.run((ctx) => ctx.db.query('reminders').collect())).some((reminder) => reminder.status === 'scheduled')).toBe(false)
  expect((await as.query(api.execution.householdSessions, { householdId: home.householdId }))[0]).toMatchObject({ hasDrying: false, dryerStepRecorded: false })
  // Nothing says the load was dried, so every garment hangs until someone taps All dry.
  await expect(as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'dry-run' })).resolves.toMatchObject({ status: 'completed', ready: 0, hanging: 3 })
  const listed = (await as.query(api.inventory.list, { householdId: home.householdId })).textiles
  expect(listed.filter((textile) => [home.tee, home.sweater, home.scarf].includes(textile.textileId)).map((textile) => textile.status)).toEqual(['hanging', 'hanging', 'hanging'])
  await expect(signedIn(t, 'outsider').mutation(api.actions.skipDrying, { sessionId })).rejects.toThrow('Forbidden')
})

test('a load nothing in which may tumble is hung: one step names every garment and how it dries', async () => {
  const t = newBackend()
  const as = signedIn(t, 'dryer-user')
  const home = await dryerHousehold(as)
  const { load, sessionId } = await startDrying(t, as, home, [home.sweater, home.scarf])
  expect(load.drying).toMatchObject({ status: 'none', tumbleTextileIds: [] })
  const drying = (await steps(t, sessionId)).filter((step) => isDryerPhase(step.phase))
  expect(drying).toHaveLength(1)
  expect(drying[0]).toMatchObject({
    task: 'hold_out',
    title: 'Take it out and hang it',
    garments: expect.arrayContaining([{ textileId: home.sweater, method: 'do_not_tumble_dry' }, { textileId: home.scarf, method: 'unknown' }]),
  })
})

test('a dryer without confirmed evidence is never run: the whole load is hung, and the wash is not held up', async () => {
  const t = newBackend()
  const as = signedIn(t, 'dryer-user')
  const home = await dryerHousehold(as)
  await as.mutation(api.inventory.updateMachine, { machineId: home.dryer, provenance: { source: 'not read yet', confidence: 'unknown' } })
  const { planned, load, sessionId } = await startDrying(t, as, home)
  expect(planned.status).toBe('ready')
  expect(load.drying).toMatchObject({ status: 'needs_confirmation', dryerId: null })
  expect(planned.result.reasons.some((reason) => reason.code === 'drying_decision' && reason.details.cause === 'dryer_evidence')).toBe(true)
  const hang = (await steps(t, sessionId)).filter((step) => isDryerPhase(step.phase))
  expect(hang.map((step) => step.phase)).toEqual(['hold_out'])
  expect(hang[0]).toMatchObject({ title: 'Take it out and hang it', garments: expect.arrayContaining([{ textileId: home.tee }]) })
})

test('a household without a dryer keeps the washer\'s timeline exactly', async () => {
  const t = newBackend()
  const as = signedIn(t, 'dryer-user')
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt])
  expect(planned.result.loads[0]!.drying).toBeNull()
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'washer-only' })
  expect((await steps(t, sessionId)).map((step) => step.phase)).toEqual(['load', 'close', 'dispenser', 'start'])
  const detail = await as.query(api.execution.sessionDetail, { sessionId })
  expect(detail.drying).toBeNull()
  await expect(as.mutation(api.actions.skipDrying, { sessionId })).resolves.toMatchObject({ skipped: 0 })
})

test('a sheet dosed by how full the dryer is waits for the dryer to be loaded, then takes the line for that size, kept once the dryer starts', async () => {
  const t = newBackend()
  const as = signedIn(t, 'dryer-user')
  const home = await dryerHousehold(as)
  const sheetMeasure = { kind: 'count' as const, countUnit: 'sheet' as const }
  await as.mutation(api.inventory.saveLabelDirections, {
    supplyId: home.sheets, measure: sheetMeasure, stage: 'dry', placement: 'dryer_drum', timing: 'before starting the dryer',
    rows: [{ loadSizes: ['small', 'medium'], cells: [{ amount: 1, unit: 'sheet' }] }, { loadSizes: ['large', 'extra_large'], cells: [{ amount: 2, unit: 'sheet' }] }],
    provenance: label('Bounce box'),
  })
  const { load, sessionId } = await startDrying(t, as, home)
  expect(load.drying!.treatments[0]).toMatchObject({ supplyId: home.sheets, dose: { amount: 0, unit: 'at_machine' }, atMachine: { machine: 'dryer' } })
  const timeline = await steps(t, sessionId)
  expect(timeline.map((step) => step.phase)).toEqual(['load', 'drum_fullness', 'close', 'dispenser', 'start', 'hold_out', 'dryer_load', 'dryer_fullness', 'dryer_with_load', 'dryer_start', 'dryer_unload'])
  const sheet = byPhase(timeline, 'dryer_with_load')
  const fullness = { sessionId, machine: 'dryer' as const, size: 'large' as const }

  // Drying waits for the wash, and how full the dryer is waits for the clothes to be in it.
  await washUntilRunning(t, as, sessionId)
  await expect(as.mutation(api.execution.recordDrumFullness, fullness)).rejects.toThrow('Put the clothes in the dryer first')
  vi.setSystemTime(t0 + minutes(40))
  await done(as, sessionId, byPhase(timeline, 'hold_out'))
  await done(as, sessionId, byPhase(timeline, 'dryer_load'))
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: sheet.id, status: 'confirmed', usage: { supplyId: home.sheets, amount: 1, unit: 'sheet', placement: 'dryer_drum' } })).rejects.toThrow('Pick how full the dryer is first')
  await expect(done(as, sessionId, byPhase(timeline, 'dryer_start'))).rejects.toThrow('Record every drying step')

  await expect(as.mutation(api.execution.recordDrumFullness, fullness)).resolves.toEqual({ steps: [{ actionId: sheet.id, status: 'resolved' }] })
  expect((await t.run((ctx) => ctx.db.get(sessionId)))!.dryerFullness).toBe('large')
  const resolved = byPhase(await steps(t, sessionId), 'dryer_with_load')
  expect(resolved).toMatchObject({ dose: { amount: 2, unit: 'sheet' }, atMachine: { resolvedSize: 'large' } })
  expect(byPhase(await steps(t, sessionId), 'dryer_fullness')).toMatchObject({ status: 'confirmed' })
  await done(as, sessionId, resolved)
  await done(as, sessionId, byPhase(timeline, 'dryer_start'))
  // Starting the dryer rebuilds the steps from the plan; the dose the person was given stays.
  expect(byPhase(await steps(t, sessionId), 'dryer_with_load')).toMatchObject({ status: 'confirmed', dose: { amount: 2, unit: 'sheet' }, atMachine: { resolvedSize: 'large' } })
  await expect(as.mutation(api.execution.recordDrumFullness, { ...fullness, size: 'small' })).rejects.toThrow('The dryer has already started')
  expect((await t.run((ctx) => ctx.db.query('usage').collect())).find((use) => use.supplyId === home.sheets)).toMatchObject({ amount: 2, unit: 'sheet' })
})

test('"Which dryer?" records the dryer the person is at, only one of the household\'s dryers, and only before it starts', async () => {
  const t = newBackend()
  const as = signedIn(t, 'which-dryer')
  const home = await dryerHousehold(as)
  const second = await addDryer(as, home.householdId)
  const { sessionId } = await startDrying(t, as, home)

  expect((await as.query(api.execution.sessionDetail, { sessionId })).drying).toMatchObject({ dryerId: home.dryer, dryerChosen: false })
  await expect(as.mutation(api.execution.chooseDryer, { sessionId, dryerId: home.washer })).rejects.toThrow('Pick one of your dryers')
  await as.mutation(api.execution.chooseDryer, { sessionId, dryerId: second })
  expect((await as.query(api.execution.sessionDetail, { sessionId })).drying).toMatchObject({ dryerId: second, dryerChosen: true, heatLabel: 'Low temp' })

  const stranger = signedIn(t, 'someone-else')
  const theirs = await dryerHousehold(stranger)
  await expect(as.mutation(api.execution.chooseDryer, { sessionId, dryerId: theirs.dryer })).rejects.toThrow('Forbidden')

  await washUntilRunning(t, as, sessionId)
  vi.setSystemTime(t0 + minutes(40))
  for (const step of (await steps(t, sessionId)).filter((entry) => isDryerPhase(entry.phase) && entry.phase !== 'dryer_unload')) {
    if (step.kind === 'task' && step.task === 'dryer_fullness') await as.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'dryer', size: 'small' })
    else await done(as, sessionId, step)
  }
  await expect(as.mutation(api.execution.chooseDryer, { sessionId, dryerId: home.dryer })).rejects.toThrow('already started')
  expect((await as.query(api.execution.householdSessions, { householdId: home.householdId }))[0]).toMatchObject({ dryerName: 'Dryer' })
})

test('a wash\'s own dryer step is refused while a drying-queue run still holds the home dryer', async () => {
  const t = newBackend()
  const as = signedIn(t, 'dryer-user')
  const home = await dryerHousehold(as)
  const { sessionId } = await startDrying(t, as, home)
  await washUntilRunning(t, as, sessionId)
  vi.setSystemTime(t0 + minutes(40))
  const timeline = await steps(t, sessionId)
  for (const phase of ['hold_out', 'dryer_load']) await done(as, sessionId, byPhase(timeline, phase))
  for (const product of timeline.filter((step) => step.phase === 'dryer_with_load')) await done(as, sessionId, product)
  const runId = await t.run((ctx) => ctx.db.insert('dryingRuns', { householdId: home.householdId, kind: 'dryer', dryerId: home.dryer, dryerName: 'Dryer', startedAt: t0, minutes: 60, status: 'running', startedBy: 'someone' }))
  await expect(done(as, sessionId, byPhase(timeline, 'dryer_start'))).rejects.toThrow('Dryer still has a load in it. Take it out first')
  await t.run((ctx) => ctx.db.patch(runId, { status: 'done' }))
  await done(as, sessionId, byPhase(timeline, 'dryer_start'))
  expect((await as.query(api.dryingQueue.queue, { householdId: home.householdId })).homeDryerSessionId).toBe(sessionId)
})
