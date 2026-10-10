import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { FunctionArgs } from 'convex/server'
import type { Doc, Id } from './_generated/dataModel'
import { api } from './_generated/api'
import { finishSteps, intakeHousehold, joinHousehold, keyOf, newBackend, planFor, signedIn, startLoad, type Caller } from './harness.testing'
import { removePrincipalData } from './identity'
import { recordedDryerWashRoute, recordedOutcomeContext } from './personalOutcomeContext'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 9, 4, 23, 0)) })
afterEach(() => { vi.useRealTimers() })
type Home = Awaited<ReturnType<typeof intakeHousehold>>

async function homeFor(as: Caller) {
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateTextile, { textileId: home.shirt, kind: 't_shirt', status: 'dirty', soilLevel: 'normal' })
  await as.mutation(api.garmentAdvice.setDecoration, { textileIds: [home.shirt], facts: { kind: 'none', method: 'unknown', manufacturer: '', source: 'inspected synthetic plain shirt', confidence: 'observed' }, expectedRevisions: [{ textileId: home.shirt, revision: 0 }] })
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [],
    capabilities: [{ kind: 'soil_dispersal', status: 'present', variant: 'Synthetic exact detergent', market: 'US', formulationRevision: 'test-revision-1', source: 'synthetic exact-pack disclosure', retrievedAt: Date.now(), scope: 'ingredient_disclosure' }] } })
  return home
}
async function wash(as: Caller, home: Home, result: 'improved' | 'worse' | 'unknown' | 'irritation' = 'improved') {
  vi.advanceTimersByTime(1000)
  await as.mutation(api.inventory.updateTextile, { textileId: home.shirt, status: 'dirty', soilLevel: 'normal' })
  const planned = await planFor(as, home.householdId, [home.shirt], { washGoals: ['odor'] })
  const idempotencyKey = `personal-wash-${Date.now()}`
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey })
  await finishSteps(as, sessionId)
  await as.mutation(api.sessionTime.addMinutes, { sessionId, minutes: 1 })
  await as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey })
  const record = (await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt }))[0]!
  await as.mutation(api.outcomeAssessments.save, { recordId: record._id, dimension: 'odor', checkedWhen: 'after_wash', result, expectedRevision: 0, receiptId: `personal-result-${Date.now()}` })
  return record._id
}
const summaryArgs = (recordId: Id<'washRecords'>, home: Home): FunctionArgs<typeof api.personalAdaptation.forRecord> => ({ recordId, supplyId: home.detergent,
  dimension: 'odor', checkedWhen: 'after_wash', selectedTextileIds: [home.shirt] })

test('three real completed session snapshots yield one private repeated pattern; corrections and clears recalculate it', async () => {
  const t = newBackend(), as = signedIn(t, 'personal-pattern'), home = await homeFor(as)
  const first = await wash(as, home), second = await wash(as, home), third = await wash(as, home)
  const args = summaryArgs(third, home)
  const summary = await as.query(api.personalAdaptation.forRecord, args)
  expect(summary.status).toBe('repeated_pattern')
  expect(summary.counts).toMatchObject({ independentWashes: 3, improved: 3 })
  expect(summary.observations).toHaveLength(3)
  expect(summary.inputHash).toMatch(/^[a-f0-9]{64}$/)
  expect(await as.query(api.personalAdaptation.forRecord, args)).toEqual(summary)
  const plansBefore = await t.run((ctx) => ctx.db.query('plans').collect())
  await as.mutation(api.outcomeAssessments.save, { recordId: first, dimension: 'odor', checkedWhen: 'after_wash', result: 'worse', expectedRevision: 1, receiptId: 'personal-correct-old-result' })
  const corrected = await as.query(api.personalAdaptation.forRecord, args)
  expect(corrected.counts).toMatchObject({ independentWashes: 3, improved: 2, worse: 1 })
  expect(corrected.inputHash).not.toBe(summary.inputHash)
  await as.mutation(api.outcomeAssessments.save, { recordId: second, dimension: 'odor', checkedWhen: 'after_wash', result: null, expectedRevision: 1, receiptId: 'personal-clear-old-result' })
  expect((await as.query(api.personalAdaptation.forRecord, args)).counts.independentWashes).toBe(2)
  expect(await t.run((ctx) => ctx.db.query('plans').collect())).toEqual(plansBefore)
})

