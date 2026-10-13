import { v } from 'convex/values'
import { mutation, type MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { authorize } from './access'
import { fail } from './errors'
import { decorationFacts, constructionFacts } from './garmentAdviceValues'
import { constructionFeatures, printfulCareSource, type GarmentConstruction } from '@washcloset/planner'
import { invalidatePlans } from './plans'
import { principalFromAuth } from './principal'

async function selected(ctx: MutationCtx, ids: Id<'textiles'>[]) {
  if (ids.length === 0 || ids.length > 250 || new Set(ids).size !== ids.length) fail('invalid', 'Choose between 1 and 250 distinct pieces')
  const textiles = await Promise.all(ids.map(async (id) => (await authorize(ctx, 'textile.edit', { textileId: id })).textile))
  if (textiles.some((entry) => entry.householdId !== textiles[0]!.householdId || entry.guest === true || entry.trashedAt !== undefined)) fail('forbidden', 'Choose active closet pieces in one household')
  return textiles
}

function checkedConstruction(facts: GarmentConstruction): GarmentConstruction {
  return Object.fromEntries(constructionFeatures.flatMap((feature) => {
    const fact = facts[feature]
    if (fact === undefined) return []
    const source = fact.source.trim()
    if (source.length > 500) fail('invalid', 'Keep each construction source to 500 characters')
    if (fact.presence === 'unknown' && fact.confidence !== 'unknown') fail('invalid', 'Unclear construction must remain unknown')
    if (fact.presence !== 'unknown' && (fact.confidence === 'unknown' || !source)) fail('invalid', 'Record where you observed or verified each construction fact')
    return [[feature, fact.presence === 'unknown' ? { presence: 'unknown', confidence: 'unknown', source: '' } : { ...fact, source }]]
  }))
}

export const setDecoration = mutation({
  args: { textileIds: v.array(v.id('textiles')), facts: v.object(decorationFacts), expectedRevisions: v.array(v.object({ textileId: v.id('textiles'), revision: v.number() })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const textiles = await selected(ctx, args.textileIds)
    const expected = new Map(args.expectedRevisions.map((entry) => [entry.textileId, entry.revision]))
    if (expected.size !== textiles.length || args.expectedRevisions.length !== textiles.length || textiles.some((entry) => expected.get(entry._id) !== (entry.decoration?.revision ?? 0))) fail('stale', 'Print details changed; reopen them before saving')
    const facts = { ...args.facts, manufacturer: args.facts.manufacturer.trim(), source: args.facts.source.trim(),
      ...(args.facts.construction === undefined ? {} : { construction: checkedConstruction(args.facts.construction) }) }
    if (facts.manufacturer.length > 120 || facts.source.length > 500) fail('invalid', 'Keep the maker to 120 characters and the source to 500')
    if (facts.kind !== 'printed' && facts.method !== 'unknown') fail('invalid', 'A print method needs recorded printed decoration')
    if (facts.kind !== 'unknown' && (!facts.source || facts.confidence === 'unknown')) fail('invalid', 'Record where you observed or read these decoration facts')
    if (facts.kind === 'unknown' && facts.confidence !== 'unknown') fail('invalid', 'Unclear decoration must remain unknown')
    if (facts.guidanceSource !== undefined && (facts.guidanceSource !== printfulCareSource || facts.confidence !== 'verified'
      || facts.manufacturer.toLowerCase() !== 'printful' || facts.kind !== 'embroidered')) fail('invalid', 'A checked embroidery care source needs verified Printful embroidery facts')
    const actor = await principalFromAuth(ctx)
    for (const textile of textiles) await ctx.db.patch(textile._id, { decoration: {
      ...(textile.decoration?.construction === undefined ? {} : { construction: textile.decoration.construction }),
      ...facts, revision: (textile.decoration?.revision ?? 0) + 1, recordedAt: Date.now(), recordedBy: actor.key,
    } })
    await invalidatePlans(ctx, textiles[0]!.householdId)
    return null
  },
})

/** Separate editor preserves decoration and uses its shared fact revision to reject stale writes. */
export const setConstruction = mutation({
  args: { textileIds: v.array(v.id('textiles')), facts: constructionFacts, expectedRevisions: v.array(v.object({ textileId: v.id('textiles'), revision: v.number() })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const textiles = await selected(ctx, args.textileIds)
    const expected = new Map(args.expectedRevisions.map((entry) => [entry.textileId, entry.revision]))
    if (expected.size !== textiles.length || args.expectedRevisions.length !== textiles.length || textiles.some((entry) => expected.get(entry._id) !== (entry.decoration?.revision ?? 0))) fail('stale', 'Garment details changed; reopen them before saving')
    const construction = checkedConstruction(args.facts)
    const actor = await principalFromAuth(ctx)
    for (const textile of textiles) await ctx.db.patch(textile._id, { decoration: {
      ...(textile.decoration ?? { kind: 'unknown' as const, method: 'unknown' as const, manufacturer: '', source: '', confidence: 'unknown' as const }),
      construction, revision: (textile.decoration?.revision ?? 0) + 1, recordedAt: Date.now(), recordedBy: actor.key,
    } })
    await invalidatePlans(ctx, textiles[0]!.householdId)
    return null
  },
})

/** Future advice only. Current execution and required label instructions stay frozen. */
export const setReminder = mutation({
  args: { textileIds: v.array(v.id('textiles')), enabled: v.union(v.boolean(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const textiles = await selected(ctx, args.textileIds)
    const actor = await principalFromAuth(ctx)
    for (const textile of textiles) await ctx.db.patch(textile._id, { adviceReminder: args.enabled === null ? undefined : { enabled: args.enabled, recordedAt: Date.now(), recordedBy: actor.key } })
    await invalidatePlans(ctx, textiles[0]!.householdId)
    return null
  },
})
