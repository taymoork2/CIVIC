import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { FunctionReturnType } from 'convex/server'
import { api } from './_generated/api'
import { finishSteps, intakeHousehold, joinHousehold, keyOf, newBackend, planFor, signedIn, startLoad, type Backend, type Caller } from './harness.testing'
import { removePrincipalData } from './identity'
import type { Id } from './_generated/dataModel'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 9, 4, 22, 0)) })
afterEach(() => { vi.useRealTimers() })

async function washed(as: Caller) {
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt])
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'outcome-wash' })
  await finishSteps(as, sessionId)
  await as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'outcome-wash' })
  const record = (await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt }))[0]!
  return { ...home, sessionId, recordId: record._id }
}

const save = (recordId: Id<'washRecords'>, revision = 0, receiptId = 'assessment-receipt-first') => ({ recordId,
  dimension: 'odor' as const, checkedWhen: 'after_drying' as const, result: 'improved' as const, expectedRevision: revision, receiptId })
const audit = (as: Caller, recordId: Id<'washRecords'>) => as.query(api.outcomeAssessments.history, { recordId, dimension: 'odor', checkedWhen: 'after_drying', paginationOpts: { numItems: 50, cursor: null } })

test('small audit pages retain ordered corrections without multiplying their independent wash', async () => {
  const t = newBackend(), as = signedIn(t, 'paged-results')
  const home = await washed(as)
  for (let revision = 0; revision < 7; revision++) await as.mutation(api.outcomeAssessments.save, { ...save(home.recordId, revision, `pagination-correction-${revision}`), result: revision % 2 === 0 ? 'unknown' : 'improved' })
  const revisions: number[] = []
  let cursor: string | null = null
  for (let pageNumber = 0; pageNumber < 4; pageNumber++) {
    const page: FunctionReturnType<typeof api.outcomeAssessments.history> = await as.query(api.outcomeAssessments.history, { recordId: home.recordId, dimension: 'odor', checkedWhen: 'after_drying', paginationOpts: { numItems: 2, cursor } })
    expect(page.page.length).toBeLessThanOrEqual(2)
    revisions.push(...page.page.map((row) => row.revision))
    if (page.isDone) break
    cursor = page.continueCursor
  }
  expect(revisions).toEqual([7, 6, 5, 4, 3, 2, 1])
  expect((await as.query(api.outcomeAssessments.forRecord, { recordId: home.recordId })).map((row) => row.revision)).toEqual([7])
  expect(await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt })).toHaveLength(1)
})

test('each outcome dimension and assessment stage has one current slot, with unknown distinct from a cleared result', async () => {
  const t = newBackend(), as = signedIn(t, 'dimension-results')
  const home = await washed(as)
  expect(await as.query(api.outcomeAssessments.forRecord, { recordId: home.recordId })).toEqual([])
  for (const dimension of ['overall', 'stain', 'appearance', 'odor', 'feel', 'damage'] as const) {
    for (const checkedWhen of ['after_wash', 'after_drying', 'after_wearing'] as const) {
      await as.mutation(api.outcomeAssessments.save, { ...save(home.recordId), dimension, checkedWhen, result: 'unknown', receiptId: `result-${dimension}-${checkedWhen}` })
    }
  }
  const slots = await as.query(api.outcomeAssessments.forRecord, { recordId: home.recordId })
  expect(slots).toHaveLength(18)
  expect(slots.every((row) => row.result === 'unknown' && row.revision === 1)).toBe(true)
  expect((await as.query(api.sessions.garmentRecord, { textileId: home.shirt })).washes[0]?.assessments).toEqual(slots)
  await as.mutation(api.outcomeAssessments.save, { ...save(home.recordId, 1, 'assessment-clear-result'), result: null, note: 'Discard this note when clearing' })
  const cleared = (await as.query(api.outcomeAssessments.forRecord, { recordId: home.recordId })).find((row) => row.dimension === 'odor' && row.checkedWhen === 'after_drying')!
  expect(cleared).toMatchObject({ result: null, revision: 2 })
  expect(cleared.note).toBeUndefined()
  expect((await audit(as, home.recordId)).page.map((row) => row.result)).toEqual([null, 'unknown'])
  const rows = await t.run((ctx) => ctx.db.query('outcomeAssessments').collect())
  expect(new Set(rows.map((row) => row.independentWashId))).toEqual(new Set([home.sessionId]))
  expect(await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt })).toHaveLength(1)
})

