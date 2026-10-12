import type { FunctionArgs, FunctionReturnType, UserIdentity } from 'convex/server'
import { convexTest } from 'convex-test'
import { register } from '@convex-dev/better-auth/test'

import { isDryerPhase, type LoadSize } from '@washcloset/planner'

import { api, components } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { principalFromAuth } from './principal'
import schema from './schema'

/** Every function module, for convex-test. Test-only files (with a second dot) are skipped by Convex itself. */
export const modules = import.meta.glob('./**/*.ts')

export const issuer = 'http://localhost:3211'

/** A fresh backend, with the real schema, per test. */
export function newBackend() {
  const t = convexTest(schema, modules)
  register(t)
  return t
}

export type Backend = ReturnType<typeof newBackend>

const identities = new WeakMap<Backend, Map<string, Promise<UserIdentity>>>()

/** Real component user/session rows keep every test on the production session-validation path. */
export function authIdentity(t: Backend, name: string): Promise<UserIdentity> {
  let users = identities.get(t)
  if (users === undefined) { users = new Map(); identities.set(t, users) }
  let identity = users.get(name)
  if (identity === undefined) {
    identity = (async () => {
      const now = Date.now()
      const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: 'user', data: { name, email: `${name}@example.invalid`, emailVerified: false, createdAt: now, updatedAt: now } } })
      const session = await t.mutation(components.betterAuth.adapter.create, { input: { model: 'session', data: { userId: user._id, token: `test-session-${user._id}`, expiresAt: now + 365 * 86_400_000, createdAt: now, updatedAt: now } } })
      return { issuer, subject: user._id, sessionId: session._id, tokenIdentifier: `${issuer}|${user._id}` }
    })()
    users.set(name, identity)
  }
  return identity
}

/** Preserve the synchronous fixture API while waiting for its component rows before each call. */
export function signedIn(t: Backend, subject: string, overrides: Partial<UserIdentity> = {}) {
  const caller = authIdentity(t, subject).then(identity => t.withIdentity({ ...identity, ...overrides }))
  return new Proxy(t.withIdentity({ issuer, subject }), {
    get(target, name, receiver) {
      if (name === 'query' || name === 'mutation' || name === 'action' || name === 'run') {
        return async (...args: unknown[]) => { const ready = await caller; return Reflect.apply(ready[name], ready, args) }
      }
      return Reflect.get(target, name, receiver)
    },
  })
}

export type Caller = ReturnType<typeof signedIn>

/** The principal key a signed-in caller is stored under. */
export async function keyOf(as: Caller): Promise<string> {
  return as.run(async (ctx) => (await principalFromAuth(ctx)).key as string)
}

/** Another person joins the household with the owner's invite, under their own display name. */
export async function joinHousehold(t: Backend, owner: Caller, householdId: Id<'households'>, subject: string, displayName: string): Promise<Caller> {
  const member = signedIn(t, subject)
  const { code } = await owner.mutation(api.households.createInvite, { householdId })
  await member.mutation(api.households.joinWithInvite, { code, displayName })
  return member
}

export const label = (source: string) => ({ source, confidence: 'verified' as const })

/**
 * Builds a household the way a person would through intake: two machine-washable
 * garments with label-verified care, one garment with unknown care, one detergent
 * with a verified dose rule, and one verified top-loader with a 40-minute normal cycle.
 */
