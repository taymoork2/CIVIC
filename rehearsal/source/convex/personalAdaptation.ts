import { v } from 'convex/values'
import { personalOutcomePolicyVersion } from '@washcloset/planner'
import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { authorize, type Action, type ReadCtx } from './access'
import { fail } from './errors'
import { outcomeDimension, outcomeStage, assessedResult } from './outcomeValues'
import { recordedOutcomeContext } from './personalOutcomeContext'
import { loadPersonalHistory, personalPreference as preference, summarizeHistory } from './personalOutcomeHistory'

const preferenceView = v.object({ enabled: v.boolean(), resetAt: v.number(), revision: v.number() })
const memberView = v.object({ textileId: v.id('textiles'), enabled: v.boolean(), resetAt: v.number(), revision: v.number() })
const defaults = { enabled: true, resetAt: 0, revision: 0 }
type Preference = typeof defaults
type Scope = { householdId: Id<'households'>; textileId?: Id<'textiles'>; textileIds?: Id<'textiles'>[] }

/** The clothing entries one control covers: none (household-wide), one entry, or one matching group. */
async function authorizeScope(ctx: ReadCtx, action: Action, args: Scope) {
  const actor = (await authorize(ctx, action, { householdId: args.householdId })).actor
  if (args.textileId !== undefined && args.textileIds !== undefined) fail('invalid', 'Choose one clothing entry or one matching group')
  const ids = args.textileIds ?? (args.textileId === undefined ? [] : [args.textileId])
  if (args.textileIds !== undefined && (ids.length === 0 || ids.length > 96 || new Set(ids).size !== ids.length)) fail('invalid', 'Choose one to 96 distinct clothing entries')
  for (const id of ids) if (((await authorize(ctx, action, { textileId: id })).textile).householdId !== args.householdId) fail('forbidden', 'Forbidden')
  return { actor, ids }
}

/**
 * A group's summary: on only when every member is on, and a reset counts only once every member has
 * one. Writes always check each member's own revision; the summary revision is only the newest one.
 */
function groupScope(members: readonly Preference[]): Preference {
  if (members.length === 0) return defaults
  return { enabled: members.every((member) => member.enabled), resetAt: Math.min(...members.map((member) => member.resetAt)),
    revision: Math.max(...members.map((member) => member.revision)) }
}

export const controls = query({
  args: { householdId: v.id('households'), textileId: v.optional(v.id('textiles')), textileIds: v.optional(v.array(v.id('textiles'))) },
  returns: v.object({ scope: preferenceView, effective: v.object({ enabled: v.boolean(), resetAt: v.number() }), members: v.array(memberView) }),
  handler: async (ctx, args) => {
    const { actor, ids } = await authorizeScope(ctx, 'textile.read', args)
    const [global, ...members] = await Promise.all([preference(ctx, args.householdId, actor.key, null), ...ids.map((id) => preference(ctx, args.householdId, actor.key, id))])
    const scope = ids.length === 0 ? global : groupScope(members)
    return { scope, effective: { enabled: global.enabled && scope.enabled, resetAt: Math.max(global.resetAt, scope.resetAt) },
      members: members.map((member, index) => ({ textileId: ids[index]!, ...member })) }
  },
})

/**
 * Reset excludes completed washes at/before the cutoff; editing an old assessment cannot revive them.
 * A matching group changes every member in this one transaction, or none when any member is stale.
 */
