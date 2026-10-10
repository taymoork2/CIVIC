import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'
import { sha256 } from '@washcloset/planner'
import type { Doc, Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server'
import { authorize, type Action, type ReadCtx } from './access'
import { fail } from './errors'
import { principalFromAuth } from './principal'
import { assessedResult, assessmentRevisionView, assessmentView, outcomeDimension, outcomeStage } from './outcomeValues'
import { erasePersonalGuidance } from './personalPlanStorage'
import { invalidatePlans } from './plans'

type Choice = { recordId: Id<'washRecords'>; dimension: Infer<typeof outcomeDimension>; checkedWhen: Infer<typeof outcomeStage>;
  result: Infer<typeof assessedResult>; note?: string; expectedRevision: number; receiptId: string }

async function authorizedRecord(ctx: ReadCtx, action: Action, recordId: Id<'washRecords'>) {
  const record = await ctx.db.get(recordId)
  if (record === null) fail('not_found', 'Wash record not found')
  const textile = (await authorize(ctx, action, { textileId: record.textileId })).textile
  if (record.householdId !== textile.householdId) fail('forbidden', 'Forbidden')
  return { record, actor: await principalFromAuth(ctx.auth) }
}

/** Only the current person's slots are returned; there are at most six dimensions × three stages. */
export async function ownAssessments(ctx: ReadCtx, recordId: Id<'washRecords'>, reporterKey: string): Promise<Infer<typeof assessmentView>[]> {
  const rows = await ctx.db.query('outcomeAssessments').withIndex('by_record_reporter', (q) => q.eq('recordId', recordId).eq('reporterKey', reporterKey)).take(19)
  if (rows.length > 18) fail('conflict', 'Assessment slots need reconciliation')
  return rows.map((row) => ({ assessmentId: row._id, dimension: row.dimension, checkedWhen: row.checkedWhen,
    result: row.result, ...(row.note === undefined ? {} : { note: row.note }), revision: row.revision, recordedAt: row.recordedAt }))
}

/**
 * A stain answer from "How did a wash turn out?" is the same as "Stain gone?" for the garment's latest wash:
 * improved is lighter, unchanged is still there, worse is worse. A decided piece stays decided: a retry waiting in
 * the hamper, a kept mark, or a piece back in use. Without an open check, one is re-opened only from a check
 * answered gone for that wash (keeping its tries), or opened when the stain got worse, which reads as a new one;
 * "No change" on a piece that had no stain means nothing changed. A re-opened stain keeps its dryer hold.
 * A check the assessment opened goes again when its result is cleared or is no longer a stain answer
 * (irritation or damage); "Not sure" leaves it as it is.
 */
async function stainFromAssessment(ctx: MutationCtx, record: Doc<'washRecords'>, args: Choice) {
  if (args.dimension !== 'stain' || args.checkedWhen === 'after_wearing') return
  const answer = args.result === 'improved' ? 'lighter' as const : args.result === 'unchanged' ? 'still_there' as const : args.result === 'worse' ? 'worse' as const : null
  const textile = await ctx.db.get(record.textileId)
  if (textile === null || textile.flag !== undefined) return
  const check = textile.stainCheck
  const holds = async (stained: true | undefined) => {
    const pieces = await ctx.db.query('dryingPieces').withIndex('by_wash_session', (q) => q.eq('washSessionId', record.sessionId)).collect()
    for (const piece of pieces) if (piece.textileId === textile._id && piece.status === 'queued') await ctx.db.patch(piece._id, { stained })
    await invalidatePlans(ctx, record.householdId)
  }
  if (check !== undefined) {
    if (check.washedAt !== record.completedAt) return
    if (answer !== null) await ctx.db.patch(textile._id, { stainCheck: { ...check, answer } })
    else if (check.openedBy !== undefined && args.result !== 'unknown') {
      const { answer: _answer, openedBy, ...before } = check
      await ctx.db.patch(textile._id, { stainCheck: undefined, ...(openedBy === 'reopened' ? { stainCleared: before } : {}) })
      await holds(undefined)
    }
    return
  }
  if (answer === null || textile.knownStain !== undefined || !['clean', 'hanging'].includes(textile.status) || textile.lastCleanedAt !== record.completedAt || answer === 'lighter') return
  const cleared = textile.stainCleared?.washedAt === record.completedAt ? textile.stainCleared : undefined
  if (cleared === undefined && args.result !== 'worse') return
  await ctx.db.patch(textile._id, { stainCleared: undefined,
    stainCheck: { ...(cleared ?? { reason: 'stain_other' as const, kind: 'unknown' as const, tried: [], washes: 1, washedAt: record.completedAt }), answer, openedBy: cleared === undefined ? 'assessment' as const : 'reopened' as const } })
  await holds(true)
}

async function writeAssessment(ctx: MutationCtx, args: Choice) {
  const { record, actor } = await authorizedRecord(ctx, 'textile.edit', args.recordId)
  if (args.note !== undefined && args.note.length > 300) fail('invalid', 'Keep the assessment to 300 characters')
  if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0) fail('invalid', 'Invalid assessment revision')
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(args.receiptId)) fail('invalid', 'Invalid assessment receipt')
  const note = args.result === null ? undefined : args.note?.trim() || undefined
  const payloadHash = sha256(JSON.stringify([args.recordId, args.dimension, args.checkedWhen, args.result, note ?? null, args.expectedRevision]))
  const receipt = await ctx.db.query('outcomeAssessmentRevisions').withIndex('by_reporter_receipt', (q) => q.eq('reporterKey', actor.key).eq('receiptId', args.receiptId)).unique()
  if (receipt !== null) {
    if (receipt.payloadHash !== payloadHash) fail('conflict', 'This receipt belongs to a different assessment')
    return { assessmentId: receipt.assessmentId, revision: receipt.revision, replay: true }
  }
  const current = await ctx.db.query('outcomeAssessments').withIndex('by_slot', (q) => q.eq('recordId', record._id).eq('reporterKey', actor.key).eq('dimension', args.dimension).eq('checkedWhen', args.checkedWhen)).unique()
  if (args.expectedRevision !== (current?.revision ?? 0)) fail('conflict', 'This assessment changed; review the latest result before saving')
  const revision = (current?.revision ?? 0) + 1
  const recordedAt = Date.now()
  const value = { householdId: record.householdId, textileId: record.textileId, recordId: record._id,
    independentWashId: record.sessionId, reporterKey: actor.key, dimension: args.dimension, checkedWhen: args.checkedWhen,
    result: args.result, ...(note === undefined ? {} : { note }), revision, recordedAt, completedAt: record.completedAt }
  const assessmentId = current === null ? await ctx.db.insert('outcomeAssessments', value) : current._id
  if (current !== null) await ctx.db.patch(current._id, { ...value, note })
  await ctx.db.insert('outcomeAssessmentRevisions', { assessmentId, textileId: record.textileId, reporterKey: actor.key, revision,
    result: args.result, ...(note === undefined ? {} : { note }), recordedAt,
    receiptId: args.receiptId, payloadHash })
  await stainFromAssessment(ctx, record, args)
  return { assessmentId, revision, replay: false }
}

