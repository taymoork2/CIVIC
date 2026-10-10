import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { isDryerPhase } from '@washcloset/planner'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import type { FunctionArgs } from 'convex/server'
import { addDryer, dryingCare, intakeHousehold, joinHousehold, label, newBackend, planFor, signedIn, startLoad, type Caller } from './harness.testing'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })
const settings: NonNullable<FunctionArgs<typeof api.personalRoutines.set>['settings']> = { wash: { method: 'machine', cycle: 'normal', maximumTemperatureC: 60 }, dry: { method: 'tumble', heat: 'high' } }
async function choose(as: Caller, ids: Id<'textiles'>[], scope: 'once' | 'remembered' = 'remembered', next: typeof settings | null = settings) {
  const review = await as.query(api.personalRoutines.review, { textileIds: ids })
  await as.mutation(api.personalRoutines.set, { pieces: review.map(({ textileId, revision, labelHash }) => ({ textileId, revision, labelHash })), settings: next, scope, acceptedDamage: true, missingLabelAccepted: false })
  return review
}
async function queueWash(as: Caller, householdId: Id<'households'>, textileIds: Id<'textiles'>[]) {
  const planned = await planFor(as, householdId, textileIds)
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: `routine-${planned.planId}` })
  for (;;) {
    const detail = await as.query(api.execution.sessionDetail, { sessionId })
    const step = detail.actions.find((action) => action.status === 'pending' && !isDryerPhase(action.phase))
    if (step === undefined) break
    await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: step.kind === 'task' ? 'confirmed' : 'skipped' })
  }
  await as.mutation(api.execution.washFinished, { sessionId })
  await expect(as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: `routine-${planned.planId}` })).rejects.toThrow('drying queue')
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  return { sessionId, queue: await as.query(api.dryingQueue.queue, { householdId }) }
}

test('accepting damage does not authorize material-incompatible wool routine settings', async () => {
  const t = newBackend(), as = signedIn(t, 'wool-routine')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.setCare, { textileId: home.shirt, material: 'wool', washMethod: 'machine', cycle: 'delicate', maxTemperatureC: 30, dryMethod: 'tumble_dry', dryHeat: 'low', restrictions: [], provenance: label('Synthetic wool label') })
  for (const next of [{ wash: { method: 'machine' as const, cycle: 'normal' as const, maximumTemperatureC: 30 } }, { wash: { method: 'machine' as const, cycle: 'delicate' as const, maximumTemperatureC: 60 } }, { dry: { method: 'tumble' as const, heat: 'medium' as const } }]) await expect(choose(as, [home.shirt], 'remembered', next)).rejects.toThrow(/Wool|wool/)
  await choose(as, [home.shirt], 'remembered', { dry: { method: 'tumble', heat: 'low' } })
  expect((await t.run((ctx) => ctx.db.get(home.shirt)))?.personalRoutine?.settings.dry?.heat).toBe('low')
})

