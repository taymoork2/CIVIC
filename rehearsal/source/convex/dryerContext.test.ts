import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { isDryerPhase } from '@washcloset/planner'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { dryingCare, intakeHousehold, joinHousehold, label, newBackend, planFor, signedIn, startLoad, type Backend, type Caller } from './harness.testing'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 9, 5, 18)) })
afterEach(() => vi.useRealTimers())

async function homeFor(t: Backend, as: Caller) {
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [],
    capabilities: [{ kind: 'soil_dispersal', status: 'present', variant: 'Synthetic exact detergent', market: 'US', formulationRevision: 'context-test-1', source: 'Synthetic exact-pack disclosure', retrievedAt: Date.now(), scope: 'ingredient_disclosure' }] } })
  await dryingCare(as, home.shirt, 'tumble_dry', 'low')
  await as.mutation(api.inventory.updateTextile, { textileId: home.shirt, kind: 't_shirt', status: 'dirty', bulkUnits: 1 })
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine,
    washProcesses: { normal: { programLabel: 'Normal', source: 'Synthetic checked washer guide', spinRpm: 800, spinMinutes: 4 } } })
  const dryerId = await as.mutation(api.inventory.createMachine, { householdId: home.householdId, name: 'Context dryer', applianceType: 'tumble_dryer',
    capacityUnits: 6, capacityConfidence: 'observed', cycleMinutes: { timed: 60 }, cycleModes: { timed: 'fixed' }, heatSettings: [{ heat: 'low', label: 'Delicates' }], provenance: label('Synthetic dryer manual') })
  expect((await t.run((ctx) => ctx.db.get(dryerId)))?.cycleProfile?.cycles.timed?.mode).toBe('fixed')
  return { ...home, dryerId }
}
type Home = Awaited<ReturnType<typeof homeFor>>

async function queueShirt(as: Caller, home: Home, key: string) {
  await as.mutation(api.inventory.updateTextile, { textileId: home.shirt, status: 'dirty' })
  const plan = await planFor(as, home.householdId, [home.shirt])
  const { sessionId } = await startLoad(as, { planId: plan.planId, loadId: plan.result.loads[0]!.id, idempotencyKey: key, machineId: home.machine })
  for (;;) {
    const detail = await as.query(api.execution.sessionDetail, { sessionId })
    const step = detail.actions.find((action) => action.status === 'pending' && !isDryerPhase(action.phase))
    if (step === undefined) break
    if (step.kind === 'task') await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed', ...(step.task === 'start' ? { minutes: 40 } : {}) })
    else await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed', usage: { supplyId: step.supplyId as Id<'supplies'>, amount: step.dose.amount, unit: step.dose.unit, placement: step.placement } })
  }
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const piece = (await as.query(api.dryingQueue.queue, { householdId: home.householdId })).pieces.find((row) => row.textileId === home.shirt && row.status === 'queued')!
  return { sessionId, pieceId: piece.pieceId }
}
const suggestion = (as: Caller, home: Home, pieceId: Id<'dryingPieces'>) => as.query(api.dryingQueue.durationContext, { householdId: home.householdId, dryerId: home.dryerId, pieceIds: [pieceId], heat: 'low' })

async function dryShirt(t: Backend, as: Caller, home: Home, minutes: number, index: number) {
  vi.advanceTimersByTime(1000)
  const { pieceId, sessionId } = await queueShirt(as, home, `context-wash-${index}`)
  const before = await suggestion(as, home, pieceId)
  expect(before?.context.key).toMatch(/^[a-f0-9]{64}$/)
  const { runId } = await as.mutation(api.dryingQueue.startDryer, { householdId: home.householdId, dryerId: home.dryerId, pieceIds: [pieceId], minutes })
  await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [pieceId] })
  await as.mutation(api.dryingQueue.putAway, { householdId: home.householdId, pieceIds: [pieceId] })
  const record = (await t.run((ctx) => ctx.db.query('washRecords').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).collect()))[0]!
  await as.mutation(api.outcomeAssessments.save, { recordId: record._id, dimension: 'overall', checkedWhen: 'after_drying', result: 'unchanged', expectedRevision: 0, receiptId: `context-outcome-${index}` })
  return record
}