test('disable and reset are person/entry scoped and cannot be undone by correcting pre-reset history', async () => {
  const t = newBackend(), as = signedIn(t, 'personal-controls'), home = await homeFor(as)
  const recordId = await wash(as, home)
  const member = await joinHousehold(t, as, home.householdId, 'personal-controls-member', 'Sam')
  const scope = { householdId: home.householdId, textileId: home.shirt }
  const args = summaryArgs(recordId, home)
  const original = await as.query(api.personalAdaptation.forRecord, args)
  expect((await member.query(api.personalAdaptation.forRecord, args)).observations).toEqual([])
  const disabled = await member.mutation(api.personalAdaptation.change, { ...scope, expectedRevision: 0, action: { kind: 'set_enabled', enabled: false } })
  expect(disabled.revision).toBe(1)
  expect((await member.query(api.personalAdaptation.forRecord, args)).status).toBe('disabled')
  expect(await as.query(api.personalAdaptation.forRecord, args)).toEqual(original)
  await expect(member.mutation(api.personalAdaptation.change, { ...scope, expectedRevision: 0, action: { kind: 'set_enabled', enabled: true } })).rejects.toThrow('changed')
  await as.mutation(api.personalAdaptation.change, { householdId: home.householdId, expectedRevision: 0, action: { kind: 'set_enabled', enabled: false } })
  expect((await as.query(api.personalAdaptation.controls, scope)).effective.enabled).toBe(false)
  expect((await as.query(api.personalAdaptation.forRecord, args)).recordsConsidered).toBe(0)
  await as.mutation(api.personalAdaptation.change, { householdId: home.householdId, expectedRevision: 1, action: { kind: 'set_enabled', enabled: true } })
  const reset = await as.mutation(api.personalAdaptation.change, { ...scope, expectedRevision: 0, action: { kind: 'reset' } })
  expect(reset.resetAt).toBe(Date.now())
  vi.advanceTimersByTime(1000)
  await as.mutation(api.outcomeAssessments.save, { recordId, dimension: 'odor', checkedWhen: 'after_wash', result: 'irritation', expectedRevision: 1, receiptId: 'personal-correct-after-reset' })
  expect((await as.query(api.personalAdaptation.forRecord, args)).observations).toEqual([])
  const next = await wash(as, home)
  expect((await as.query(api.personalAdaptation.forRecord, summaryArgs(next, home))).counts.independentWashes).toBe(1)
  expect((await as.query(api.outcomeAssessments.forRecord, { recordId }))[0]?.result).toBe('irritation')
})

test('comparable irritation reports signal reassessment without changing the plan or assigning a replacement', async () => {
  const t = newBackend(), as = signedIn(t, 'personal-negative'), home = await homeFor(as)
  const recordId = await wash(as, home, 'irritation')
  const args = summaryArgs(recordId, home)
  const summary = await as.query(api.personalAdaptation.forRecord, args)
  expect(summary).toMatchObject({ status: 'reassess', suppressOptionalSuggestion: true })
  expect(summary.explanation).toMatch(/does not diagnose.*replacement/)
  await as.mutation(api.outcomeAssessments.save, { recordId, dimension: 'odor', checkedWhen: 'after_wash', result: 'unknown', expectedRevision: 1, receiptId: 'personal-negative-reassessed' })
  expect(await as.query(api.personalAdaptation.forRecord, args)).toMatchObject({ status: 'sparse', suppressOptionalSuggestion: false, counts: { independentWashes: 0, unknown: 1, worse: 0 } })
})