test('piece selection is atomic, owner-scoped, concurrent-safe and independent of matching names', async () => {
  const t = newBackend(), as = signedIn(t, 'routine-owner')
  const home = await intakeHousehold(as)
  const sameName = await as.mutation(api.inventory.createTextile, { householdId: home.householdId, name: 'White tee' })
  await choose(as, [home.shirt, home.towel])
  expect((await t.run((ctx) => ctx.db.get(sameName)))?.personalRoutine).toBeUndefined()
  expect((await t.run((ctx) => ctx.db.get(home.shirt)))?.personalRoutine).toMatchObject({ settings, scope: 'remembered', acceptedDamage: true })
  const member = await joinHousehold(t, as, home.householdId, 'routine-member', 'Other owner')
  const theirs = await member.mutation(api.inventory.createTextile, { householdId: home.householdId, name: 'White tee' })
  await expect(choose(as, [home.shirt, theirs])).rejects.toThrow('your own pieces')
  expect((await t.run((ctx) => ctx.db.get(home.shirt)))?.routineRevision).toBe(1)
  const otherHome = await intakeHousehold(signedIn(t, 'other-household-owner'))
  await expect(choose(as, [home.shirt, otherHome.shirt])).rejects.toThrow('Forbidden')
  await expect(choose(signedIn(t, 'outsider'), [home.shirt])).rejects.toThrow('Forbidden')
  const old = await as.query(api.personalRoutines.review, { textileIds: [home.shirt] })
  await choose(as, [home.shirt], 'remembered', null)
  await choose(as, [home.shirt])
  await expect(as.mutation(api.personalRoutines.set, { pieces: old.map(({ textileId, revision, labelHash }) => ({ textileId, revision, labelHash })), settings, scope: 'remembered', acceptedDamage: true, missingLabelAccepted: false })).rejects.toThrow('changed')
  const current = await as.query(api.personalRoutines.review, { textileIds: [home.shirt] })
  await expect(as.mutation(api.personalRoutines.set, { pieces: current.map(({ textileId, revision, labelHash }) => ({ textileId, revision, labelHash })), settings, scope: 'remembered', acceptedDamage: false, missingLabelAccepted: false })).rejects.toThrow('wear or damage')
})

test('remembered wash and dry departures retain the label and actual history; Follow label clears both departures', async () => {
  const t = newBackend(), as = signedIn(t, 'remember-routine')
  const home = await intakeHousehold(as), dryerId = await addDryer(as, home.householdId)
  await as.mutation(api.inventory.setCare, { textileId: home.shirt, material: 'cotton', washMethod: 'hand_wash', maxTemperatureC: 20, dryMethod: 'do_not_tumble_dry', restrictions: [], provenance: label('Synthetic restricted label') })
  expect((await planFor(as, home.householdId, [home.shirt])).result.loads).toHaveLength(0)
  const oldPlan = await planFor(as, home.householdId, [home.towel])
  await choose(as, [home.shirt, home.towel])
  await expect(startLoad(as, { planId: oldPlan.planId, loadId: oldPlan.result.loads[0]!.id, idempotencyKey: 'old-routine' })).rejects.toThrow()
  const { sessionId, queue } = await queueWash(as, home.householdId, [home.shirt])
  const piece = queue.pieces[0]!
  expect([piece.source, piece.method, piece.maxHeat, piece.label]).toEqual(['routine', 'tumble', 'high', 'do_not_tumble_dry'])
  await expect(choose(as, [home.shirt])).rejects.toThrow('active washing and drying')
  const { runId } = await as.mutation(api.dryingQueue.startDryer, { householdId: home.householdId, pieceIds: [piece.pieceId], dryerId, minutes: 20 })
  await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [piece.pieceId] })
  await as.mutation(api.dryingQueue.putAway, { householdId: home.householdId, pieceIds: [piece.pieceId] })
  expect((await t.run((ctx) => ctx.db.get(home.shirt)))?.personalRoutine?.scope).toBe('remembered')
  const record = (await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt }))[0]!
  expect(record.plannedTemperatureC).toBe(60)
  expect(record.activityContext?.garment).toMatchObject({ care: { washMethod: 'hand_wash', maxTemperatureC: 20 }, personalRoutine: { settings } })
  expect(record.drying).toMatchObject({ heat: 'high', scope: 'routine', personalRoutine: { revision: 1, settings } })
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['worn'], soilLevel: 'normal' })
  const repeat = await planFor(as, home.householdId, [home.shirt])
  expect(repeat.result.loads[0]?.temperatureC).toBe(60)
  await as.mutation(api.dryingQueue.setDryingPreference, { textileId: home.shirt, method: 'flat' })
  await choose(as, [home.shirt], 'remembered', null)
  const cleared = await t.run((ctx) => ctx.db.get(home.shirt))
  expect(cleared?.personalRoutine).toBeUndefined()
  expect(cleared?.dryingPreference).toBeUndefined()
  expect((await planFor(as, home.householdId, [home.shirt])).result.loads).toHaveLength(0)
  expect((await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt }))[0]?.drying.personalRoutine?.revision).toBe(1)
  expect((await as.query(api.sessions.garmentRecord, { textileId: home.shirt })).routineChanges?.some((change) => change.text.includes('Following the label'))).toBe(true)
  expect(sessionId).toBe(record.sessionId)
})

