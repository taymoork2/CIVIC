import { v, type Infer } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalMutation, type MutationCtx } from './_generated/server'
import { fail } from './errors'

const eraseScope = v.union(v.object({ planId: v.id('plans') }), v.object({ textileId: v.id('textiles') }), v.object({ principalKey: v.string() }))
export async function deletePersonalGuidance(ctx: MutationCtx, guidanceId: Id<'personalPlanGuidance'>) {
  const entries = await ctx.db.query('personalPlanGuidanceEntries').withIndex('by_guidance', (q) => q.eq('guidanceId', guidanceId)).take(17)
  if (entries.length > 16) fail('conflict', 'Private guidance references need reconciliation')
  for (const entry of entries) await ctx.db.delete(entry._id)
  if (await ctx.db.get(guidanceId) !== null) await ctx.db.delete(guidanceId)
}

/** At most eight snapshots and their sixteen-entry reference sets per deletion transaction. */
export async function erasePersonalGuidance(ctx: MutationCtx, scope: Infer<typeof eraseScope>): Promise<void> {
  const limit = 8
  let ids: Id<'personalPlanGuidance'>[], count: number
  if ('textileId' in scope) {
    const entries = await ctx.db.query('personalPlanGuidanceEntries').withIndex('by_textile', (q) => q.eq('textileId', scope.textileId)).take(limit)
    ids = entries.map((entry) => entry.guidanceId)
    count = entries.length
  } else {
    const rows = 'planId' in scope
      ? await ctx.db.query('personalPlanGuidance').withIndex('by_plan', (q) => q.eq('planId', scope.planId)).take(limit)
      : await ctx.db.query('personalPlanGuidance').withIndex('by_principal', (q) => q.eq('principalKey', scope.principalKey)).take(limit)
    ids = rows.map((row) => row._id)
    count = rows.length
  }
  for (const id of new Set(ids)) await deletePersonalGuidance(ctx, id)
  if (count === limit) await ctx.scheduler.runAfter(0, internal.personalPlanStorage.eraseBatch, { scope })
}

export const eraseBatch = internalMutation({ args: { scope: eraseScope }, returns: v.null(),
  handler: async (ctx, args) => { await erasePersonalGuidance(ctx, args.scope); return null },
})
