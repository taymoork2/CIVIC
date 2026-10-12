import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import type { ReadCtx } from './access'
import { fail } from './errors'

const fields = ['inputSnapshot', 'result'] as const
type Documents = Pick<Doc<'plans'>, typeof fields[number]>

/** Keep ordinary plans inline; large care snapshots never approach the one-document limit. */
export async function writePlanDocuments(ctx: MutationCtx, planId: Id<'plans'>, documents: Documents): Promise<void> {
  const serialized = fields.map(field => JSON.stringify(documents[field]))
  await erasePlanDocuments(ctx, planId)
  if (serialized.reduce((total, text) => total + text.length, 0) < 64_000) {
    await ctx.db.patch(planId, { ...documents, documentParts: undefined })
    return
  }
  const counts = { inputSnapshot: 0, result: 0 }
  for (const [index, field] of fields.entries()) {
    const text = serialized[index]!
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 32_000, text.length)
      // Preserve surrogate pairs when the stored strings are UTF-8 encoded.
      const last = text.charCodeAt(end - 1)
      if (end < text.length && last >= 0xd800 && last <= 0xdbff) end -= 1
      await ctx.db.insert('planDocuments', { planId, field, position: counts[field]++, text: text.slice(start, end) })
      start = end
    }
  }
  await ctx.db.patch(planId, { inputSnapshot: {}, result: {}, documentParts: counts })
}

/** Hydration is internal; public callers still authorize against the plan's household. */
export async function readPlanDocuments(ctx: ReadCtx, stored: Doc<'plans'>): Promise<Doc<'plans'>> {
  if (stored.documentParts === undefined) return stored
  const parts = await ctx.db.query('planDocuments').withIndex('by_plan', q => q.eq('planId', stored._id)).collect()
  const documents = {} as Documents
  for (const field of fields) {
    const ordered = parts.filter(part => part.field === field).sort((a, b) => a.position - b.position)
    if (ordered.length !== stored.documentParts[field] || ordered.length === 0 || ordered.some((part, index) => part.position !== index)) {
      fail('conflict', 'This plan is incomplete. Make a new plan before starting a load.')
    }
    documents[field] = JSON.parse(ordered.map(part => part.text).join('')) as Documents[typeof field]
  }
  return { ...stored, ...documents, documentParts: undefined }
}

export async function getPlan(ctx: ReadCtx, id: Id<'plans'>): Promise<Doc<'plans'> | null> {
  const stored = await ctx.db.get(id)
  return stored === null ? null : readPlanDocuments(ctx, stored)
}

export async function erasePlanDocuments(ctx: MutationCtx, planId: Id<'plans'>): Promise<void> {
  for (const part of await ctx.db.query('planDocuments').withIndex('by_plan', q => q.eq('planId', planId)).collect()) await ctx.db.delete(part._id)
}
