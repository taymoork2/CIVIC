import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { startLoad, addDryer, dryingCare, finishSteps, intakeHousehold, joinHousehold, newBackend, planFor, signedIn, washLoad } from './harness.testing'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

test('completion checks its key and completes once with household-scoped history', async () => {
  const t = newBackend()
  const as = signedIn(t, 'session-test-user')
  const home = await intakeHousehold(as)
  await t.run((ctx) => ctx.db.patch(home.shirt, { firstWash: true }))
  const planned = await planFor(as, home.householdId, [home.shirt])
  const other = await planFor(as, home.householdId, [home.towel])
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'once' })
  const complete = (planInputHash: string) => as.mutation(api.sessions.complete, { sessionId, planInputHash, idempotencyKey: 'once' })

  await expect(complete(planned.inputHash)).rejects.toThrow('Pending actions')
  for (const step of (await as.query(api.execution.sessionDetail, { sessionId })).actions) {
    await as.mutation(api.actions.recordAction, step.kind === 'task'
      ? { sessionId, actionId: step.id, status: 'confirmed' }
      : { sessionId, actionId: step.id, status: 'confirmed', usage: { supplyId: step.supplyId as Id<'supplies'>, amount: step.dose.amount, unit: step.dose.unit, placement: step.placement } })
  }

  await expect(as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'another-key' })).rejects.toThrow('Idempotency key mismatch')
  await expect(complete(planned.inputHash)).resolves.toMatchObject({ status: 'completed' })

  const after = await t.run(async (ctx) => ({
    shirt: await ctx.db.get(home.shirt),
    usage: await ctx.db.query('usage').collect(),
    washed: (await ctx.db.query('history').collect()).filter((event) => event.event === 'washed'),
    records: await ctx.db.query('washRecords').withIndex('by_textile', (q) => q.eq('textileId', home.shirt)).collect(),
  }))
  // No dryer is recorded, so nothing says the shirt was dried: it hangs until All dry.
  expect(after.shirt).toMatchObject({ status: 'hanging', washCount: 1, firstWash: false })
  // Completion records washing only: product use comes from the recorded steps, once.
  expect(after.usage).toHaveLength(1)
  expect(after.washed).toEqual([expect.objectContaining({ textileId: home.shirt, ownerPrincipalKey: expect.any(String) })])
  expect(after.records).toEqual([expect.objectContaining({
    sessionId, cycle: planned.result.loads[0]!.cycle, plannedTemperatureC: planned.result.loads[0]!.temperatureC,
    drying: { outcome: 'left_hanging' },
    products: [expect.objectContaining({ amount: after.usage[0]!.amount, unit: after.usage[0]!.unit })],
  })])
  expect(await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt })).toHaveLength(1)
  // A garment that is no longer a first wash changes color planning, so open plans go stale.
  expect((await as.query(api.plans.get, { planId: other.planId }))?.status).toBe('stale')

  await expect(complete('different-on-retry')).resolves.toMatchObject({ status: 'already_completed' })
  expect((await t.run((ctx) => ctx.db.query('history').collect())).filter((event) => event.event === 'washed')).toHaveLength(1)
  expect(await t.run((ctx) => ctx.db.query('washRecords').collect())).toHaveLength(1)
})

test('a load record lists each washed piece for its household, with only the reader\'s own assessments', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'load-record-owner')
  const home = await intakeHousehold(owner)
  const planned = await planFor(owner, home.householdId, [home.shirt, home.towel])
  const { sessionId } = await startLoad(owner, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'load-record' })
  expect(await owner.query(api.sessions.loadRecord, { sessionId })).toBeNull()
  await finishSteps(owner, sessionId)
  await owner.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'load-record' })

  const record = (await owner.query(api.sessions.loadRecord, { sessionId }))!
  const washed = planned.result.loads[0]!.textileIds
  expect(record.pieces.map((piece) => piece.textileId).sort()).toEqual([...washed].sort())
  expect(record.pieces.every((piece) => piece.wash.washerName !== undefined && piece.wash.drying.outcome === 'left_hanging' && piece.name !== null)).toBe(true)
  const recordId = record.pieces[0]!.wash.recordId!
  const assessment = { recordId, dimension: 'odor' as const, checkedWhen: 'after_drying' as const, expectedRevision: 0 }
  await owner.mutation(api.outcomeAssessments.save, { ...assessment, result: 'improved', receiptId: 'load-record-owner-report' })
  const member = await joinHousehold(t, owner, home.householdId, 'load-record-member', 'Sam')
  // Another member sees the same pieces, never the owner's private report, until they report their own.
  expect((await member.query(api.sessions.loadRecord, { sessionId }))!.pieces.every((piece) => piece.wash.assessments === undefined)).toBe(true)
  await member.mutation(api.outcomeAssessments.save, { ...assessment, result: 'worse', receiptId: 'load-record-member-report' })
  const own = (rows: typeof record | null) => rows!.pieces.flatMap((piece) => piece.wash.assessments ?? []).map((row) => row.result)
  expect(own(await member.query(api.sessions.loadRecord, { sessionId }))).toEqual(['worse'])
  expect(own(await owner.query(api.sessions.loadRecord, { sessionId }))).toEqual(['improved'])

  const outsider = signedIn(t, 'load-record-outsider')
  await intakeHousehold(outsider)
  await expect(outsider.query(api.sessions.loadRecord, { sessionId })).rejects.toThrow('Forbidden')
})