test('once-only acceptance follows the captured wash and expires only after put-away; cancellation releases its claim', async () => {
  const t = newBackend(), as = signedIn(t, 'once-routine')
  const home = await intakeHousehold(as), dryerId = await addDryer(as, home.householdId)
  await dryingCare(as, home.shirt, 'tumble_dry', 'low')
  await choose(as, [home.shirt], 'once')
  const planned = await planFor(as, home.householdId, [home.shirt])
  const cancelled = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'cancel-once' })
  await expect(choose(as, [home.shirt])).rejects.toThrow('active washing and drying')
  await as.mutation(api.execution.cancel, { sessionId: cancelled.sessionId })
  expect((await t.run((ctx) => ctx.db.get(home.shirt)))?.routineWashId).toBeUndefined()
  const { sessionId, queue } = await queueWash(as, home.householdId, [home.shirt])
  const piece = queue.pieces[0]!
  await as.mutation(api.dryingQueue.setPiece, { pieceId: piece.pieceId, method: 'flat' })
  const onceChoice = (await as.query(api.dryingQueue.queue, { householdId: home.householdId })).pieces[0]!
  expect([onceChoice.method, onceChoice.source, onceChoice.maxHeat]).toEqual(['flat', 'once', 'low'])
  const runId = await as.mutation(api.dryingQueue.startAirDry, { householdId: home.householdId, pieceIds: [piece.pieceId], method: 'flat' })
  await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [piece.pieceId] })
  expect((await t.run((ctx) => ctx.db.get(home.shirt)))?.personalRoutine?.scope).toBe('once')
  await as.mutation(api.dryingQueue.putAway, { householdId: home.householdId, pieceIds: [piece.pieceId] })
  expect((await t.run((ctx) => ctx.db.get(home.shirt)))?.personalRoutine).toBeUndefined()
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['worn'], soilLevel: 'normal' })
  expect((await planFor(as, home.householdId, [home.shirt])).result.loads[0]?.temperatureC).toBe(40)
  expect((await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt }))[0]?.activityContext?.garment?.personalRoutine?.scope).toBe('once')
  expect((await t.run((ctx) => ctx.db.get(sessionId)))?.status).toBe('completed')
  expect(dryerId).toBeDefined()
})