test('three independent private outcomes refine a fixed starting point; corrections and controls preserve old history', async () => {
  const t = newBackend(), as = signedIn(t, 'dryer-context-private'), home = await homeFor(t, as)
  const records: Awaited<ReturnType<typeof dryShirt>>[] = []
  for (const [index, minutes] of [35, 40, 45].entries()) records.push(await dryShirt(t, as, home, minutes, index))
  const { pieceId } = await queueShirt(as, home, 'context-current-wash')
  const refined = await suggestion(as, home, pieceId)
  expect(refined).toMatchObject({ basis: 'comparable_outcomes', minutes: 40, baselineMinutes: 60, independentWashes: 3 })
  expect(refined?.context.extraction).toEqual([{ washerId: home.machine, cycle: 'normal', source: 'Synthetic checked washer guide', spinRpm: 800, spinMinutes: 4 }])
  const member = await joinHousehold(t, as, home.householdId, 'dryer-context-other', 'Sam')
  expect(await suggestion(member, home, pieceId)).toMatchObject({ basis: 'baseline_only', minutes: 60 })
  const original = await t.run((ctx) => ctx.db.get(records[0]!._id))
  await as.mutation(api.outcomeAssessments.save, { recordId: records[0]!._id, dimension: 'overall', checkedWhen: 'after_drying', result: 'worse', expectedRevision: 1, receiptId: 'context-correct-negative' })
  expect(await suggestion(as, home, pieceId)).toMatchObject({ basis: 'unavailable', minutes: null })
  await as.mutation(api.outcomeAssessments.save, { recordId: records[0]!._id, dimension: 'overall', checkedWhen: 'after_drying', result: 'unknown', expectedRevision: 2, receiptId: 'context-correct-unknown' })
  expect(await suggestion(as, home, pieceId)).toMatchObject({ basis: 'baseline_only', minutes: 60 })
  await as.mutation(api.outcomeAssessments.save, { recordId: records[0]!._id, dimension: 'overall', checkedWhen: 'after_drying', result: 'unchanged', expectedRevision: 3, receiptId: 'context-correct-restored' })
  expect(await suggestion(as, home, pieceId)).toMatchObject({ basis: 'comparable_outcomes', minutes: 40 })
  expect(await t.run((ctx) => ctx.db.get(records[0]!._id))).toEqual(original)
  const { runId } = await as.mutation(api.dryingQueue.startDryer, { householdId: home.householdId, dryerId: home.dryerId, pieceIds: [pieceId], minutes: 28 })
  expect(await t.run((ctx) => ctx.db.get(runId))).toMatchObject({ minutes: 28, durationSuggestion: { version: 2, minutes: 40, baselineMinutes: 60, basis: 'comparable_outcomes' } })
  await t.run((ctx) => ctx.db.patch(home.dryerId, { cycleProfile: { cycles: { timed: { durationMinutes: 90, confidence: 'observed', mode: 'sensor' } } } }))
  await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [pieceId] })
  const completed = (await t.run((ctx) => ctx.db.query('washRecords').withIndex('by_textile', (q) => q.eq('textileId', home.shirt)).order('desc').first()))!
  expect(completed.drying).toMatchObject({ minutes: 28, durationSuggestion: { minutes: 40, baselineMinutes: 60, basis: 'comparable_outcomes' } })
})

test('unknown extraction, capacity, mode and changed program yield baseline; sensor programs have no precise duration', async () => {
  const t = newBackend(), as = signedIn(t, 'dryer-context-fallback'), home = await homeFor(t, as)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: { programLabel: 'Normal', source: 'Unknown extraction' } } })
  const { pieceId } = await queueShirt(as, home, 'fallback-wash')
  expect(await suggestion(as, home, pieceId)).toMatchObject({ basis: 'baseline_only', contextKey: null, minutes: 60 })
  // Later edits cannot populate the extraction snapshot of this completed wash.
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: { programLabel: 'Normal', source: 'New guide', spinRpm: 900, spinMinutes: 5 } } })
  expect((await suggestion(as, home, pieceId))?.context.extraction[0]?.spinRpm).toBeNull()
  await t.run((ctx) => ctx.db.patch(home.dryerId, { cycleProfile: { cycles: { timed: { durationMinutes: 60, confidence: 'observed', mode: 'sensor' } } } }))
  expect(await suggestion(as, home, pieceId)).toMatchObject({ basis: 'unavailable', minutes: null, baselineMinutes: null })
  await t.run((ctx) => ctx.db.patch(home.dryerId, { capacityConfidence: 'unknown', cycleProfile: { cycles: { timed: { durationMinutes: 60, confidence: 'observed' } } } }))
  expect(await suggestion(as, home, pieceId)).toMatchObject({ basis: 'baseline_only', minutes: 60, mode: 'unknown', context: { capacityUnits: null } })
})

