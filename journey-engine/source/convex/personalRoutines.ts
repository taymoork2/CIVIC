import { v } from 'convex/values'
import { materialCareProblem } from '@washcloset/planner'
import { mutation, query, type MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { authorize } from './access'
import { fail } from './errors'
import { busyTextiles, invalidatePlans } from './plans'
import { personalRoutine, routineCurrent, routineLabelFacts, routineLabelHash, routineSettings } from './personalRoutineValues'

export const review = query({
  args: { textileIds: v.array(v.id('textiles')) },
  handler: async (ctx, args) => {
    if (args.textileIds.length === 0 || args.textileIds.length > 200 || new Set(args.textileIds).size !== args.textileIds.length) fail('invalid', 'Select between 1 and 200 distinct pieces')
    const { textile: first, actor } = await authorize(ctx, 'textile.read', { textileId: args.textileIds[0]! })
    return Promise.all(args.textileIds.map(async (id) => {
      const textile = (await authorize(ctx, 'textile.read', { textileId: id })).textile
      if (textile.householdId !== first.householdId) fail('forbidden', 'Forbidden')
      const care = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', id)).unique()
      return { textileId: id, name: textile.name, canChoose: textile.ownerPrincipalKey === actor.key && textile.guest !== true,
        revision: textile.routineRevision ?? 0, labelHash: routineLabelHash(care),
        care, routine: textile.personalRoutine ?? null, current: routineCurrent(textile.personalRoutine, care),
        missingLabel: care === null || care.status !== 'confirmed' || care.washMethod === undefined || care.washMethod === 'unknown',
        hasDryingPreference: textile.dryingPreference !== undefined }
    }))
  },
})

export const set = mutation({
  args: {
    pieces: v.array(v.object({ textileId: v.id('textiles'), revision: v.number(), labelHash: v.string() })),
    settings: v.union(routineSettings, v.null()), scope: personalRoutine.fields.scope,
    acceptedDamage: v.boolean(), missingLabelAccepted: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ids = args.pieces.map((piece) => piece.textileId)
    if (ids.length === 0 || ids.length > 200 || new Set(ids).size !== ids.length) fail('invalid', 'Select between 1 and 200 distinct pieces')
    const { textile: first, actor } = await authorize(ctx, 'textile.edit', { textileId: ids[0]! })
    if (args.settings !== null) {
      if (args.acceptedDamage !== true) fail('invalid', 'Accept possible wear or damage to these selected clothes')
      if (args.settings.wash === undefined && args.settings.dry === undefined) fail('invalid', 'Choose a washing or drying setting')
      const temperature = args.settings.wash?.maximumTemperatureC
      if (temperature !== undefined && (!Number.isFinite(temperature) || temperature < 1 || temperature > 95)) fail('invalid', 'Choose a water limit between 1 and 95 °C')
      if (args.settings.dry?.method === 'tumble' && args.settings.dry.heat === undefined) fail('invalid', 'Choose the tumble heat separately')
      if (args.settings.dry?.method !== 'tumble' && args.settings.dry?.heat !== undefined) fail('invalid', 'A tumble heat belongs only to tumble drying')
    }
    const busy = await busyTextiles(ctx, first.householdId)
    const queued = await ctx.db.query('dryingPieces').withIndex('by_household', (q) => q.eq('householdId', first.householdId)).collect()
    const rows = await Promise.all(args.pieces.map(async (expected) => {
      const textile = (await authorize(ctx, 'textile.edit', { textileId: expected.textileId })).textile
      if (textile.householdId !== first.householdId || textile.guest === true) fail('forbidden', 'Choose only your own pieces in this household')
      await authorize(ctx, 'routine.set', { householdId: textile.householdId, subjects: [textile.ownerPrincipalKey] })
      if (!['clean', 'dirty'].includes(textile.status) || busy.has(textile._id) || queued.some((piece) => piece.textileId === textile._id)) fail('conflict', 'Choose ready or hamper pieces outside active washing and drying')
      const care = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).unique()
      if (expected.revision !== (textile.routineRevision ?? 0) || expected.labelHash !== routineLabelHash(care)) fail('conflict', 'The label or routine changed. Reopen Wash & dry preferences before saving.')
      if (args.settings !== null) {
        const problem = materialCareProblem(care?.material, { washMethod: args.settings.wash?.method, cycle: args.settings.wash?.cycle, maxTemperatureC: args.settings.wash?.maximumTemperatureC, dryMethod: args.settings.dry?.method === 'tumble' ? 'tumble_dry' : undefined, dryHeat: args.settings.dry?.heat })
        if (problem !== null) fail('invalid', problem)
      }
      const missing = care === null || care.status !== 'confirmed' || care.washMethod === undefined || care.washMethod === 'unknown'
      if (args.settings !== null && missing && !args.missingLabelAccepted) fail('invalid', 'Explicitly accept choosing without a complete care label')
      return { textile, care }
    }))
    const now = Date.now()
    for (const { textile, care } of rows) {
      const settings = args.settings
      const departures: string[] = []
      if (settings?.wash) departures.push(`Wash method: ${care?.washMethod ?? 'unknown'} → ${settings.wash.method}`, `Wash cycle: ${care?.cycle ?? 'unknown'} → ${settings.wash.cycle}`, `Water limit: ${care?.maxTemperatureC ?? 'unknown'} → ${settings.wash.maximumTemperatureC} °C`)
      if (settings?.dry) departures.push(`Dry method: ${care?.dryMethod ?? 'unknown'} → ${settings.dry.method}`, ...(settings.dry.heat === undefined ? [] : [`Dryer heat: ${care?.dryHeat ?? 'unknown'} → ${settings.dry.heat}`]))
      const revision = (textile.routineRevision ?? 0) + 1
      const routine = settings === null ? undefined : { revision, scope: args.scope, settings, setAt: now, setBy: actor.key, acceptedDamage: true as const,
        missingLabelAccepted: args.missingLabelAccepted, labelHash: routineLabelHash(care), reviewedLabel: routineLabelFacts(care), departures }
      await ctx.db.patch(textile._id, { routineRevision: revision, personalRoutine: routine, routineWashId: undefined,
        ...(settings === null ? { dryingPreference: undefined } : {}) })
      await ctx.db.insert('history', { householdId: textile.householdId, textileId: textile._id, ownerPrincipalKey: textile.ownerPrincipalKey,
        event: 'personal_routine', occurredAt: now, actorPrincipalKey: actor.key,
        details: routine === undefined ? { follows: 'label', revision, clearedDryingPreference: true } : { routine: JSON.stringify(routine), scope: routine.scope, revision, choices: departures.join('; ') } })
    }
    await invalidatePlans(ctx, first.householdId)
    return null
  },
})

/** A once-only acceptance ends with its actual completed wash/dry journey. */
export async function expireOnceRoutine(ctx: MutationCtx, textile: Doc<'textiles'>, sessionId: Id<'sessions'>): Promise<void> {
  if (textile.personalRoutine?.scope !== 'once' || textile.routineWashId !== sessionId) return
  await ctx.db.patch(textile._id, { personalRoutine: undefined, routineWashId: undefined, routineRevision: (textile.routineRevision ?? 0) + 1 })
  await ctx.db.insert('history', { householdId: textile.householdId, textileId: textile._id, sessionId, ownerPrincipalKey: textile.ownerPrincipalKey,
    actorPrincipalKey: textile.personalRoutine.setBy, event: 'personal_routine', occurredAt: Date.now(), details: { expiredRevision: textile.personalRoutine.revision } })
  await invalidatePlans(ctx, textile.householdId)
}
