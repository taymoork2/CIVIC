import { v } from 'convex/values'
import { outfitGroupKey, sha256 } from '@washcloset/planner'
import { mutation, query } from './_generated/server'
import { authorize, visible } from './access'
import { fail } from './errors'
import { busyTextiles } from './plans'
import { outfitItem } from './validators'
import { intakeSave } from './intakeSaves'
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

const signatureOf = (items: Doc<'dailyOutfits'>['items']) => sha256(JSON.stringify(items.map(({ key, quantity }) => [key, quantity]).sort(([a], [b]) => String(a).localeCompare(String(b)))))
const wearKey = (planId: Id<'dailyOutfits'>, date: string, signature: string) => sha256(JSON.stringify([planId, date, signature]))

/** The saved outfit, counters, history and retry receipt commit as one transaction. */
export const wear = mutation({
  args: { householdId: v.id('households'), wearerId: v.union(v.id('wearers'), v.null()), planId: v.id('dailyOutfits'), date: v.string(), signature: v.string(), timeZone: v.string() },
  returns: v.null(),
  handler: async (ctx, { householdId, wearerId, planId, date, signature, timeZone }) => {
    const actor = (await authorize(ctx, 'textile.edit', { householdId })).actor
    calendarDate(date)
    if (!/^[a-f0-9]{64}$/.test(signature)) fail('invalid', 'Open your saved outfit again')
    const receipt = await intakeSave(ctx, householdId, actor.key, 'outfit', wearKey(planId, date, signature), { planId, wearerId, date, signature })
    // A committed retry remains safe after the outfit is changed, cleared or the day ends.
    if (receipt!.previous !== null) return null
    let day: Intl.DateTimeFormat
    try { day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }) }
    catch { fail('invalid', 'Choose a valid time zone') }
    const localDate = (time: number) => {
      const parts = day.formatToParts(time)
      return ['year', 'month', 'day'].map(name => parts.find(part => part.type === name)!.value).join('-')
    }
    const now = Date.now()
    if (localDate(now) !== date) fail('stale', 'This outfit is from another day. Open today’s outfit again.')
    const plan = await ctx.db.get(planId)
    if (plan === null || plan.householdId !== householdId || recipient(plan) !== wearerId || plan.date !== date) fail('stale', 'Your outfit changed. Open it again before recording wear.')
    if (!await requireWearer(ctx, householdId, wearerId)) fail('stale', 'That person’s closet is no longer available')
    const busy = await busyTextiles(ctx, householdId)
    const rows = await ctx.db.query('textiles').withIndex('by_household', q => q.eq('householdId', householdId)).take(2001)
    if (rows.length > 2000) fail('invalid', 'This closet is too large to plan an outfit yet')
    const shown = await visible(ctx, actor, rows)
    const shownIds = new Set(shown.map(piece => piece._id))
    const hiddenKeys = new Set(rows.filter(piece => !shownIds.has(piece._id)).map(outfitGroupKey))
    // Refuse hidden groups before checking a digest, including a guessed signature.
    if (plan.items.some(item => hiddenKeys.has(item.key))) fail('forbidden', 'Forbidden')
    if (signatureOf(plan.items) !== signature) fail('stale', 'Your outfit changed. Open it again before recording wear.')
    const ready = shown.filter(piece => piece.status === 'clean' && !piece.guest && piece.trashedAt === undefined && !busy.has(piece._id))
    const wornToday = (piece: Doc<'textiles'>) => piece.lastWornAt !== undefined && localDate(piece.lastWornAt) === date
    const pieces = plan.items.flatMap(item => ready.filter(piece => outfitGroupKey(piece) === item.key).sort((a, b) => Number(wornToday(b)) - Number(wornToday(a))).slice(0, item.quantity))
    if (pieces.length === 0 || pieces.length !== plan.items.reduce((sum, item) => sum + item.quantity, 0)) fail('stale', 'Some clothes are no longer ready. Update your outfit and try again.')
    await authorize(ctx, 'textile.edit', { householdId, uses: { textileIds: pieces.map(piece => piece._id) } })
    for (const piece of pieces) {
      if (wornToday(piece)) continue
      await ctx.db.patch(piece._id, { lastWornAt: now, wearsSinceClean: (piece.wearsSinceClean ?? 0) + 1 })
      await ctx.db.insert('history', { householdId, textileId: piece._id, ownerPrincipalKey: piece.ownerPrincipalKey, event: 'worn', occurredAt: now, actorPrincipalKey: actor.key })
    }
    await receipt!.record(pieces.map(piece => piece._id))
    return null
  },
})

export const today = query({
  args: { householdId: v.id('households'), wearerId: v.union(v.id('wearers'), v.null()), date: v.string() },
  returns: v.array(v.object({ planId: v.id('dailyOutfits'), signature: v.string(), wearRecorded: v.boolean(), isYou: v.boolean(), authorName: v.string(), items: v.array(outfitItem) })),
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
      const items = plan.items.filter((item) => shownKeys.has(item.key) && !hidden.has(item.key))
      // Never expose a digest of hidden identities or offer wear of only part of a saved outfit.
      const signature = items.length === plan.items.length ? signatureOf(items) : ''
      const receipt = signature === '' ? null : await ctx.db.query('intakeSaves').withIndex('by_request', q => q.eq('householdId', householdId).eq('principalKey', actor.key).eq('kind', 'outfit').eq('key', wearKey(plan._id, date, signature))).unique()
      return { planId: plan._id, signature, wearRecorded: receipt !== null, isYou: plan.principalKey === actor.key, authorName: author?.displayName ?? 'Household member', items }
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