export const change = mutation({
  args: { householdId: v.id('households'), textileId: v.optional(v.id('textiles')), textileIds: v.optional(v.array(v.id('textiles'))),
    expectedRevision: v.optional(v.number()), expectedRevisions: v.optional(v.array(v.object({ textileId: v.id('textiles'), revision: v.number() }))),
    action: v.union(v.object({ kind: v.literal('set_enabled'), enabled: v.boolean() }), v.object({ kind: v.literal('reset') })) },
  returns: v.object({ enabled: v.boolean(), resetAt: v.number(), revision: v.number(), members: v.array(memberView) }),
  handler: async (ctx, args) => {
    const { actor, ids } = await authorizeScope(ctx, 'textile.edit', args)
    const group = args.textileIds !== undefined
    const expected = new Map(group ? (args.expectedRevisions ?? []).map((entry) => [entry.textileId, entry.revision]) : [[args.textileId ?? null, args.expectedRevision]])
    if (group ? args.expectedRevision !== undefined || args.expectedRevisions?.length !== ids.length || expected.size !== ids.length : args.expectedRevisions !== undefined || args.expectedRevision === undefined) fail('invalid', 'Send the expected revision for each clothing entry')
    const scopes = group ? ids : [args.textileId ?? null]
    const rows = await Promise.all(scopes.map((scope) => ctx.db.query('personalAdaptationPreferences').withIndex('by_scope', (q) => q.eq('householdId', args.householdId).eq('principalKey', actor.key).eq('textileId', scope)).unique()))
    // Every member is checked before any write, so a stale member leaves the whole group unchanged.
    const stale = scopes.some((scope, index) => {
      const revision = expected.get(scope)
      return revision === undefined || !Number.isSafeInteger(revision) || revision < 0 || revision !== (rows[index] ?? defaults).revision
    })
    if (stale) fail('conflict', 'Personal result controls changed; review them before saving')
    const now = Date.now()
    const written = await Promise.all(scopes.map(async (scope, index) => {
      const row = rows[index] ?? null
      const current = row ?? defaults
      const next = { enabled: args.action.kind === 'set_enabled' ? args.action.enabled : current.enabled,
        resetAt: args.action.kind === 'reset' ? Math.max(now, current.resetAt + 1) : current.resetAt,
        revision: current.revision + 1 }
      if (row === null) await ctx.db.insert('personalAdaptationPreferences', { householdId: args.householdId, principalKey: actor.key, textileId: scope, ...next })
      else await ctx.db.patch(row._id, next)
      return next
    }))
    const members = group || args.textileId !== undefined ? written.map((next, index) => ({ textileId: ids[index]!, ...next })) : []
    return { ...(group ? groupScope(written) : written[0]!), members }
  },
})

export const personalSummaryView = v.object({ policyVersion: v.literal(personalOutcomePolicyVersion),
  status: v.union(v.literal('disabled'), v.literal('insufficient_context'), v.literal('sparse'), v.literal('repeated_pattern'), v.literal('reassess')),
  counts: v.object({ independentWashes: v.number(), improved: v.number(), unchanged: v.number(), worse: v.number(), mixed: v.number(), unknown: v.number() }),
  suppressOptionalSuggestion: v.boolean(), historyTruncated: v.boolean(), negativeHistoryTruncated: v.boolean(), explanation: v.string(),
  observations: v.array(v.object({ assessmentId: v.id('outcomeAssessments'), revision: v.number(), recordId: v.id('washRecords'), independentWashId: v.id('sessions'), result: assessedResult })),
  inputHash: v.string(), recordsConsidered: v.number(),
})

/** Bounded matching for the selected entries only; no household member's reports are substituted. */
export const forRecord = query({
  args: { recordId: v.id('washRecords'), supplyId: v.id('supplies'), dimension: outcomeDimension, checkedWhen: outcomeStage,
    selectedTextileIds: v.array(v.id('textiles')) }, returns: personalSummaryView,
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.recordId)
    if (record === null) fail('not_found', 'Wash record not found')
    const { textile: target, actor } = await authorize(ctx, 'textile.read', { textileId: record.textileId })
    if (target.householdId !== record.householdId) fail('forbidden', 'Forbidden')
    const ids = [...new Set(args.selectedTextileIds)].sort()
    if (ids.length === 0 || ids.length > 16 || ids.length !== args.selectedTextileIds.length || !ids.includes(target._id)) fail('invalid', 'Select the target and at most 16 distinct clothing entries')
    const textiles = await Promise.all(ids.map(async (id) => (await authorize(ctx, 'textile.read', { textileId: id })).textile))
    if (textiles.some((textile) => textile.householdId !== target.householdId || (textile.wearerId ?? textile.ownerPrincipalKey) !== (target.wearerId ?? target.ownerPrincipalKey))) fail('forbidden', 'Choose clothing for the same profile in this household')
    const targetContext = recordedOutcomeContext(record, args.supplyId, args.dimension, args.checkedWhen)
    const history = await loadPersonalHistory(ctx, target.householdId, actor.key, ids, targetContext !== null, target._id)
    return summarizeHistory(history, target._id, args.supplyId, targetContext)
  },
})
