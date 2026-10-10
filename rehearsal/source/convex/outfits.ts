import { v } from 'convex/values'
import { outfitGroupKey } from '@washcloset/planner'
import { mutation, query } from './_generated/server'
import { authorize, visible } from './access'
import { fail } from './errors'
import { busyTextiles } from './plans'
import { outfitItem } from './validators'
import type { ReadCtx } from './access'
import type { Doc, Id } from './_generated/dataModel'

const recipient = (plan: Doc<'dailyOutfits'>) => plan.wearerId ?? plan.items[0]?.wearerId ?? null
async function requireWearer(ctx: ReadCtx, householdId: Id<'households'>, wearerId: Id<'wearers'> | null) {
  if (wearerId === null) return true
  const wearer = await ctx.db.get(wearerId)
  if (wearer === null) return false
  if (wearer.householdId !== householdId) fail('forbidden', 'Choose someone from this household')
  return true
}

function calendarDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    fail('invalid', 'Choose a valid calendar date')
  }
}

export const today = query({
  args: { householdId: v.id('households'), wearerId: v.union(v.id('wearers'), v.null()), date: v.string() },
  returns: v.array(v.object({ isYou: v.boolean(), authorName: v.string(), items: v.array(outfitItem) })),
  handler: async (ctx, { householdId, wearerId, date }) => {
    const actor = (await authorize(ctx, 'textile.read', { householdId: householdId })).actor
    if (!await requireWearer(ctx, householdId, wearerId)) return []
    calendarDate(date)
    // ponytail: daily suggestions are bounded to 100; add a recipient index for larger households.
    const plans = await ctx.db.query('dailyOutfits').withIndex('by_household_principal', (q) => q.eq('householdId', householdId)).take(101)
    if (plans.length > 100) fail('invalid', 'This household has too many outfit suggestions to display')
    const textiles = await ctx.db.query('textiles').withIndex('by_household', (q) => q.eq('householdId', householdId)).take(2001)
    if (textiles.length > 2000) fail('invalid', 'This closet is too large to plan an outfit yet')
    const visibleTextiles = await visible(ctx, actor, textiles)
    const shown = new Set(visibleTextiles.map((piece) => piece._id))
    const shownKeys = new Set(visibleTextiles.map(outfitGroupKey))
    const hidden = new Set(textiles.filter((piece) => !shown.has(piece._id)).map(outfitGroupKey))
    return Promise.all(plans.filter((plan) => plan.date === date && recipient(plan) === wearerId).map(async (plan) => {
      const author = await ctx.db.query('people').withIndex('by_principal_key', (q) => q.eq('principalKey', plan.principalKey)).unique()
      return { isYou: plan.principalKey === actor.key, authorName: author?.displayName ?? 'Household member', items: plan.items.filter((item) => shownKeys.has(item.key) && !hidden.has(item.key)) }
    }))
  },
})

export const save = mutation({
  args: {
    householdId: v.id('households'), wearerId: v.union(v.id('wearers'), v.null()), date: v.string(),
    items: v.array(v.object({ textileId: v.id('textiles'), quantity: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, { householdId, wearerId, date, items }) => {
    const actor = (await authorize(ctx, 'outfit.edit', { householdId: householdId })).actor
    if (!await requireWearer(ctx, householdId, wearerId)) fail('stale', 'That person’s closet is no longer available')
    calendarDate(date)
    if (items.length > 20 || items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)) fail('invalid', 'Choose up to 20 styles, with 1–20 pieces each')
    const plans = await ctx.db.query('dailyOutfits').withIndex('by_household_principal', (q) => q.eq('householdId', householdId).eq('principalKey', actor.key)).take(101)
    if (plans.length > 100) fail('invalid', 'You have too many outfit suggestions saved')
    const existing = plans.find((plan) => recipient(plan) === wearerId)
    if (items.length === 0) {
      if (existing !== undefined) await ctx.db.delete(existing._id)
      return null
    }
    const busy = await busyTextiles(ctx, householdId)
    // ponytail: bounded household scan; add a style index if closets exceed 2,000 clean pieces.
    const rows = await ctx.db.query('textiles').withIndex('by_household_status', (q) => q.eq('householdId', householdId).eq('status', 'clean')).take(2001)
    if (rows.length > 2000) fail('invalid', 'This closet is too large to plan an outfit yet')
    const clean = await visible(ctx, actor, rows)
    const available = new Map<string, number>()
    for (const item of clean) {
      if (item.guest || item.trashedAt !== undefined || busy.has(item._id)) continue
      const key = outfitGroupKey(item)
      available.set(key, (available.get(key) ?? 0) + 1)
    }
    const selected = []
    const keys = new Set<string>()
    for (const choice of items) {
      const item = await ctx.db.get(choice.textileId)
      if (item === null || item.householdId !== householdId) fail('forbidden', 'Choose clothes from this household')
      if ((item.wearerId ?? null) !== wearerId) fail('invalid', 'Choose clothes from this person’s closet')
      if (item.guest || item.trashedAt !== undefined) fail('stale', 'Those clothes are no longer in your closet')
      await authorize(ctx, 'textile.read', { textileId: choice.textileId })
      const key = outfitGroupKey(item)
      if (keys.has(key)) fail('invalid', 'Choose each style once')
      if (choice.quantity > (available.get(key) ?? 0)) fail('stale', 'Some clothes are no longer ready. Update your outfit and try again.')
      keys.add(key)
      selected.push({ key, name: item.name, color: item.color ?? null, colorGroup: item.colorGroup ?? null, kind: item.kind ?? null, brand: item.identity?.brand ?? null, wearerId: item.wearerId ?? null, quantity: choice.quantity })
    }
    const plan = { householdId, wearerId, principalKey: actor.key, date, items: selected }
    if (existing === undefined) await ctx.db.insert('dailyOutfits', plan)
    else await ctx.db.replace(existing._id, plan)
    return null
  },
})
