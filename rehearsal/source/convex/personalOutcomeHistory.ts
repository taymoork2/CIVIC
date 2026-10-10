import { personalOutcomePolicyVersion, sha256, stableJson, summarizePersonalOutcomes, type PersonalObservation, type PersonalOutcomeContext } from '@washcloset/planner'
import type { Infer } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import type { ReadCtx } from './access'
import { ownAssessments } from './outcomeAssessments'
import { assessmentView } from './outcomeValues'
import { recordedAdverseOutcomeContext, recordedOutcomeContext } from './personalOutcomeContext'

const defaults = { enabled: true, resetAt: 0, revision: 0 }
export async function personalPreference(ctx: ReadCtx, householdId: Id<'households'>, principalKey: string, textileId: Id<'textiles'> | null) {
  const row = await ctx.db.query('personalAdaptationPreferences').withIndex('by_scope', (q) => q.eq('householdId', householdId).eq('principalKey', principalKey).eq('textileId', textileId)).unique()
  return row === null ? defaults : { enabled: row.enabled, resetAt: row.resetAt, revision: row.revision }
}
type Slot = Infer<typeof assessmentView>
type History = {
  ids: Id<'textiles'>[]; principalKey: string; global: typeof defaults; scopes: Map<Id<'textiles'>, typeof defaults>;
  rows: { record: Doc<'washRecords'>; assessment: Slot }[];
  historyTruncated: boolean; negativeHistoryTruncated: boolean; recordsConsidered: number;
  bySupply: Map<Id<'supplies'>, PersonalObservation[]>
}

/** Callers authorize all selected entries first. One bounded read supports every candidate/context. */
export async function loadPersonalHistory(ctx: ReadCtx, householdId: Id<'households'>, principalKey: string, ids: Id<'textiles'>[], read: boolean, readTarget?: Id<'textiles'>): Promise<History> {
  const global = await personalPreference(ctx, householdId, principalKey, null)
  const scopes = new Map(await Promise.all(ids.map(async (id) => [id, await personalPreference(ctx, householdId, principalKey, id)] as const)))
  const history: History = { ids, principalKey, global, scopes, rows: [], historyTruncated: false, negativeHistoryTruncated: false, recordsConsidered: 0, bySupply: new Map() }
  if (!read || !global.enabled || readTarget !== undefined && !scopes.get(readTarget)!.enabled) return history
  const perEntryLimit = Math.floor(96 / ids.length)
  const pages = await Promise.all(ids.map((id) => scopes.get(id)!.enabled
    ? ctx.db.query('washRecords').withIndex('by_textile', (q) => q.eq('textileId', id).gt('completedAt', Math.max(global.resetAt, scopes.get(id)!.resetAt))).order('desc').take(perEntryLimit + 1) : []))
  history.historyTruncated = pages.some((page) => page.length > perEntryLimit)
  const negativePerResultLimit = Math.floor(128 / (2 * ids.length))
  const negativePages = await Promise.all(ids.flatMap((id) => scopes.get(id)!.enabled
    ? (['damage', 'irritation'] as const).map((result) => ctx.db.query('outcomeAssessments')
      .withIndex('by_textile_reporter_result', (q) => q.eq('textileId', id).eq('reporterKey', principalKey).eq('result', result)
        .gt('completedAt', Math.max(global.resetAt, scopes.get(id)!.resetAt))).order('desc').take(negativePerResultLimit + 1)) : []))
  const unboundNegatives = await Promise.all(ids.flatMap((id) => scopes.get(id)!.enabled
    ? (['damage', 'irritation'] as const).map((result) => ctx.db.query('outcomeAssessments')
      .withIndex('by_textile_reporter_result', (q) => q.eq('textileId', id).eq('reporterKey', principalKey).eq('result', result).eq('completedAt', undefined)).take(1)) : []))
  history.negativeHistoryTruncated = negativePages.some((page) => page.length > negativePerResultLimit) || unboundNegatives.some((page) => page.length > 0)
  const recent = pages.flatMap((page) => page.slice(0, perEntryLimit))
  const recordsById = new Map(recent.map((row) => [row._id, row]))
  const negativeRows = negativePages.flatMap((page) => page.slice(0, negativePerResultLimit))
  const extraIds = [...new Set(negativeRows.map((row) => row.recordId))].filter((id) => !recordsById.has(id))
  for (const row of await Promise.all(extraIds.map((id) => ctx.db.get(id)))) {
    if (row === null || row.householdId !== householdId || !ids.includes(row.textileId)) continue
    const scope = scopes.get(row.textileId)!
    if (scope.enabled && row.completedAt > Math.max(global.resetAt, scope.resetAt)) recordsById.set(row._id, row)
  }
  history.rows = (await Promise.all(recent.map(async (record) => (await ownAssessments(ctx, record._id, principalKey)).map((assessment) => ({ record, assessment }))))).flat()
  const observedIds = new Set(history.rows.map((row) => row.assessment.assessmentId))
  for (const assessment of negativeRows) {
    const record = recordsById.get(assessment.recordId)
    if (record === undefined || observedIds.has(assessment._id)) continue
    history.rows.push({ record, assessment: { assessmentId: assessment._id, dimension: assessment.dimension, checkedWhen: assessment.checkedWhen,
      result: assessment.result, revision: assessment.revision, recordedAt: assessment.recordedAt } })
  }
  history.recordsConsidered = recordsById.size
  return history
}

export function summarizeHistory(history: History, textileId: Id<'textiles'>, supplyId: Id<'supplies'>, context: PersonalOutcomeContext | null) {
  let observations = history.bySupply.get(supplyId)
  if (observations === undefined) {
    // Dimensions share the same use facts; cache hashes per record/stage rather than
    // recomputing them for every candidate garment and assessment slot.
    const contexts = new Map<string, PersonalOutcomeContext | null>()
    observations = history.rows.map(({ record, assessment }) => {
      const adverse = assessment.result === 'damage' || assessment.result === 'irritation'
      const cacheKey = `${record._id}:${assessment.checkedWhen}:${adverse}`
      if (!contexts.has(cacheKey)) contexts.set(cacheKey, adverse
        ? recordedAdverseOutcomeContext(record, supplyId, 'overall', assessment.checkedWhen)
        : recordedOutcomeContext(record, supplyId, 'overall', assessment.checkedWhen))
      const base = contexts.get(cacheKey)!
      return { assessmentId: assessment.assessmentId, revision: assessment.revision, recordId: record._id,
        independentWashId: record.sessionId, completedAt: record.completedAt, result: assessment.result,
        context: base === null ? null : { ...base, dimension: assessment.dimension } }
    })
    history.bySupply.set(supplyId, observations)
  }
  const scope = history.scopes.get(textileId)!
  const summary = summarizePersonalOutcomes(context, observations, { enabled: history.global.enabled && scope.enabled,
    resetAt: Math.max(history.global.resetAt, scope.resetAt), historyTruncated: history.historyTruncated, negativeHistoryTruncated: history.negativeHistoryTruncated })
  return { ...summary, observations: summary.observations.map((row) => ({ ...row, assessmentId: row.assessmentId as Id<'outcomeAssessments'>,
    recordId: row.recordId as Id<'washRecords'>, independentWashId: row.independentWashId as Id<'sessions'> })),
    inputHash: sha256(stableJson({ policy: personalOutcomePolicyVersion, context, actor: history.principalKey, selected: history.ids,
      controls: [history.global, ...history.ids.map((id) => history.scopes.get(id)!)], summary })), recordsConsidered: history.recordsConsidered }
}