test('receipts replay safely after a correction and clear, stale edits and reused receipts cannot rewrite the current observation', async () => {
  const t = newBackend(), as = signedIn(t, 'correct-results')
  const home = await washed(as)
  const plans = await t.run((ctx) => ctx.db.query('plans').collect())
  const firstArgs = { ...save(home.recordId), note: '  Original report  ' }
  const first = await as.mutation(api.outcomeAssessments.save, firstArgs)
  expect(first).toMatchObject({ revision: 1, replay: false })
  expect(await as.mutation(api.outcomeAssessments.save, firstArgs)).toEqual({ ...first, replay: true })
  const correction = { ...save(home.recordId, 1, 'assessment-receipt-correction'), result: 'worse' as const, note: 'Corrected after checking' }
  await as.mutation(api.outcomeAssessments.save, correction)
  expect(await as.mutation(api.outcomeAssessments.save, firstArgs)).toEqual({ ...first, replay: true })
  await expect(as.mutation(api.outcomeAssessments.save, { ...firstArgs, receiptId: 'assessment-stale-client' })).rejects.toThrow('changed')
  await expect(as.mutation(api.outcomeAssessments.save, { ...correction, result: 'improved' })).rejects.toThrow('different assessment')
  const current = await as.query(api.outcomeAssessments.forRecord, { recordId: home.recordId })
  expect(current).toEqual([expect.objectContaining({ result: 'worse', revision: 2, note: 'Corrected after checking' })])
  expect((await audit(as, home.recordId)).page).toEqual([
    expect.objectContaining({ revision: 2, result: 'worse', note: 'Corrected after checking' }),
    expect.objectContaining({ revision: 1, result: 'improved', note: 'Original report' }),
  ])
  const clearArgs = { ...save(home.recordId, 2, 'assessment-receipt-clear'), result: null }
  await as.mutation(api.outcomeAssessments.save, clearArgs)
  await as.mutation(api.outcomeAssessments.save, correction)
  expect((await as.query(api.outcomeAssessments.forRecord, { recordId: home.recordId }))[0]).toMatchObject({ result: null, revision: 3 })
  expect((await audit(as, home.recordId)).page).toHaveLength(3)
  expect(await t.run((ctx) => ctx.db.query('plans').collect())).toEqual(plans)
  await expect(as.query(api.outcomeAssessments.history, { recordId: home.recordId, dimension: 'odor', checkedWhen: 'after_drying', paginationOpts: { numItems: 51, cursor: null } })).rejects.toThrow('50')
  await expect(as.mutation(api.outcomeAssessments.save, { ...save(home.recordId, 3, 'assessment-invalid-revision'), expectedRevision: -1 })).rejects.toThrow('revision')
  await expect(as.mutation(api.outcomeAssessments.save, { ...save(home.recordId, 3, 'assessment-note-too-long'), note: 'x'.repeat(301) })).rejects.toThrow('300')
})

test('household members keep independent reports and audits, and access revocation also refuses old receipt replays', async () => {
  const t = newBackend(), owner = signedIn(t, 'outcome-owner')
  const home = await washed(owner)
  const member = await joinHousehold(t, owner, home.householdId, 'outcome-member', 'Sam')
  const args = save(home.recordId)
  await owner.mutation(api.outcomeAssessments.save, args)
  expect(await member.query(api.outcomeAssessments.forRecord, { recordId: home.recordId })).toEqual([])
  expect((await audit(member, home.recordId)).page).toEqual([])
  await member.mutation(api.outcomeAssessments.save, { ...args, result: 'worse' })
  expect((await owner.query(api.outcomeAssessments.forRecord, { recordId: home.recordId }))[0]?.result).toBe('improved')
  expect((await member.query(api.outcomeAssessments.forRecord, { recordId: home.recordId }))[0]?.result).toBe('worse')
  const outsider = signedIn(t, 'outcome-outsider')
  await expect(outsider.mutation(api.outcomeAssessments.save, args)).rejects.toThrow('Forbidden')
  await expect(audit(outsider, home.recordId)).rejects.toThrow('Forbidden')
  const membership = (await owner.query(api.households.members, { householdId: home.householdId })).find((row) => row.displayName === 'Sam')!
  await owner.mutation(api.households.removeMember, { membershipId: membership.membershipId })
  await expect(member.mutation(api.outcomeAssessments.save, { ...args, result: 'worse' })).rejects.toThrow('Forbidden')
  await expect(member.query(api.outcomeAssessments.forRecord, { recordId: home.recordId })).rejects.toThrow('Forbidden')
  expect((await owner.query(api.outcomeAssessments.forRecord, { recordId: home.recordId }))[0]?.result).toBe('improved')
})