test('missing and changed product, routine, garment, route, timing and machine context do not become comparable evidence', async () => {
  const t = newBackend(), as = signedIn(t, 'personal-context'), home = await homeFor(as)
  const recordId = await wash(as, home)
  const record = await t.run((ctx) => ctx.db.get(recordId))
  expect(record).not.toBeNull()
  const match = (row: Doc<'washRecords'>) => recordedOutcomeContext(row, home.detergent, 'odor', 'after_wash')
  const context = match(record!)
  expect(context).not.toBeNull()
  const activity = record!.activityContext!
  expect(match({ ...record!, activityContext: undefined })).toBeNull()
  expect(match({ ...record!, activityContext: { ...activity, products: activity.products.map((product) => ({ ...product, status: 'skipped' })) } })).toBeNull()
  expect(match({ ...record!, activityContext: { ...activity, products: activity.products.map((product) => ({ ...product, context: { ...product.context!, safety: undefined } })) } })).toBeNull()
  expect(recordedOutcomeContext(record!, home.detergent, 'odor', 'after_drying')).toBeNull()
  const withLaterDryerProduct: Doc<'washRecords'> = { ...record!, drying: { ...record!.drying, outcome: 'tumble_dried', method: 'tumble_dryer', heat: 'low', activityContext: {
    version: 1, runId: 'synthetic-later-drying-run' as Id<'dryingRuns'>, checkedAt: Date.now(), recordedAt: Date.now(), checkedBy: await keyOf(as), telemetry: false,
    displayedStarts: [{ startedAt: Date.now(), minutes: 45 }], start: { version: 1, capturedAt: Date.now(), load: { pieceCount: 1, bulkUnits: 1, fit: 'fits' },
      products: [{ supplyId: home.detergent, name: 'Synthetic later dryer product', context: activity.products[0]!.context! }] },
  } } }
  expect(match(withLaterDryerProduct)).toEqual(context)
  expect(recordedOutcomeContext(withLaterDryerProduct, home.detergent, 'odor', 'after_drying')).toBeNull()
  const variants: Doc<'washRecords'>[] = [
    { ...record!, cycle: 'delicate' },
    { ...record!, plannedTemperatureC: 30 },
    { ...record!, activityContext: { ...activity, cycleMinutesShown: 42 } },
    { ...record!, activityContext: { ...activity, load: { ...activity.load!, pieceCount: 9 } } },
    { ...record!, activityContext: { ...activity, garment: { ...activity.garment!, firstWashState: 'unwashed' } } },
    { ...record!, activityContext: { ...activity, garment: { ...activity.garment!, color: 'Navy' } } },
    { ...record!, activityContext: { ...activity, garment: { ...activity.garment!, soilLevel: 'heavy' } } },
    { ...record!, activityContext: { ...activity, products: activity.products.map((product) => ({ ...product, placement: 'direct_to_drum' })) } },
    { ...record!, activityContext: { ...activity, products: activity.products.map((product) => ({ ...product, context: { ...product.context!, safety: { ...product.context!.safety!, capabilities: product.context!.safety!.capabilities!.map((fact) => ({ ...fact, formulationRevision: 'test-revision-2' })) } } })) } },
  ]
  for (const variant of variants) expect(match(variant)).not.toEqual(context)
})

test('partial and full cap fills remain distinct personal outcome contexts', async () => {
  const t = newBackend(), as = signedIn(t, 'personal-mark-fraction'), home = await homeFor(as)
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, measure: { kind: 'cap', marks: [{ label: '3' }] } })
  await as.mutation(api.inventory.saveLabelDirections, { supplyId: home.detergent, measure: { kind: 'cap', marks: [{ label: '3' }] },
    stage: 'wash', placement: 'detergent_compartment', timing: 'before cycle start', provenance: { source: 'synthetic cap directions', confidence: 'verified' },
    rows: [{ cells: [{ amount: 1, unit: 'cap', mark: '3', fractionOfMark: 0.8 }] }] })
  const recordId = await wash(as, home)
  const record = (await t.run((ctx) => ctx.db.get(recordId)))!
  const partial = recordedOutcomeContext(record, home.detergent, 'odor', 'after_wash')
  expect(partial).not.toBeNull()
  const full = (fractionOfMark?: number): Doc<'washRecords'> => ({ ...record, activityContext: { ...record.activityContext!,
    products: record.activityContext!.products.map((product) => ({ ...product, fractionOfMark })) } })
  const fullContext = recordedOutcomeContext(full(), home.detergent, 'odor', 'after_wash')
  expect(fullContext).not.toBeNull()
  expect(fullContext).not.toEqual(partial)
  expect(recordedOutcomeContext(full(1), home.detergent, 'odor', 'after_wash')).toEqual(fullContext)
  expect(recordedOutcomeContext(full(1.2), home.detergent, 'odor', 'after_wash')).toBeNull()
})