export async function intakeHousehold(as: Caller) {
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Home', displayName: 'Pat' })
  const shirt = await as.mutation(api.inventory.createTextile, { householdId, name: 'White tee', color: 'White', colorGroup: 'light', firstWash: false })
  const towel = await as.mutation(api.inventory.createTextile, { householdId, name: 'Cream towel', color: 'Cream', colorGroup: 'light', bulkUnits: 2 })
  const sweater = await as.mutation(api.inventory.createTextile, { householdId, name: 'Mystery sweater', color: 'Grey' })
  for (const textileId of [shirt, towel]) {
    await as.mutation(api.inventory.setCare, { textileId, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, restrictions: [], provenance: label('care label read at intake') })
  }
  const detergent = await as.mutation(api.inventory.createSupply, { householdId, name: 'Tide HE liquid', kind: 'chemical', use: 'detergent', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'HE liquid', form: 'liquid', highEfficiencyCompatible: true }, provenance: label('Tide bottle label') })
  const rule = await as.mutation(api.inventory.saveRule, { supplyId: detergent, dose: { amount: 30, unit: 'ml', measurementCue: 'fill to line 2' }, stage: 'wash', placement: 'detergent_compartment', timing: 'before cycle start', provenance: label('Tide bottle label') })
  const machine = await as.mutation(api.inventory.createMachine, { householdId, name: 'Top loader', model: 'SWNNX2', applianceType: 'top_load_washer', capacityUnits: 8, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['detergent_compartment', 'direct_to_drum'], cycleMinutes: { normal: 40 }, provenance: label('machine data plate') })
  return { householdId, shirt, towel, sweater, detergent, rule, machine }
}

/** Plans the given garments and returns the stored plan with its load states. */
export async function planFor(as: Caller, householdId: Id<'households'>, selectedTextileIds: Id<'textiles'>[], pass: Omit<FunctionArgs<typeof api.plans.recompute>, 'householdId' | 'selectedTextileIds' | 'clientInputHash'> = {}) {
  const { planId } = await as.mutation(api.plans.recompute, { householdId, selectedTextileIds, clientInputHash: 'browser-draft', ...pass })
  const stored = await as.query(api.plans.get, { planId })
  if (stored === null) throw new Error('Plan was not stored')
  return stored
}

/** A cap printed with marks 1, 3 and 5; the label prints 39 ml for line 3 only. */
export const capMeasure = { kind: 'cap' as const, marks: [{ label: '1' }, { label: '3', amount: 39, unit: 'ml' }, { label: '5' }] }

export const capCells = (he: string, standard: string) => [
  { machineClass: 'he' as const, amount: 1, unit: 'cap', mark: he },
  { machineClass: 'standard' as const, amount: 1, unit: 'cap', mark: standard },
]

/** A detergent measured with that cap, its label directions transcribed with HE and standard columns. */
export async function capDetergent(as: Caller, householdId: Id<'households'>) {
  const supplyId = await as.mutation(api.inventory.createSupply, { householdId, name: 'Tide cap', kind: 'chemical', use: 'detergent', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'HE liquid', form: 'liquid' }, measure: capMeasure, provenance: label('Tide cap label') })
  await as.mutation(api.inventory.saveLabelDirections, {
    supplyId,
    measure: capMeasure,
    stage: 'wash',
    placement: 'detergent_compartment',
    timing: 'before cycle start',
    rows: [
      { loadSizes: ['small', 'medium'], cells: capCells('1', '3') },
      { loadSizes: ['large', 'extra_large'], cells: capCells('3', '5') },
    ],
    provenance: label('Tide cap label'),
  })
  return supplyId
}

/** A verified coin dryer: its three heat buttons in its own words, and 64 minutes for one start. */
export async function addDryer(as: Caller, householdId: Id<'households'>) {
  return as.mutation(api.inventory.createMachine, {
    householdId,
    name: 'Dryer',
    applianceType: 'tumble_dryer',
    capacityUnits: 12,
    capacityConfidence: 'verified',
    heatSettings: [{ heat: 'high', label: 'High temp' }, { heat: 'medium', label: 'Medium temp' }, { heat: 'low', label: 'Low temp' }],
    cycleMinutes: { timed: 64 },
    provenance: label('dryer plate'),
  })
}

/** Confirmed machine-wash care read from the label, with its drying symbol when it has one. */
export async function dryingCare(as: Caller, textileId: Id<'textiles'>, dryMethod?: 'tumble_dry' | 'line_dry' | 'dry_flat' | 'do_not_tumble_dry', dryHeat?: 'no_heat' | 'low' | 'medium' | 'high') {
  return as.mutation(api.inventory.setCare, {
    textileId,
    material: 'cotton',
    washMethod: 'machine',
    cycle: 'normal',
    maxTemperatureC: 40,
    restrictions: [],
    ...(dryMethod === undefined ? {} : { dryMethod }),
    ...(dryHeat === undefined ? {} : { dryHeat }),
    provenance: label('care label'),
  })
}