test('a cancelled load cannot be completed', async () => {
  const t = newBackend()
  const as = signedIn(t, 'session-test-user')
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt])
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'once' })
  await as.mutation(api.execution.cancel, { sessionId })
  await expect(as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'once' })).rejects.toThrow('Session is cancelled')
})

test('completion leaves tumble-dried garments ready and hangs the rest, clearing what the wash cleared', async () => {
  const t = newBackend()
  const as = signedIn(t, 'session-test-user')
  const home = await intakeHousehold(as)
  await addDryer(as, home.householdId)
  await dryingCare(as, home.shirt, 'tumble_dry', 'low')
  await dryingCare(as, home.towel, 'line_dry')
  // Sweat, not a stain: a stain note would keep the shirt out of the dryer, and this test needs one tumble-dried garment.
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt, home.towel], reasons: ['sweat'], soilLevel: 'heavy' })
  await t.run((ctx) => ctx.db.patch(home.shirt, { wearsSinceClean: 3 }))
  vi.setSystemTime(Date.UTC(2026, 8, 2))

  const { completed, sessionId } = await washLoad(as, home.householdId, [home.shirt, home.towel])
  expect(completed).toEqual({ status: 'completed', sessionId, ready: 1, hanging: 1, guests: [] })
  const [shirt, towel] = await t.run((ctx) => Promise.all([ctx.db.get(home.shirt), ctx.db.get(home.towel)]))
  expect(shirt).toMatchObject({ status: 'clean', washCount: 1, firstWash: false, lastCleanedAt: Date.UTC(2026, 8, 2), statusSince: Date.UTC(2026, 8, 2) })
  expect(towel).toMatchObject({ status: 'hanging', washCount: 1 })
  const records = await t.run((ctx) => ctx.db.query('washRecords').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).collect())
  expect(records.find((record) => record.textileId === home.shirt)?.drying).toMatchObject({ outcome: 'tumble_dried', heat: 'low' })
  expect(records.find((record) => record.textileId === home.towel)?.drying).toMatchObject({ outcome: 'left_hanging', method: 'line_dry' })
  for (const row of [shirt!, towel!]) {
    expect(row.soilLevel).toBeUndefined()
    expect(row.flag).toBeUndefined()
    expect(row.wearsSinceClean).toBeUndefined()
  }
  const history = await t.run((ctx) => ctx.db.query('history').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).collect())
  expect(history.filter((row) => row.event === 'washed' || row.event === 'hung').map((row) => [row.event, row.textileId])).toEqual([
    ['washed', home.shirt], ['washed', home.towel], ['hung', home.towel],
  ])
  // A retry reads the summary back; it never washes twice.
  await expect(as.mutation(api.sessions.complete, { sessionId, planInputHash: 'another', idempotencyKey: 'wash' })).resolves.toEqual({ status: 'already_completed', sessionId, ready: 1, hanging: 1, guests: [] })
})

test('a load whose drying was never confirmed ends hanging, whatever the garments allow', async () => {
  const t = newBackend()
  const as = signedIn(t, 'session-test-user')
  const home = await intakeHousehold(as)
  await addDryer(as, home.householdId)
  await dryingCare(as, home.shirt, 'tumble_dry')
  const planned = await planFor(as, home.householdId, [home.shirt])
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'once' })
  await finishSteps(as, sessionId)
  await t.run(async (ctx) => {
    const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique()
    await ctx.db.patch(timeline!._id, { drying: { ...timeline!.drying!, status: 'needs_confirmation' } })
  })
  await expect(as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'once' })).resolves.toMatchObject({ ready: 0, hanging: 1 })
  expect((await t.run((ctx) => ctx.db.get(home.shirt)))!.status).toBe('hanging')
})

test('a guest\'s clothes are named in the summary and then deleted with their care, with no history', async () => {
  const t = newBackend()
  const as = signedIn(t, 'session-test-user')
  const home = await intakeHousehold(as)
  await addDryer(as, home.householdId)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, supportedCycles: ['normal', 'delicate'] })
  const { selection } = await as.mutation(api.closet.washNow, { householdId: home.householdId, textileIds: [], soilLevel: 'heavy', guests: [{ name: "Alex's shirt", kind: 'shirt', colorGroup: 'light', machineOk: true }] })
  const guest = selection[0]!

  const { completed, sessionId } = await washLoad(as, home.householdId, [guest])
  expect(completed).toEqual({ status: 'completed', sessionId, ready: 0, hanging: 0, guests: [{ name: "Alex's shirt", hanging: true }] })
  const left = await t.run(async (ctx) => ({
    guest: await ctx.db.get(guest),
    care: (await ctx.db.query('care').collect()).filter((row) => row.textileId === guest),
    history: (await ctx.db.query('history').collect()).filter((row) => row.textileId === guest),
    records: (await ctx.db.query('washRecords').collect()).filter((row) => row.textileId === guest),
  }))
  expect(left).toEqual({ guest: null, care: [], history: [], records: [] })
  expect((await t.run((ctx) => ctx.db.get(sessionId)))!.preparationContext?.garments).toEqual([])
  // The finished load can still be read.
  expect((await as.query(api.execution.sessionDetail, { sessionId })).textiles).toEqual([expect.objectContaining({ textileId: guest, name: null })])
})