test('new label facts require fresh acceptance and unknown labels retain their uncertainty', async () => {
  const t = newBackend(), as = signedIn(t, 'review-routine')
  const home = await intakeHousehold(as)
  await choose(as, [home.shirt])
  await as.mutation(api.inventory.setCare, { textileId: home.shirt, material: 'wool', washMethod: 'machine', cycle: 'delicate', maxTemperatureC: 30, restrictions: ['Remove trim'], provenance: label('Corrected material and component label') })
  const stale = await planFor(as, home.householdId, [home.shirt])
  expect(stale.result.exclusions[0]?.textileId).toBe(home.shirt)
  expect(stale.result.reasons.some((reason) => reason.details.cause === 'routine_review_required')).toBe(true)
  await choose(as, [home.shirt], 'remembered', { wash: { method: 'machine', cycle: 'delicate', maximumTemperatureC: 30 } })
  // The fresh acceptance clears the review, but wool still never meets a detergent not known to be free of
  // protease: the shirt waits for a wool-safe one instead of washing.
  const accepted = await planFor(as, home.householdId, [home.shirt])
  expect(accepted.result.reasons.some((reason) => reason.details.cause === 'routine_review_required')).toBe(false)
  expect(accepted.result.reasons.some((reason) => reason.details.cause === 'protein_fiber_enzyme_unknown' && reason.textileIds.includes(home.shirt))).toBe(true)
  const review = await as.query(api.personalRoutines.review, { textileIds: [home.sweater] })
  const args = { pieces: review.map(({ textileId, revision, labelHash }) => ({ textileId, revision, labelHash })), settings, scope: 'remembered' as const, acceptedDamage: true, missingLabelAccepted: false }
  await expect(as.mutation(api.personalRoutines.set, args)).rejects.toThrow('without a complete care label')
  await as.mutation(api.personalRoutines.set, { ...args, missingLabelAccepted: true })
  expect((await t.run((ctx) => ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', home.sweater)).unique()))).toBeNull()
  expect((await planFor(as, home.householdId, [home.sweater])).result.loads.length).toBeGreaterThan(0)
})

test('dryer precedence protects another piece and a reviewed Follow label clears every departure without changing the wash snapshot', async () => {
  const t = newBackend(), as = signedIn(t, 'dryer-routine-precedence')
  const home = await intakeHousehold(as), dryerId = await addDryer(as, home.householdId)
  await dryingCare(as, home.shirt, 'tumble_dry', 'low')
  await dryingCare(as, home.towel, 'tumble_dry', 'low')
  await as.mutation(api.dryingQueue.setDryingPreference, { textileId: home.shirt, method: 'rack_line' })
  await choose(as, [home.shirt])
  const { queue, sessionId } = await queueWash(as, home.householdId, [home.shirt, home.towel])
  const shirt = queue.pieces.find((piece) => piece.textileId === home.shirt)!, towel = queue.pieces.find((piece) => piece.textileId === home.towel)!
  expect([shirt.method, shirt.source, shirt.labelMaxHeat, shirt.maxHeat]).toEqual(['tumble', 'routine', 'low', 'high'])
  const { runId } = await as.mutation(api.dryingQueue.startDryer, { householdId: home.householdId, pieceIds: [shirt.pieceId, towel.pieceId], dryerId, minutes: 25, heat: 'high' })
  expect((await t.run((ctx) => ctx.db.get(runId)))?.heat).toBe('low')
  await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [shirt.pieceId, towel.pieceId] })
  await as.mutation(api.dryingQueue.putAway, { householdId: home.householdId, pieceIds: [shirt.pieceId, towel.pieceId] })
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['worn'], soilLevel: 'normal' })
  const next = await queueWash(as, home.householdId, [home.shirt])
  const piece = next.queue.pieces[0]!
  await as.mutation(api.inventory.setCare, { textileId: home.shirt, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, dryMethod: 'do_not_tumble_dry', restrictions: [], provenance: label('New synthetic prohibition') })
  const changed = (await as.query(api.dryingQueue.queue, { householdId: home.householdId })).pieces[0]!
  expect(changed.routineNeedsReview).toBe(true)
  await expect(as.mutation(api.dryingQueue.startDryer, { householdId: home.householdId, pieceIds: [piece.pieceId], dryerId, minutes: 25 })).rejects.toThrow()
  await expect(as.mutation(api.dryingQueue.setPiece, { pieceId: piece.pieceId, followLabel: true, expectedRoutineRevision: piece.routineRevision, expectedLabelHash: piece.routineLabelHash })).rejects.toThrow('changed')
  await as.mutation(api.dryingQueue.setPiece, { pieceId: piece.pieceId, followLabel: true, expectedRoutineRevision: changed.routineRevision, expectedLabelHash: changed.routineLabelHash })
  const follows = (await as.query(api.dryingQueue.queue, { householdId: home.householdId })).pieces[0]!
  expect([follows.method, follows.source, follows.preference, follows.routineNeedsReview]).toEqual(['rack_line', 'label', null, undefined])
  const garment = await t.run((ctx) => ctx.db.get(home.shirt))
  expect(garment?.personalRoutine).toBeUndefined()
  expect(garment?.dryingPreference).toBeUndefined()
  expect((await t.run((ctx) => ctx.db.get(next.sessionId)))?.preparationContext?.garments[0]?.personalRoutine?.settings).toEqual(settings)
  expect((await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt })).find((record) => record.sessionId === sessionId)?.drying).toMatchObject({ heat: 'low', scope: 'routine' })
})