test('two reporters retain independent overall slots after another member saves or clears', async () => {
  const t = newBackend(), owner = signedIn(t, 'overall-owner')
  const home = await washed(owner)
  const member = await joinHousehold(t, owner, home.householdId, 'overall-member', 'Sam')
  const args = { ...save(home.recordId), dimension: 'overall' as const, checkedWhen: 'after_wearing' as const, note: 'Owner result' }
  await owner.mutation(api.outcomeAssessments.save, args)
  await member.mutation(api.outcomeAssessments.save, { ...args, result: 'worse', note: 'Member result' })
  expect((await owner.query(api.sessions.washRecordsForTextile, { textileId: home.shirt }))[0]?.assessments).toEqual([expect.objectContaining({ result: 'improved', note: 'Owner result' })])
  expect((await member.query(api.sessions.garmentRecord, { textileId: home.shirt })).washes[0]?.assessments).toEqual([expect.objectContaining({ result: 'worse', note: 'Member result' })])
  await member.mutation(api.outcomeAssessments.save, { ...args, expectedRevision: 1, receiptId: 'member-overall-clear', result: null })
  expect((await member.query(api.sessions.washRecordsForTextile, { textileId: home.shirt }))[0]?.assessments).toEqual([expect.objectContaining({ result: null, revision: 2 })])
  expect((await owner.query(api.sessions.garmentRecord, { textileId: home.shirt })).washes[0]?.assessments).toEqual([expect.objectContaining({ result: 'improved', note: 'Owner result', revision: 1 })])
})

test('garment deletion drains bounded correction batches and removes current slots, without affecting another garment', async () => {
  const t = newBackend(), as = signedIn(t, 'deleted-garment-outcome')
  const home = await washed(as)
  for (let revision = 0; revision < 131; revision++) {
    await as.mutation(api.outcomeAssessments.save, { ...save(home.recordId, revision, `assessment-correction-${revision}`), result: revision % 2 === 0 ? 'unknown' : 'improved' })
  }
  await as.mutation(api.inventory.deleteTextile, { textileId: home.shirt })
  await expect(as.query(api.outcomeAssessments.forRecord, { recordId: home.recordId })).rejects.toThrow('not found')
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await t.run((ctx) => ctx.db.query('outcomeAssessments').collect())).toEqual([])
  expect(await t.run((ctx) => ctx.db.query('outcomeAssessmentRevisions').collect())).toEqual([])
  expect(await t.run((ctx) => ctx.db.get(home.towel))).not.toBeNull()
})

test('account deletion removes that reporter while preserving another member assessment and household history', async () => {
  const t: Backend = newBackend(), owner = signedIn(t, 'deleted-account-outcome')
  const home = await washed(owner)
  const member = await joinHousehold(t, owner, home.householdId, 'deleted-account-member', 'Sam')
  await owner.mutation(api.outcomeAssessments.save, save(home.recordId))
  await member.mutation(api.outcomeAssessments.save, { ...save(home.recordId), dimension: 'overall', result: 'irritation' })
  const memberKey = await keyOf(member)
  await t.run((ctx) => removePrincipalData(ctx, memberKey))
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  await expect(member.query(api.outcomeAssessments.forRecord, { recordId: home.recordId })).rejects.toThrow('Forbidden')
  expect((await owner.query(api.outcomeAssessments.forRecord, { recordId: home.recordId }))[0]?.result).toBe('improved')
  expect((await owner.query(api.sessions.washRecordsForTextile, { textileId: home.shirt }))[0]?.assessments).toEqual([expect.objectContaining({ dimension: 'odor', result: 'improved' })])
  expect(await t.run((ctx) => ctx.db.query('outcomeAssessments').collect())).toHaveLength(1)
  expect(await t.run((ctx) => ctx.db.query('outcomeAssessmentRevisions').collect())).toHaveLength(1)
  expect(await t.run((ctx) => ctx.db.get(home.shirt))).not.toBeNull()
})