test('native dose qualifiers and construction facts keep outcome comparisons separate', async () => {
  const t = newBackend(), as = signedIn(t, 'personal-native-route'), home = await homeFor(as)
  const recordId = await wash(as, home)
  const record = (await t.run((ctx) => ctx.db.get(recordId)))!
  const doseVariants = [
    { amount: 1, unit: 'cap', mark: '3' },
    { amount: 1, unit: 'cap', mark: '3', target: 'below' as const },
    { amount: 1, unit: 'cap', mark: '3', target: 'just_below' as const },
    { amount: 0.25, unit: 'cup', approximate: true },
    { amount: 1, unit: 'cap', mark: '3', fractionOfMark: 0.5 },
  ]
  const withDose = (dose: { amount: number; unit: string; mark?: string; target?: 'below' | 'just_below'; approximate?: boolean; fractionOfMark?: number }): Doc<'washRecords'> => ({ ...record, activityContext: { ...record.activityContext!,
    products: record.activityContext!.products.map((product) => ({ ...product, ...dose })) } })
  const washContexts = doseVariants.map((dose) => recordedOutcomeContext(withDose(dose), home.detergent, 'odor', 'after_wash'))
  const dryerKeys = doseVariants.map((dose) => recordedDryerWashRoute(withDose(dose)))
  expect(washContexts.every((context) => context !== null)).toBe(true)
  expect(dryerKeys.every((key) => key !== null)).toBe(true)
  expect(new Set(washContexts.map((context) => context!.routeKey)).size).toBe(5)
  expect(new Set(dryerKeys).size).toBe(5)
  const explicitlyExact = withDose({ ...doseVariants[0]!, approximate: false })
  expect(recordedDryerWashRoute(explicitlyExact)).toBe(dryerKeys[0])
  expect(recordedOutcomeContext(explicitlyExact, home.detergent, 'odor', 'after_wash')).toEqual(washContexts[0])
  const constructed: Doc<'washRecords'> = { ...record, activityContext: { ...record.activityContext!, garment: { ...record.activityContext!.garment!,
    decoration: { ...record.activityContext!.garment!.decoration!, construction: { zipper: { presence: 'present', confidence: 'observed', source: 'checked synthetic zipper' } } } } } }
  const original = recordedOutcomeContext(record, home.detergent, 'odor', 'after_wash')!
  expect(recordedOutcomeContext(constructed, home.detergent, 'odor', 'after_wash')?.garmentKey).not.toBe(original.garmentKey)
})

test('the bounded recent window refuses promotion when history is truncated; selection ordering is stable', async () => {
  const t = newBackend(), as = signedIn(t, 'personal-bounded'), home = await homeFor(as)
  const recordId = await wash(as, home)
  const original = await t.run((ctx) => ctx.db.get(recordId))
  await t.run(async (ctx) => {
    const { _id: _id, _creationTime: _creationTime, ...fields } = original!
    for (let index = 0; index < 100; index++) await ctx.db.insert('washRecords', { ...fields, completedAt: fields.completedAt + index + 1 })
  })
  const args = summaryArgs(recordId, home)
  const summary = await as.query(api.personalAdaptation.forRecord, args)
  expect(summary).toMatchObject({ status: 'sparse', historyTruncated: true, recordsConsidered: 96 })
  expect(summary.explanation).toMatch(/bounded recent history/)
  const withSecond = { ...args, selectedTextileIds: [home.shirt, home.towel] }
  expect(await as.query(api.personalAdaptation.forRecord, withSecond)).toEqual(await as.query(api.personalAdaptation.forRecord, { ...withSecond, selectedTextileIds: [home.towel, home.shirt] }))
  await expect(as.query(api.personalAdaptation.forRecord, { ...args, selectedTextileIds: [home.shirt, home.shirt] })).rejects.toThrow('distinct')
})