/**
 * A household that washes and dries: an HE front-loader with a 40-minute normal cycle, the dryer,
 * the cap detergent, a verified sheet dosed one per load, and three garments: a tee that tumbles
 * on low, a sweater that must not tumble, and a scarf whose drying is not on record.
 */
export async function dryerHousehold(as: Caller) {
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Home', displayName: 'Pat' })
  const washer = await as.mutation(api.inventory.createMachine, { householdId, name: 'Front-loader', applianceType: 'front_load_washer', highEfficiency: true, capacityUnits: 12, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['detergent_compartment', 'direct_to_drum'], cycleMinutes: { normal: 40 }, provenance: label('washer plate') })
  const dryer = await addDryer(as, householdId)
  const detergent = await capDetergent(as, householdId)
  const sheetMeasure = { kind: 'count' as const, countUnit: 'sheet' as const }
  const sheets = await as.mutation(api.inventory.createSupply, { householdId, name: 'Bounce', kind: 'dryer_sheet', measure: sheetMeasure, provenance: label('Bounce box') })
  await as.mutation(api.inventory.saveLabelDirections, { supplyId: sheets, measure: sheetMeasure, stage: 'dry', placement: 'dryer_drum', timing: 'before starting the dryer', rows: [{ cells: [{ amount: 1, unit: 'sheet' }] }], provenance: label('Bounce box') })
  const garment = (name: string) => as.mutation(api.inventory.createTextile, { householdId, name, color: 'White', colorGroup: 'light', firstWash: false })
  const tee = await garment('Tee')
  const sweater = await garment('Sweater')
  const scarf = await garment('Scarf')
  await dryingCare(as, tee, 'tumble_dry', 'low')
  await dryingCare(as, sweater, 'do_not_tumble_dry')
  await dryingCare(as, scarf)
  return { householdId, washer, dryer, detergent, sheets, tee, sweater, scarf }
}

const fixturePrefix = /^sanitized-fixture:/

/** Replaces sample evidence with the label it names, read and verified, the way a person would confirm it. */
function readLabel<T extends { source?: string; status?: string; confidence?: string }>(evidence: T): T {
  const source = evidence.source?.replace(fixturePrefix, '')
  return { ...evidence, ...(source === undefined ? {} : { source }), ...(evidence.status === undefined ? {} : { status: 'verified' }), ...(evidence.confidence === undefined ? {} : { confidence: 'verified' }) }
}

/**
 * Seeds the development sample inventory into a new household, then confirms every care label,
 * product label, and data plate at the source the fixture names. Needs WASHCLOSET_DEV_FIXTURES.
 */
export async function verifiedSampleHousehold(t: Backend, as: Caller) {
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Sample home', displayName: 'Sam' })
  const seeded = await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  await t.run(async (ctx) => {
    for (const care of await ctx.db.query('care').collect()) {
      const provenance = readLabel(care.provenance)
      const complete = care.washMethod !== undefined && care.washMethod !== 'unknown' && (care.washMethod !== 'machine' || care.cycle !== undefined)
      await ctx.db.patch(care._id, { provenance, status: complete ? 'confirmed' : 'needs_confirmation' })
    }
    for (const supply of await ctx.db.query('supplies').collect()) await ctx.db.patch(supply._id, { provenance: readLabel(supply.provenance) })
    for (const rule of await ctx.db.query('rules').collect()) await ctx.db.patch(rule._id, { provenance: readLabel(rule.provenance) })
    for (const machine of await ctx.db.query('machines').collect()) {
      const profile = machine.dispensingProfile
      await ctx.db.patch(machine._id, {
        provenance: readLabel(machine.provenance),
        capacityConfidence: 'verified',
        dispensingProfile: {
          ...profile,
          ...(profile.evidence === undefined ? {} : { evidence: readLabel(profile.evidence) }),
          ...(profile.evidenceConfidence === undefined ? {} : { evidenceConfidence: 'verified' }),
          ...(profile.compartments === undefined ? {} : {
            compartments: profile.compartments.map((compartment) => (typeof compartment === 'string' || compartment.evidence === undefined ? compartment : { ...compartment, evidence: readLabel(compartment.evidence) })),
          }),
        },
      })
    }
    const machines = await ctx.db.query('machines').collect()
    const preferred = machines.find((machine) => machine.fixtureKey === 'speed-queen-front-loader-pool')
    await ctx.db.patch(householdId, { planning: { colorPolicy: 'separate_first_wash', optimization: 'protect_clothes', currency: 'USD', washerPricePerStart: 2, ...(preferred === undefined ? {} : { preferredMachineId: preferred._id }) } })
  })
  return { householdId, ...seeded }
}