/** A null result clears the slot; unknown is a distinct saved observation. Neither means failure. */
export const save = mutation({
  args: { recordId: v.id('washRecords'), dimension: outcomeDimension, checkedWhen: outcomeStage, result: assessedResult,
    note: v.optional(v.string()), expectedRevision: v.number(), receiptId: v.string() },
  returns: v.object({ assessmentId: v.id('outcomeAssessments'), revision: v.number(), replay: v.boolean() }),
  handler: writeAssessment,
})

export const forRecord = query({
  args: { recordId: v.id('washRecords') }, returns: v.array(assessmentView),
  handler: async (ctx, args) => { const { actor } = await authorizedRecord(ctx, 'textile.read', args.recordId); return ownAssessments(ctx, args.recordId, actor.key) },
})

/** Audit pages are private to their reporter and remain household-authorized on every read. */
export const history = query({
  args: { recordId: v.id('washRecords'), dimension: outcomeDimension, checkedWhen: outcomeStage, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(assessmentRevisionView),
  handler: async (ctx, args) => {
    const { actor } = await authorizedRecord(ctx, 'textile.read', args.recordId)
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) fail('invalid', 'Request between 1 and 50 corrections')
    const slot = await ctx.db.query('outcomeAssessments').withIndex('by_slot', (q) => q.eq('recordId', args.recordId).eq('reporterKey', actor.key).eq('dimension', args.dimension).eq('checkedWhen', args.checkedWhen)).unique()
    if (slot === null) return { page: [], isDone: true, continueCursor: '' }
    const page = await ctx.db.query('outcomeAssessmentRevisions').withIndex('by_assessment_revision', (q) => q.eq('assessmentId', slot._id)).order('desc').paginate({ ...args.paginationOpts, maximumRowsRead: 100, maximumBytesRead: 64_000 })
    // Preserve Convex's split metadata so a live page can split safely as corrections arrive.
    return { ...page, page: page.page.map((row) => ({ revision: row.revision, result: row.result, ...(row.note === undefined ? {} : { note: row.note }), recordedAt: row.recordedAt })) }
  },
})

const eraseScope = v.union(v.object({ textileId: v.id('textiles') }), v.object({ reporterKey: v.string() }))

/** Bounded batches keep deletion independent of the number of historic corrections. */
export async function eraseOutcomeData(ctx: MutationCtx, scope: Infer<typeof eraseScope>): Promise<void> {
  await erasePersonalGuidance(ctx, 'textileId' in scope ? scope : { principalKey: scope.reporterKey })
  const limit = 128
  const byTextile = 'textileId' in scope
  const latest = byTextile
    ? await ctx.db.query('outcomeAssessments').withIndex('by_textile', (q) => q.eq('textileId', scope.textileId)).take(limit)
    : await ctx.db.query('outcomeAssessments').withIndex('by_reporter', (q) => q.eq('reporterKey', scope.reporterKey)).take(limit)
  const audit = byTextile
    ? await ctx.db.query('outcomeAssessmentRevisions').withIndex('by_textile', (q) => q.eq('textileId', scope.textileId)).take(limit)
    : await ctx.db.query('outcomeAssessmentRevisions').withIndex('by_reporter', (q) => q.eq('reporterKey', scope.reporterKey)).take(limit)
  const coarse = byTextile ? [] : await ctx.db.query('washRecords').withIndex('by_outcome_reporter', (q) => q.eq('outcome.recordedBy', scope.reporterKey)).take(limit)
  const preferences = byTextile
    ? await ctx.db.query('personalAdaptationPreferences').withIndex('by_textile', (q) => q.eq('textileId', scope.textileId)).take(limit)
    : await ctx.db.query('personalAdaptationPreferences').withIndex('by_principal', (q) => q.eq('principalKey', scope.reporterKey)).take(limit)
  for (const row of [...latest, ...audit, ...preferences]) await ctx.db.delete(row._id)
  for (const record of coarse) await ctx.db.patch(record._id, { outcome: undefined })
  if (latest.length === limit || audit.length === limit || coarse.length === limit || preferences.length === limit) await ctx.scheduler.runAfter(0, internal.outcomeAssessments.eraseBatch, { scope })
}

export const eraseBatch = internalMutation({ args: { scope: eraseScope }, returns: v.null(), handler: async (ctx, args) => { await eraseOutcomeData(ctx, args.scope); return null } })