test('an older later-stage negative report survives the recent wash window; corrections and private resets remove its influence', async () => {
  const t = newBackend(), as = signedIn(t, 'personal-old-negative'), home = await homeFor(as)
  const recordId = await wash(as, home)
  const original = await t.run((ctx) => ctx.db.get(recordId))
  await t.run(async (ctx) => {
    const { _id: _id, _creationTime: _creationTime, ...fields } = original!
    for (let index = 0; index < 100; index++) await ctx.db.insert('washRecords', { ...fields, completedAt: fields.completedAt + index + 1 })
  })
  await as.mutation(api.outcomeAssessments.save, { recordId, dimension: 'damage', checkedWhen: 'after_wearing', result: 'damage', expectedRevision: 0, receiptId: 'personal-old-negative-report' })
  const args = summaryArgs(recordId, home)
  const summary = await as.query(api.personalAdaptation.forRecord, args)
  expect(summary).toMatchObject({ status: 'reassess', suppressOptionalSuggestion: true, historyTruncated: true, negativeHistoryTruncated: false, recordsConsidered: 97 })
  expect(summary.observations).toHaveLength(1)
  expect(summary.observations[0]).toMatchObject({ recordId, result: 'damage', revision: 1 })
  expect(summary.counts.independentWashes).toBe(0)
  const changedRevisionTarget = await t.run(async (ctx) => {
    const { _id: _id, _creationTime: _creationTime, ...fields } = original!
    const activity = fields.activityContext!
    return ctx.db.insert('washRecords', { ...fields, activityContext: { ...activity, products: activity.products.map((product) => ({
      ...product, context: { ...product.context!, safety: { ...product.context!.safety!, capabilities: product.context!.safety!.capabilities!.map((fact) => ({ ...fact, formulationRevision: 'different-exact-revision' })) } },
    })) }, completedAt: fields.completedAt + 200 })
  })
  expect((await as.query(api.personalAdaptation.forRecord, { ...args, recordId: changedRevisionTarget })).suppressOptionalSuggestion).toBe(false)
  const member = await joinHousehold(t, as, home.householdId, 'personal-old-negative-member', 'Sam')
  expect((await member.query(api.personalAdaptation.forRecord, args)).suppressOptionalSuggestion).toBe(false)
  await as.mutation(api.outcomeAssessments.save, { recordId, dimension: 'damage', checkedWhen: 'after_wearing', result: null, expectedRevision: 1, receiptId: 'personal-old-negative-clear' })
  expect((await as.query(api.personalAdaptation.forRecord, args)).suppressOptionalSuggestion).toBe(false)
  await as.mutation(api.outcomeAssessments.save, { recordId, dimension: 'damage', checkedWhen: 'after_wearing', result: 'irritation', expectedRevision: 2, receiptId: 'personal-old-negative-reentered' })
  expect((await as.query(api.personalAdaptation.forRecord, args)).suppressOptionalSuggestion).toBe(true)
  vi.advanceTimersByTime(1000)
  await as.mutation(api.personalAdaptation.change, { householdId: home.householdId, textileId: home.shirt, expectedRevision: 0, action: { kind: 'reset' } })
  await as.mutation(api.outcomeAssessments.save, { recordId, dimension: 'damage', checkedWhen: 'after_wearing', result: 'damage', expectedRevision: 3, receiptId: 'personal-old-negative-post-reset' })
  expect(await as.query(api.personalAdaptation.forRecord, args)).toMatchObject({ suppressOptionalSuggestion: false, negativeHistoryTruncated: false, observations: [], recordsConsidered: 0 })
})

test('negative report reads remain bounded; an incomplete check withholds optional influence until reviewed or reset', async () => {
  const t = newBackend(), as = signedIn(t, 'personal-negative-bound'), home = await homeFor(as)
  const recordId = await wash(as, home)
  const reporterKey = await keyOf(as)
  const original = await t.run((ctx) => ctx.db.get(recordId))
  await t.run(async (ctx) => {
    const { _id: _id, _creationTime: _creationTime, ...fields } = original!
    for (let index = 0; index < 65; index++) {
      const id = await ctx.db.insert('washRecords', { ...fields, cycle: 'different noncomparable cycle', completedAt: fields.completedAt + index + 1 })
      await ctx.db.insert('outcomeAssessments', { householdId: home.householdId, textileId: home.shirt, recordId: id,
        independentWashId: fields.sessionId, reporterKey, dimension: 'damage', checkedWhen: 'after_wearing', result: 'damage',
        revision: 1, recordedAt: Date.now(), completedAt: fields.completedAt + index + 1 })
    }
  })
  const args = summaryArgs(recordId, home)
  const summary = await as.query(api.personalAdaptation.forRecord, args)
  expect(summary).toMatchObject({ status: 'sparse', historyTruncated: false, negativeHistoryTruncated: true, suppressOptionalSuggestion: true })
  expect(summary.explanation).toMatch(/could not review all/)
  expect(summary.observations).toHaveLength(1)
  expect(summary.recordsConsidered).toBe(66)
  vi.advanceTimersByTime(1000)
  await as.mutation(api.personalAdaptation.change, { householdId: home.householdId, textileId: home.shirt, expectedRevision: 0, action: { kind: 'reset' } })
  expect(await as.query(api.personalAdaptation.forRecord, args)).toMatchObject({ negativeHistoryTruncated: false, suppressOptionalSuggestion: false, observations: [], recordsConsidered: 0 })
})