/** Convex ids back to the sample fixture's own ids, through each row's fixture key. */
export async function fixtureIds(t: Backend): Promise<Map<string, string>> {
  const pairs = await t.run(async (ctx) => {
    const found: Array<[string, string]> = []
    for (const table of ['textiles', 'supplies', 'rules', 'machines'] as const) {
      for (const row of await ctx.db.query(table).collect()) if (row.fixtureKey !== undefined) found.push([row._id, row.fixtureKey])
    }
    return found
  })
  return new Map(pairs)
}

/**
 * Washes garments the way a person finishes a load: plans them, starts the first load, confirms every
 * step (a step whose dose waits for the machine is skipped), and completes it.
 */
export async function washLoad(as: Caller, householdId: Id<'households'>, textileIds: Id<'textiles'>[], idempotencyKey = 'wash') {
  const planned = await planFor(as, householdId, textileIds)
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey })
  await finishSteps(as, sessionId)
  const completed = await as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey })
  return { sessionId, planned, completed }
}

/**
 * Records every step of a running load in order: tasks and product steps confirmed, the drum and the
 * dryer said to be `size` full, and a dose still to settle skipped. The wash is said to have finished
 * before the first drying step.
 */
export async function finishSteps(as: Caller, sessionId: Id<'sessions'>, size: LoadSize = 'medium', shownMinutes?: number) {
  for (;;) {
    const detail = await as.query(api.execution.sessionDetail, { sessionId })
    const step = detail.actions.find((action) => action.status === 'pending')
    if (step === undefined) return
    if (isDryerPhase(step.phase) && detail.washFinishedAt === null) await as.mutation(api.execution.washFinished, { sessionId })
    if (step.kind === 'task' && (step.task === 'drum_fullness' || step.task === 'dryer_fullness')) await as.mutation(api.execution.recordDrumFullness, { sessionId, machine: step.task === 'drum_fullness' ? 'washer' : 'dryer', size })
    else if (step.kind === 'task') await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed', ...(step.task === 'start' && shownMinutes !== undefined ? { minutes: shownMinutes } : {}) })
    else if (step.dose.amount > 0) await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed', usage: { supplyId: step.supplyId as Id<'supplies'>, amount: step.dose.amount, unit: step.dose.unit, ...(step.dose.mark === undefined ? {} : { mark: step.dose.mark }), ...(step.dose.fractionOfMark === undefined ? {} : { fractionOfMark: step.dose.fractionOfMark }), ...(step.dose.target === undefined ? {} : { target: step.dose.target }), ...(step.dose.approximate === undefined ? {} : { approximate: step.dose.approximate }), placement: step.placement } })
    else await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'skipped' })
  }
}


/**
 * Start a load the way the app does: confirm the recipe for the washer it starts on, then start.
 * A failed confirm is ignored so a test expecting Start to refuse still sees Start's own error.
 */
export async function startLoad(as: Caller, args: FunctionArgs<typeof api.execution.start>): Promise<FunctionReturnType<typeof api.execution.start>> {
  const plan = await as.query(api.plans.get, { planId: args.planId }).catch(() => null)
  const load = plan?.result.loads.find((entry) => entry.id === args.loadId) ?? plan?.result.loads[0]
  const machineId = args.machineId ?? (load?.machineId as Id<'machines'> | null | undefined) ?? null
  if (plan !== null && plan !== undefined && load !== undefined && machineId !== null) {
    await as.mutation(api.plans.confirmRecipe, { planId: args.planId, loadId: load.id, machineId }).catch(() => undefined)
  }
  return as.mutation(api.execution.start, args)
}
