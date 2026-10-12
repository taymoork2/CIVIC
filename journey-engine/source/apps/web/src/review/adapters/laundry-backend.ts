import { convexTest } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import authTest from '@convex-dev/better-auth/test'
import schema from '@convex/schema'
import { api, components } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { modules } from 'virtual:rehearsal-backend'

/** Seed presets select data, not alternate screen handlers. Every operation uses the app's functions. */
export async function createRuntime({ scenario, persona, role, condition, now, timeZone, namespace, options = {} }: { scenario: string; persona: { id: string }; role: string; condition: string; now: number; timeZone: string; namespace: string; options?: { pieces?: unknown } }) {
  // The family laundry day's size is Laundry's own run option: 100, 500 or 1,000 original pieces.
  const pieces = options.pieces ?? 1000
  if (pieces !== 100 && pieces !== 500 && pieces !== 1000) throw Error('Invalid synthetic family size')
  const backend = convexTest(schema, modules)
  // Load component code before Convex disables timers inside queries and mutations.
  const authModules = await Promise.all(Object.entries(authTest.modules).map(async ([path, load]) => { const module = await load(); return [path, async () => module] as const }))
  backend.registerComponent('betterAuth', authTest.schema, Object.fromEntries(authModules))
  let activeCondition = condition
  const identity = async (name: string) => {
    const user = await backend.mutation(components.betterAuth.adapter.create, { input: { model: 'user', data: { name, email: `${name}@example.invalid`, emailVerified: false, createdAt: now, updatedAt: now } } })
    const session = await backend.mutation(components.betterAuth.adapter.create, { input: { model: 'session', data: { userId: user._id, token: `review-session-${user._id}`, expiresAt: now + 365 * 86_400_000, createdAt: now, updatedAt: now } } })
    return { issuer: 'http://localhost:3211', subject: user._id, sessionId: session._id, tokenIdentifier: `http://localhost:3211|${user._id}` }
  }
  const ownerSubject = `rehearsal-owner-${namespace}`, memberSubject = `rehearsal-member-${namespace}`
  const ownerIdentity = await identity(ownerSubject)
  const owner = backend.withIdentity(ownerIdentity)
  const family = scenario.startsWith('family.')
  const { householdId } = await owner.mutation(api.households.createHousehold, { name: 'Rehearsal household', displayName: 'Alex', washPlace: persona.id === 'student' ? 'shared' : 'home', ...(family ? { wearers: [{ name: 'Alex', kind: 'adult' as const, self: true }, { name: 'Sam', kind: 'adult' as const }, ...['Charlie', 'Riley', 'Jordan'].map(name => ({ name, kind: 'child' as const }))] } : {}) })
  if (!family && persona.id === 'parent') await owner.mutation(api.inventory.createWearer, { householdId, name: 'Riley', kind: 'child' })
  const noReady = scenario === 'app.home.no-ready'
  const textiles: Id<'textiles'>[] = []
  if (family) {
    const wearers = (await owner.query(api.inventory.list, { householdId })).wearers
    for (let batch = 0; batch < pieces / 20; batch++) {
      const wearer = wearers[Math.floor(batch / (pieces / 100))]!
      const ids = await owner.mutation(api.inventory.createTextiles, { householdId, name: `${wearer.name} cotton ${String(batch).padStart(2, '0')}`, wearerId: wearer.wearerId, color: 'White', colorGroup: 'white', kind: 't_shirt', quantity: 20, status: 'dirty', firstWash: false, bulkUnits: 1 })
      textiles.push(...ids)
    }
    const evidence = { source: 'Synthetic labelled fixture; never real garment evidence', confidence: 'verified' as const }
    const detergent = await owner.mutation(api.inventory.createSupply, { householdId, name: 'Synthetic detergent', kind: 'chemical', use: 'detergent', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'Synthetic liquid', form: 'liquid', highEfficiencyCompatible: true }, provenance: evidence })
    await owner.mutation(api.inventory.saveRule, { supplyId: detergent, dose: { amount: 30, unit: 'ml', measurementCue: 'Synthetic 30 ml mark' }, stage: 'wash', placement: 'detergent_compartment', timing: 'before cycle start', provenance: evidence })
    await owner.mutation(api.inventory.createMachine, { householdId, name: 'Synthetic washer', applianceType: 'top_load_washer', capacityUnits: 20, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['detergent_compartment', 'direct_to_drum'], cycleMinutes: { normal: 40 }, provenance: evidence })
    await owner.mutation(api.inventory.createMachine, { householdId, name: 'Synthetic dryer', applianceType: 'tumble_dryer', capacityUnits: 20, capacityConfidence: 'verified', heatSettings: [{ heat: 'low', label: 'Low heat' }], cycleMinutes: { timed: 40 }, provenance: evidence })
  } else textiles.push(...await owner.mutation(api.inventory.createTextiles, { householdId, name: 'Cotton tee', color: 'White', colorGroup: 'white', kind: 't_shirt', quantity: 2, status: noReady ? 'dirty' : 'clean' }))
  const towels = family ? [] : await owner.mutation(api.inventory.createTextiles, { householdId, name: 'Cream towel', color: 'Cream', colorGroup: 'light', kind: 'towel', quantity: 2, status: 'clean' })
  if (condition !== 'missing-care') for (const textileId of [...textiles, ...towels]) await owner.mutation(api.inventory.setCare, { textileId, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, dryMethod: 'line_dry', restrictions: [], provenance: { source: 'Synthetic fixture label only; never real garment evidence', confidence: family ? 'verified' : 'user-supplied' } })
  const dateParts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now))
  const part = (type: string) => dateParts.find((part) => part.type === type)!.value
  const date = `${part('year')}-${part('month')}-${part('day')}`
  if (!family && !noReady) await owner.mutation(api.outfits.save, { householdId, wearerId: null, date, items: [{ textileId: textiles[0]!, quantity: 2 }] })
  if (!family && scenario !== 'app.drying.empty') await backend.run(async (ctx) => {
    const planId = await ctx.db.insert('plans', { householdId, createdBy: 'rehearsal', plannerVersion: 'synthetic-seed', inputHash: 'synthetic', inputSnapshot: {}, result: {}, status: 'used', createdAt: now })
    const sessionId = await ctx.db.insert('sessions', { householdId, planId, textileIds: towels, startedBy: 'rehearsal', idempotencyKey: 'rehearsal-seed', status: 'completed', revision: 0, washFinishedAt: now })
    for (const textileId of scenario === 'app.drying.putaway-one' ? towels.slice(0, 1) : towels) {
      await ctx.db.patch(textileId, { status: 'hanging' })
      await ctx.db.insert('dryingPieces', { householdId, textileId, washSessionId: sessionId, washerName: 'Synthetic washer', status: 'dry', method: 'rack_line', queuedAt: now })
    }
  })
  let caller = owner
  let account = role
  let subject = ownerIdentity.subject
  const memberIdentity = await identity(memberSubject), otherIdentity = await identity(`rehearsal-other-${namespace}`)
  const member = backend.withIdentity(memberIdentity)
  if (family || role === 'member') {
    const invite = await owner.mutation(api.households.createInvite, { householdId })
    await member.mutation(api.households.joinWithInvite, { code: invite.code, displayName: 'Sam' })
  }
  if (role === 'member') { caller = member; subject = memberIdentity.subject }
  const status = await caller.query(api.households.onboardingStatus, {})
  const seed = { scenario, householdId, principalKey: status.principalKey, subject, textiles, towels }
  const checkActor = (expected?: string) => { if (family && expected === undefined || expected !== undefined && expected !== subject) throw Error('Synthetic account changed in another pane. Reopen before acting.') }
  return {
    seed,
    inspect: () => ({ account, subject, accounts: ['owner', 'member', 'other'] }),
    identity(selectedAccount: string) {
      const selected = selectedAccount === 'owner' ? ownerIdentity : selectedAccount === 'member' ? memberIdentity : selectedAccount === 'other' ? otherIdentity : null
      if (!selected) throw Error('Unknown synthetic account')
      caller = backend.withIdentity(selected); subject = selected.subject
      account = selectedAccount
      return { account, subject }
    },
    recover: () => { activeCondition = 'normal'; return { condition: activeCondition } },
    async execute(kind: 'query' | 'mutation', name: string, args: Record<string, unknown>, expectedActor?: string) {
      checkActor(expectedActor)
      if (kind === 'mutation' && ['offline', 'save-error'].includes(activeCondition)) throw new ConvexError({ code: 'REHEARSAL_UNAVAILABLE', message: activeCondition === 'offline' ? 'Isolated run is offline. Your draft is kept.' : 'Isolated save failed. Your draft is kept.' })
      const [path, fn] = name.split(':')
      const load = Object.entries(modules).find(([file]) => file.endsWith(`/convex/${path}.ts`))?.[1]
      const module = load ? await load() as Record<string, { isPublic?: boolean; isQuery?: boolean; isMutation?: boolean }> : null
      const callable = module?.[fn!]
      if (!callable?.isPublic || !(kind === 'query' ? callable.isQuery : callable.isMutation)) throw Error('Only public queries and mutations are supported in isolated review.')
      return kind === 'query' ? caller.query(makeFunctionReference<'query'>(name), args) : caller.mutation(makeFunctionReference<'mutation'>(name), args)
    },
    async state(expectedActor?: string) {
      checkActor(expectedActor)
      let visible: Set<string>
      try { visible = new Set((await caller.query(api.inventory.list, { householdId })).textiles.map(row => row.textileId)) }
      catch { return { account, subject, textiles: [], pieces: [], history: [] } }
      return backend.run(async ctx => ({ account, subject, textiles: (await ctx.db.query('textiles').collect()).filter(row => visible.has(row._id)), pieces: (await ctx.db.query('dryingPieces').collect()).filter(row => visible.has(row.textileId)), history: (await ctx.db.query('history').collect()).filter(row => visible.has(row.textileId)) }))
    },
  }
}