async function stainHelpers(t: Backend, as: Caller, home: Awaited<ReturnType<typeof washed>>) {
  let revision = 0
  const shirt = async () => (await t.run(async (ctx) => (await ctx.db.get(home.shirt))!))
  const stain = (result: 'improved' | 'unchanged' | 'worse' | 'unknown') => as.mutation(api.outcomeAssessments.save, { recordId: home.recordId,
    dimension: 'stain', checkedWhen: 'after_wash', result, expectedRevision: revision, receiptId: `stain-assessment-${revision++}` })
  const completedAt = (await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt }))[0]!.completedAt
  return { shirt, stain, completedAt }
}

test('a stain answer from "How did a wash turn out?" answers the garment’s stain check for that wash only', async () => {
  const t = newBackend(), as = signedIn(t, 'stain-assessment')
  const home = await washed(as)
  const { shirt, stain, completedAt } = await stainHelpers(t, as, home)
  // No stain was flagged: "No change" means nothing changed, and "Better" invents nothing.
  await stain('unchanged')
  await stain('improved')
  expect((await shirt()).stainCheck).toBeUndefined()
  // Worse reads as a new stain: a check opens from the wash, with nothing recorded as tried, and no home try.
  await stain('worse')
  expect((await shirt()).stainCheck).toEqual({ reason: 'stain_other', kind: 'unknown', tried: [], washes: 1, washedAt: completedAt, answer: 'worse', openedBy: 'assessment' })
  await expect(as.mutation(api.closet.resolveStain, { textileIds: [home.shirt], choice: 'try_again' })).rejects.toThrow('got worse')
  await stain('improved')
  expect((await shirt()).stainCheck?.answer).toBe('lighter')
  // Unknown leaves it; the assessment itself is saved as given.
  await stain('unknown')
  expect((await shirt()).stainCheck?.answer).toBe('lighter')
  expect((await as.query(api.outcomeAssessments.forRecord, { recordId: home.recordId })).find((row) => row.dimension === 'stain')?.result).toBe('unknown')
  // A check from a later wash is not answered by an older record.
  await t.run(async (ctx) => ctx.db.patch(home.shirt, { stainCheck: { reason: 'food', kind: 'protein', tried: [], washes: 1, washedAt: completedAt + 1 } }))
  await stain('unchanged')
  expect((await shirt()).stainCheck?.answer).toBeUndefined()
})

test('a stain decided in the app stays decided, and a gone answer re-opens with its tries and dryer hold', async () => {
  const t = newBackend(), as = signedIn(t, 'stain-decided')
  const home = await washed(as)
  const { shirt, stain, completedAt } = await stainHelpers(t, as, home)
  const tried = [{ name: 'Enzyme spray', supplyId: 'protease', chemistry: 'protease' as const, washedOut: true as const }]
  const check = { reason: 'food' as const, kind: 'protein' as const, tried, washes: 2, washedAt: completedAt }
  // Gone, then "No change" while it waits to dry: the same check comes back, and so does its dryer hold.
  const pieceId = await t.run(async (ctx) => {
    await ctx.db.patch(home.shirt, { stainCheck: check })
    return ctx.db.insert('dryingPieces', { householdId: home.householdId, textileId: home.shirt, washSessionId: home.sessionId, washerName: 'Washer', status: 'queued', queuedAt: completedAt })
  })
  await as.mutation(api.closet.answerStainCheck, { textileIds: [home.shirt], answer: 'gone' })
  expect((await shirt()).stainCheck).toBeUndefined()
  await stain('unchanged')
  expect((await shirt()).stainCheck).toEqual({ ...check, answer: 'still_there', openedBy: 'reopened' })
  expect((await shirt()).stainCleared).toBeUndefined()
  expect((await t.run((ctx) => ctx.db.get(pieceId)))?.stained).toBe(true)
  // Try once more is pending: the earlier wash's assessment does not answer the check again.
  await t.run(async (ctx) => ctx.db.patch(home.shirt, { stainCheck: check, flag: { reasons: ['food'], flaggedAt: completedAt, flaggedBy: 'someone' } }))
  await stain('worse')
  expect((await shirt()).stainCheck?.answer).toBeUndefined()
  // Kept as a known mark: no check is re-opened.
  await t.run(async (ctx) => ctx.db.patch(home.shirt, { stainCheck: undefined, flag: undefined, knownStain: { reason: 'food', kind: 'protein', recordedAt: completedAt } }))
  await stain('unchanged')
  await stain('worse')
  expect((await shirt()).stainCheck).toBeUndefined()
})