test('unbound fixture negatives cannot prove their absence; correcting a slot binds its actual wash time', async () => {
  const t = newBackend(), as = signedIn(t, 'personal-unbound-negative'), home = await homeFor(as)
  const recordId = await wash(as, home)
  await as.mutation(api.outcomeAssessments.save, { recordId, dimension: 'damage', checkedWhen: 'after_wearing', result: 'damage', expectedRevision: 0, receiptId: 'personal-unbound-negative-result' })
  const negative = (await as.query(api.outcomeAssessments.forRecord, { recordId })).find((row) => row.result === 'damage')!
  await t.run((ctx) => ctx.db.patch(negative.assessmentId, { completedAt: undefined }))
  const args = summaryArgs(recordId, home)
  expect(await as.query(api.personalAdaptation.forRecord, args)).toMatchObject({ status: 'reassess', negativeHistoryTruncated: true, suppressOptionalSuggestion: true })
  await as.mutation(api.outcomeAssessments.save, { recordId, dimension: 'damage', checkedWhen: 'after_wearing', result: 'unknown', expectedRevision: 1, receiptId: 'personal-unbound-negative-correction' })
  expect(await as.query(api.personalAdaptation.forRecord, args)).toMatchObject({ negativeHistoryTruncated: false, suppressOptionalSuggestion: false })
  expect((await t.run((ctx) => ctx.db.get(negative.assessmentId)))?.completedAt).toBe((await t.run((ctx) => ctx.db.get(recordId)))?.completedAt)
})

test('wrong household/profile and revoked membership are refused; deletion removes the private controls', async () => {
  const t = newBackend(), as = signedIn(t, 'personal-access'), home = await homeFor(as)
  const recordId = await wash(as, home)
  const outsider = signedIn(t, 'personal-outsider'), outside = await intakeHousehold(outsider)
  const args = summaryArgs(recordId, home)
  await expect(outsider.query(api.personalAdaptation.forRecord, args)).rejects.toThrow('Forbidden')
  await expect(as.mutation(api.personalAdaptation.change, { householdId: home.householdId, textileId: outside.shirt, expectedRevision: 0, action: { kind: 'reset' } })).rejects.toThrow('Forbidden')
  await expect(as.query(api.personalAdaptation.forRecord, { ...args, selectedTextileIds: [home.shirt, outside.shirt] })).rejects.toThrow('Forbidden')
  const otherProfile = await as.mutation(api.inventory.createWearer, { householdId: home.householdId, name: 'Other wearer', kind: 'adult' })
  await as.mutation(api.inventory.updateTextile, { textileId: home.towel, wearerId: otherProfile })
  await expect(as.query(api.personalAdaptation.forRecord, { ...args, selectedTextileIds: [home.shirt, home.towel] })).rejects.toThrow('same profile')
  const member = await joinHousehold(t, as, home.householdId, 'personal-revoked', 'Sam')
  await member.mutation(api.personalAdaptation.change, { householdId: home.householdId, expectedRevision: 0, action: { kind: 'reset' } })
  const memberships = await as.query(api.households.members, { householdId: home.householdId })
  await as.mutation(api.households.removeMember, { membershipId: memberships.find((row) => row.displayName === 'Sam')!.membershipId })
  await expect(member.query(api.personalAdaptation.forRecord, args)).rejects.toThrow('Forbidden')
  await expect(member.query(api.personalAdaptation.controls, { householdId: home.householdId })).rejects.toThrow('Forbidden')
  const memberKey = await keyOf(member)
  await t.run((ctx) => removePrincipalData(ctx, memberKey))
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await t.run((ctx) => ctx.db.query('personalAdaptationPreferences').collect())).toEqual([])
  await as.mutation(api.personalAdaptation.change, { householdId: home.householdId, textileId: home.shirt, expectedRevision: 0, action: { kind: 'set_enabled', enabled: false } })
  await as.mutation(api.inventory.deleteTextile, { textileId: home.shirt })
  expect(await t.run((ctx) => ctx.db.query('personalAdaptationPreferences').collect())).toEqual([])
  await expect(as.query(api.personalAdaptation.forRecord, args)).rejects.toThrow('not found')
})

