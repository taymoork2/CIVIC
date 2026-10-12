import { convexTest } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import schema from '@convex/schema'
import { api } from '@convex/_generated/api'
import { modules } from 'virtual:rehearsal-backend'

/** Seed presets select data, not alternate screen handlers. Every operation uses the app's functions. */
export async function createRuntime({ scenario, persona, role, condition, now, timeZone, namespace }: { scenario: string; persona: { id: string }; role: string; condition: string; now: number; timeZone: string; namespace: string }) {
  const backend = convexTest(schema, modules)
  let activeCondition = condition
  const identity = (subject: string) => ({ issuer: 'http://localhost:3211', subject, tokenIdentifier: `http://localhost:3211|${subject}` })
  const ownerSubject = `rehearsal-owner-${namespace}`, memberSubject = `rehearsal-member-${namespace}`
  const owner = backend.withIdentity(identity(ownerSubject))
  const { householdId } = await owner.mutation(api.households.createHousehold, { name: 'Rehearsal household', displayName: 'Alex', washPlace: persona.id === 'student' ? 'shared' : 'home' })
  if (persona.id === 'parent') await owner.mutation(api.inventory.createWearer, { householdId, name: 'Riley', kind: 'child' })
  const noReady = scenario === 'app.home.no-ready'
  const textiles = await owner.mutation(api.inventory.createTextiles, { householdId, name: 'Cotton tee', color: 'White', colorGroup: 'white', kind: 't_shirt', quantity: 2, status: noReady ? 'dirty' : 'clean' })
  const towels = await owner.mutation(api.inventory.createTextiles, { householdId, name: 'Cream towel', color: 'Cream', colorGroup: 'light', kind: 'towel', quantity: 2, status: 'clean' })
  if (condition !== 'missing-care') for (const textileId of [...textiles, ...towels]) await owner.mutation(api.inventory.setCare, { textileId, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, dryMethod: 'line_dry', restrictions: [], provenance: { source: 'Synthetic fixture only', confidence: 'user-supplied' } })
  const dateParts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now))
  const part = (type: string) => dateParts.find((part) => part.type === type)!.value
  const date = `${part('year')}-${part('month')}-${part('day')}`
  if (!noReady) await owner.mutation(api.outfits.save, { householdId, wearerId: null, date, items: [{ textileId: textiles[0]!, quantity: 2 }] })
  if (scenario !== 'app.drying.empty') await backend.run(async (ctx) => {
    const planId = await ctx.db.insert('plans', { householdId, createdBy: 'rehearsal', plannerVersion: 'synthetic-seed', inputHash: 'synthetic', inputSnapshot: {}, result: {}, status: 'used', createdAt: now })
    const sessionId = await ctx.db.insert('sessions', { householdId, planId, textileIds: towels, startedBy: 'rehearsal', idempotencyKey: 'rehearsal-seed', status: 'completed', revision: 0, washFinishedAt: now })
    for (const textileId of scenario === 'app.drying.putaway-one' ? towels.slice(0, 1) : towels) {
      await ctx.db.patch(textileId, { status: 'hanging' })
      await ctx.db.insert('dryingPieces', { householdId, textileId, washSessionId: sessionId, washerName: 'Synthetic washer', status: 'dry', method: 'rack_line', queuedAt: now })
    }
  })
  let caller = owner
  if (role === 'member') {
    caller = backend.withIdentity(identity(memberSubject))
    const invite = await owner.mutation(api.households.createInvite, { householdId })
    await caller.mutation(api.households.joinWithInvite, { code: invite.code, displayName: 'Sam' })
  }
  const status = await caller.query(api.households.onboardingStatus, {})
  const seed = { scenario, householdId, principalKey: status.principalKey, subject: role === 'member' ? memberSubject : ownerSubject, textiles, towels }
  return {
    seed,
    recover: () => { activeCondition = 'normal'; return { condition: activeCondition } },
    async execute(kind: 'query' | 'mutation', name: string, args: Record<string, unknown>) {
      if (kind === 'mutation' && ['offline', 'save-error'].includes(activeCondition)) throw new ConvexError({ code: 'REHEARSAL_UNAVAILABLE', message: activeCondition === 'offline' ? 'Isolated run is offline. Your draft is kept.' : 'Isolated save failed. Your draft is kept.' })
      const [path, fn] = name.split(':')
      const load = Object.entries(modules).find(([file]) => file.endsWith(`/convex/${path}.ts`))?.[1]
      const module = load ? await load() as Record<string, { isPublic?: boolean; isQuery?: boolean; isMutation?: boolean }> : null
      const callable = module?.[fn!]
      if (!callable?.isPublic || !(kind === 'query' ? callable.isQuery : callable.isMutation)) throw Error('Only public queries and mutations are supported in isolated review.')
      return kind === 'query' ? caller.query(makeFunctionReference<'query'>(name), args) : caller.mutation(makeFunctionReference<'mutation'>(name), args)
    },
    async state() { return backend.run(async (ctx) => ({ textiles: await ctx.db.query('textiles').collect(), pieces: await ctx.db.query('dryingPieces').collect(), history: await ctx.db.query('history').collect() })) },
  }
}