test('clearing the assessment that opened a stain check removes it, and a re-opened one goes back to gone', async () => {
  const t = newBackend(), as = signedIn(t, 'stain-assessment-undo')
  const home = await washed(as)
  const { shirt, completedAt } = await stainHelpers(t, as, home)
  let revision = 0
  const stain = (result: 'unchanged' | 'worse' | 'irritation' | null) => as.mutation(api.outcomeAssessments.save, { recordId: home.recordId,
    dimension: 'stain', checkedWhen: 'after_wash', result, expectedRevision: revision, receiptId: `stain-undo-${revision++}` })
  const pieceId = await t.run(async (ctx) => ctx.db.insert('dryingPieces', { householdId: home.householdId, textileId: home.shirt, washSessionId: home.sessionId, washerName: 'Washer', status: 'queued', queuedAt: completedAt }))
  const held = async () => (await t.run((ctx) => ctx.db.get(pieceId)))?.stained ?? false
  // A tap on "Worse" by mistake, then cleared: no stain is left behind, and the dryer hold goes with it.
  await stain('worse')
  expect([(await shirt()).stainCheck?.answer, await held()]).toEqual(['worse', true])
  await stain(null)
  expect([(await shirt()).stainCheck ?? null, await held()]).toEqual([null, false])
  // Changed to a result that is not about the stain: the same.
  await stain('worse')
  await stain('irritation')
  expect((await shirt()).stainCheck ?? null).toBeNull()
  // A check answered gone, re-opened by "No change", then cleared: it is gone again, tries kept.
  const tried = [{ name: 'Enzyme spray', supplyId: 'protease', chemistry: 'protease' as const, washedOut: true as const }]
  const check = { reason: 'food' as const, kind: 'protein' as const, tried, washes: 1, washedAt: completedAt }
  await t.run(async (ctx) => ctx.db.patch(home.shirt, { stainCleared: check }))
  await stain('unchanged')
  expect((await shirt()).stainCheck?.answer).toBe('still_there')
  await stain(null)
  expect([(await shirt()).stainCheck ?? null, (await shirt()).stainCleared, await held()]).toEqual([null, check, false])
  // Once the person answers on the garment, the check is theirs and clearing the assessment leaves it.
  await stain('unchanged')
  await as.mutation(api.closet.answerStainCheck, { textileIds: [home.shirt], answer: 'still_there' })
  await stain(null)
  expect((await shirt()).stainCheck).toEqual({ ...check, answer: 'still_there' })
  // Sent to the cleaner from a re-opened check: that choice makes it theirs too, so it is asked again after pickup.
  await t.run(async (ctx) => ctx.db.patch(home.shirt, { stainCheck: undefined, stainCleared: check }))
  await stain('unchanged')
  await t.run(async (ctx) => ctx.db.patch(home.shirt, { status: 'clean' }))
  expect(await as.mutation(api.closet.resolveStain, { textileIds: [home.shirt], choice: 'cleaner' })).toEqual({ changed: 1, skipped: 0 })
  await stain(null)
  expect([(await shirt()).status, (await shirt()).stainCheck]).toEqual(['needs_dry_clean', { ...check, answer: 'still_there' }])
})