test('private reset and disable withhold history; changed fixed program cannot reuse prior contexts', async () => {
  const t = newBackend(), as = signedIn(t, 'dryer-context-controls'), home = await homeFor(t, as)
  for (const [index, minutes] of [35, 40, 45].entries()) await dryShirt(t, as, home, minutes, index)
  const { pieceId } = await queueShirt(as, home, 'controls-current-wash')
  await as.mutation(api.personalAdaptation.change, { householdId: home.householdId, expectedRevision: 0, action: { kind: 'set_enabled', enabled: false } })
  expect(await suggestion(as, home, pieceId)).toMatchObject({ basis: 'baseline_only', minutes: 60 })
  await as.mutation(api.personalAdaptation.change, { householdId: home.householdId, expectedRevision: 1, action: { kind: 'set_enabled', enabled: true } })
  await t.run((ctx) => ctx.db.patch(home.dryerId, { cycleProfile: { cycles: { timed: { durationMinutes: 70, confidence: 'observed', mode: 'fixed' } } } }))
  expect(await suggestion(as, home, pieceId)).toMatchObject({ basis: 'baseline_only', minutes: 70 })
  await t.run((ctx) => ctx.db.patch(home.dryerId, { cycleProfile: { cycles: { timed: { durationMinutes: 60, confidence: 'verified', mode: 'fixed' } } } }))
  expect(await suggestion(as, home, pieceId)).toMatchObject({ basis: 'comparable_outcomes', minutes: 40 })
  await as.mutation(api.personalAdaptation.change, { householdId: home.householdId, textileId: home.shirt, expectedRevision: 0, action: { kind: 'reset' } })
  expect(await suggestion(as, home, pieceId)).toMatchObject({ basis: 'baseline_only', minutes: 60 })
})

test('an unassessed split from the same wash cannot count as an independent comparable outcome', async () => {
  const t = newBackend(), as = signedIn(t, 'dryer-context-correlated'), home = await homeFor(t, as)
  const records: Awaited<ReturnType<typeof dryShirt>>[] = []
  for (const [index, minutes] of [35, 40, 45].entries()) records.push(await dryShirt(t, as, home, minutes, index))
  const { pieceId } = await queueShirt(as, home, 'correlated-current-wash')
  expect(await suggestion(as, home, pieceId)).toMatchObject({ basis: 'comparable_outcomes', independentWashes: 3 })
  await t.run(async (ctx) => {
    const record = records[0]!
    const run = await ctx.db.get(record.drying.activityContext!.runId)
    if (run === null) throw new Error('Missing synthetic dryer run')
    const { _id: _runId, _creationTime: _runTime, ...runFields } = run
    const splitId = await ctx.db.insert('dryingRuns', runFields)
    const { _id: _recordId, _creationTime: _recordTime, ...recordFields } = record
    await ctx.db.insert('washRecords', { ...recordFields, textileId: home.towel,
      drying: { ...record.drying, activityContext: { ...record.drying.activityContext!, runId: splitId } } })
  })
  expect(await suggestion(as, home, pieceId)).toMatchObject({ basis: 'baseline_only', minutes: 60 })
})

test('unbound product revisions and a changed wash route cannot support dryer refinement', async () => {
  const t = newBackend(), as = signedIn(t, 'dryer-context-source'), home = await homeFor(t, as)
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] } })
  const { pieceId } = await queueShirt(as, home, 'unbound-product-wash')
  expect(await suggestion(as, home, pieceId)).toMatchObject({ basis: 'baseline_only', contextKey: null })
})

test('a run with pieces taken out early stays out of the learned dryer time', async () => {
  const t = newBackend(), as = signedIn(t, 'dryer-context-early'), home = await homeFor(t, as)
  const records: Awaited<ReturnType<typeof dryShirt>>[] = []
  for (const [index, minutes] of [35, 40, 45].entries()) records.push(await dryShirt(t, as, home, minutes, index))
  const { pieceId } = await queueShirt(as, home, 'context-early-current')
  expect(await suggestion(as, home, pieceId)).toMatchObject({ basis: 'comparable_outcomes', independentWashes: 3 })
  // One of the three had a piece taken out at a mid-run check: its time no longer counts.
  await t.run((ctx) => ctx.db.patch(records[1]!.drying.activityContext!.runId, { earlyChecks: [{ at: Date.now(), dry: 1, hung: 0, left: 1 }] }))
  expect(await suggestion(as, home, pieceId)).toMatchObject({ basis: 'baseline_only', minutes: 60 })
})