test('a matching group changes every member in one transaction and refuses when any member is stale', async () => {
  const t = newBackend(), as = signedIn(t, 'personal-group'), home = await intakeHousehold(as)
  const twin = await as.mutation(api.inventory.createTextile, { householdId: home.householdId, name: 'White tee', color: 'White', colorGroup: 'light', firstWash: false })
  const group = { householdId: home.householdId, textileIds: [home.shirt, twin] }
  await as.mutation(api.personalAdaptation.change, { householdId: home.householdId, textileId: twin, expectedRevision: 0, action: { kind: 'set_enabled', enabled: false } })
  const mixed = await as.query(api.personalAdaptation.controls, group)
  expect(mixed.members.map((member) => [member.enabled, member.revision])).toEqual([[true, 0], [false, 1]])
  expect(mixed.scope.enabled).toBe(false)
  const rowsBefore = await t.run((ctx) => ctx.db.query('personalAdaptationPreferences').collect())
  await expect(as.mutation(api.personalAdaptation.change, { ...group, expectedRevisions: [{ textileId: home.shirt, revision: 0 }, { textileId: twin, revision: 0 }], action: { kind: 'set_enabled', enabled: true } })).rejects.toThrow('changed')
  expect(await t.run((ctx) => ctx.db.query('personalAdaptationPreferences').collect())).toEqual(rowsBefore)
  await expect(as.mutation(api.personalAdaptation.change, { ...group, expectedRevisions: [{ textileId: home.shirt, revision: 0 }], action: { kind: 'reset' } })).rejects.toThrow('expected revision')
  const enabled = await as.mutation(api.personalAdaptation.change, { ...group, expectedRevisions: mixed.members.map(({ textileId, revision }) => ({ textileId, revision })), action: { kind: 'set_enabled', enabled: true } })
  expect(enabled.members.map((member) => [member.enabled, member.revision])).toEqual([[true, 1], [true, 2]])
  expect(enabled.enabled).toBe(true)
  const after = await as.query(api.personalAdaptation.controls, group)
  expect(after.scope.enabled).toBe(true)
  expect(after.members.every((member) => member.enabled)).toBe(true)
  expect((await as.query(api.personalAdaptation.controls, { householdId: home.householdId, textileId: twin })).scope).toEqual({ enabled: true, resetAt: 0, revision: 2 })
  await expect(as.query(api.personalAdaptation.controls, { householdId: home.householdId, textileIds: [twin, twin] })).rejects.toThrow('distinct')
})

test('a load-sized matching group of 20 pieces reads and changes atomically; more than 96 is refused', async () => {
  const t = newBackend(), as = signedIn(t, 'personal-large-group'), home = await intakeHousehold(as)
  const socks: Id<'textiles'>[] = []
  for (let index = 0; index < 20; index++) socks.push(await as.mutation(api.inventory.createTextile, { householdId: home.householdId, name: 'Socks', color: 'White', colorGroup: 'light', firstWash: false }))
  const group = { householdId: home.householdId, textileIds: socks }
  const before = await as.query(api.personalAdaptation.controls, group)
  expect(before.members).toHaveLength(20)
  const off = await as.mutation(api.personalAdaptation.change, { ...group, expectedRevisions: before.members.map(({ textileId, revision }) => ({ textileId, revision })), action: { kind: 'set_enabled', enabled: false } })
  expect(off.members.every((member) => !member.enabled && member.revision === 1)).toBe(true)
  const after = await as.query(api.personalAdaptation.controls, group)
  expect(after.scope.enabled).toBe(false)
  const rowsBefore = await t.run((ctx) => ctx.db.query('personalAdaptationPreferences').collect())
  const stale = after.members.map(({ textileId, revision }, index) => ({ textileId, revision: index === 19 ? 0 : revision }))
  await expect(as.mutation(api.personalAdaptation.change, { ...group, expectedRevisions: stale, action: { kind: 'reset' } })).rejects.toThrow('changed')
  expect(await t.run((ctx) => ctx.db.query('personalAdaptationPreferences').collect())).toEqual(rowsBefore)
  await expect(as.query(api.personalAdaptation.controls, { householdId: home.householdId, textileIds: Array.from({ length: 97 }, () => socks[0]!) })).rejects.toThrow('96')
})
