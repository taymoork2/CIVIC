import { expect, test } from 'vitest'
import type { FunctionArgs } from 'convex/server'
import { plan, productLoadFingerprint, productWashContextFingerprint, sha256 } from '@washcloset/planner'
import { canonicalPlannerInput } from './plans'
import manifest from '../docs/research/owner-product-integration/output/manifest.json'
import tideAdditions from '../docs/research/owner-product-integration/tide-additions/output/manifest.json'
import { api, internal } from './_generated/api'
import { finishSteps, intakeHousehold, newBackend, planFor, signedIn, startLoad, type Backend, type Caller } from './harness.testing'
import type { Id } from './_generated/dataModel'

async function reference(t: Backend, as: Caller, supplyId: Id<'supplies'>, key = 'tide-original-liquid-121108', selected?: string[]) {
  const entry = [...manifest.entries, ...tideAdditions.entries].find((entry) => entry.variant.key === `owner-reference:${key}:us`)!
  const extraction = { ...entry, inputSha256: sha256(JSON.stringify(entry)), sources: entry.sources.map((source) => ({ ...source, sha256: sha256(source.snapshot.trim()) })) } as FunctionArgs<typeof internal.catalog.ingest>
  const { revisionId, variantId } = await t.mutation(internal.catalog.ingest, extraction)
  const reviewId = await t.mutation(internal.catalog.review, { revisionId, acceptedClaimIds: entry.claims.map((claim) => claim.id), rationale: 'Synthetic source-fidelity review of the committed packet; no physical acceptance.', reviewer: 'test' })
  const confirmation = { market: entry.variant.market, packIdentifier: entry.variant.packIdentifier, labelRevision: entry.labelRevision }
  const match = { holding: { kind: 'product' as const, id: supplyId }, reviewId, acceptedClaimIds: selected ?? entry.claims.map((claim) => claim.id), confirmation }
  await as.mutation(api.catalog.match, match)
  return { match, revisionId, variantId, reviewId }
}
async function argsFor(as: Caller, supplyId: Id<'supplies'>, optionId = 'tide-standard') {
  const draft = await as.query(api.catalog.directionsDraft, { supplyId })
  if (draft === null) throw new Error('Expected a pinned directions draft')
  return { supplyId, revisionId: draft.revisionId, reviewId: draft.reviewId, stateToken: draft.stateToken, optionId, confirmedClaimIds: draft.requiredClaimIds,
    confirmation: { market: draft.market, packIdentifier: draft.packIdentifier, labelRevision: draft.labelRevision, physicalPackChecked: true, factsChecked: true, replaceDirections: true, ordinaryFillOnly: true } }
}
async function setup() {
  const t = newBackend()
  const as = signedIn(t, 'directions-owner')
  const home = await intakeHousehold(as)
  const pinned = await reference(t, as, home.detergent)
  return { t, as, home, pinned }
}
const rulesFor = (t: Backend, supplyId: Id<'supplies'>) => t.run(async (ctx) => (await ctx.db.query('rules').collect()).filter((rule) => rule.supplyId === supplyId))

test('product checks cross the public planning API, stay load-specific and reject foreign supplies', async () => {
  const { t, as, home } = await setup()
  await reference(t, as, home.detergent, 'tide-pods-spring-meadow-032503')
  await as.mutation(api.catalog.applyDirections, await argsFor(as, home.detergent, 'tide-pods'))
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, placements: ['direct_to_drum'] })
  const pending = await planFor(as, home.householdId, [home.shirt])
  const cards = await as.query(api.plans.questions, { planId: pending.planId })
  const card = cards.find((entry) => entry.kind === 'product_load_confirmation')!
  expect(card.productCheck?.sourceLoadCategories).toEqual(['smaller', 'standard', 'larger'])
  const check = { supplyId: home.detergent, sourceDigest: card.productCheck!.sourceDigest, loadFingerprint: card.productCheck!.loadFingerprint, colorfastnessChecked: false, sourceLoadCategory: 'standard' as const }
  const ready = await planFor(as, home.householdId, [home.shirt], { productLoadConfirmations: [check] })
  expect(ready.result.status).toBe('ready')
  expect(ready.result.loads[0]!.treatments[0]!.dose.amount).toBe(2)
  expect(ready.result.loads[0]!.treatments[0]!.productConfirmation).toEqual(check)
  expect((await as.query(api.plans.get, { planId: ready.planId }))?.pass.productLoadConfirmations).toEqual([check])
  const foreign = await intakeHousehold(signedIn(t, 'foreign-check-owner'))
  await expect(planFor(as, home.householdId, [home.shirt], { productLoadConfirmations: [{ ...check, supplyId: foreign.detergent }] })).rejects.toThrow('Forbidden')
  await as.mutation(api.inventory.setCare, { textileId: home.shirt, material: 'linen', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, restrictions: [], provenance: { source: 'synthetic changed label', confidence: 'verified' } })
  expect((await planFor(as, home.householdId, [home.shirt], { productLoadConfirmations: [check] })).result.status).toBe('needs_confirmation')
})

test.each(['unchanged', 'observed pack', 'changed clothes', 'detached source'] as const)('product checks are revalidated at washer start: %s', async (change) => {
  const { t, as, home } = await setup()
  await reference(t, as, home.detergent, 'tide-pods-spring-meadow-032503')
  await as.mutation(api.catalog.applyDirections, await argsFor(as, home.detergent, 'tide-pods'))
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, placements: ['direct_to_drum'] })
  if (change === 'observed pack') await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, provenance: { source: 'Observed synthetic pack', confidence: 'observed' } })
  const pending = await planFor(as, home.householdId, [home.shirt])
  const requirement = pending.result.loads[0]!.treatments[0]!.productRequirement!
  const check = { supplyId: home.detergent, sourceDigest: requirement.sourceDigest, loadFingerprint: requirement.loadFingerprint, colorfastnessChecked: false, sourceLoadCategory: 'smaller' as const }
  const ready = await planFor(as, home.householdId, [home.shirt], { productLoadConfirmations: [check] })
  const { sessionId } = await startLoad(as, { planId: ready.planId, loadId: ready.result.loads[0]!.id, idempotencyKey: 'checked-pods' })
  const captured = await t.run((ctx) => ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique())
  expect(captured?.actions.find((entry) => entry.kind === 'treatment')?.productRequirement).toBeDefined()
  for (let count = 0; count < 20; count += 1) {
    const detail = await as.query(api.execution.sessionDetail, { sessionId })
    const action = detail.actions.find((entry) => entry.status === 'pending')!
    if (action.kind === 'task' && action.task === 'start') {
      const before = await t.run(async (ctx) => ({ session: await ctx.db.get(sessionId), timeline: await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique() }))
      expect(before.session?.machineStartedAt).toBeUndefined()
      expect(before.timeline?.actions.filter((entry) => entry.kind === 'treatment').map((entry) => ({ status: entry.status, phase: entry.phase, timing: entry.timing, requirement: entry.productRequirement }))).toEqual([expect.objectContaining({ status: 'confirmed', requirement: expect.any(Object) })])
      if (change === 'changed clothes') await t.run(async (ctx) => {
        const care = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', home.shirt)).unique()
        await ctx.db.patch(care!._id, { material: 'linen' })
      })
      if (change === 'detached source') await t.run((ctx) => ctx.db.patch(home.detergent, { catalogBinding: undefined }))
      const start = () => as.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'confirmed' })
      if (change === 'unchanged' || change === 'observed pack') {
        await start()
        expect((await t.run((ctx) => ctx.db.get(sessionId)))?.machineStartedAt).toBeDefined()
      } else {
        await expect(start()).rejects.toThrow('changed')
        expect((await t.run((ctx) => ctx.db.get(sessionId)))?.machineStartedAt).toBeUndefined()
      }
      return
    }
    await as.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'confirmed', ...(action.kind === 'treatment' ? { usage: { supplyId: home.detergent, amount: action.dose.amount, unit: action.dose.unit, placement: action.placement } } : {}) })
  }
  throw new Error('Start not reached')
})

test('qualitative cap targets and load checks persist into actual use and immutable history', async () => {
  const { t, as, home } = await setup()
  await reference(t, as, home.detergent, 'tide-free-gentle-235843')
  await as.mutation(api.catalog.applyDirections, await argsFor(as, home.detergent, 'tide-free-gentle-standard'))
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, highEfficiency: false, placements: ['direct_to_drum'] })
  const pending = await planFor(as, home.householdId, [home.shirt])
  const requirement = pending.result.loads[0]!.treatments[0]!.productRequirement!
  const check = { supplyId: home.detergent, sourceDigest: requirement.sourceDigest, loadFingerprint: requirement.loadFingerprint, colorfastnessChecked: true }
  const ready = await planFor(as, home.householdId, [home.shirt], { productLoadConfirmations: [check] })
  const { sessionId } = await startLoad(as, { planId: ready.planId, loadId: ready.result.loads[0]!.id, idempotencyKey: 'native-cap-history' })
  await as.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'medium' })
  await finishSteps(as, sessionId, 'medium')
  await as.mutation(api.sessions.complete, { sessionId, planInputHash: ready.inputHash, idempotencyKey: 'native-cap-history' })
  const records = await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt })
  expect(records[0]!.products[0]).toMatchObject({ amount: 1, unit: 'cap', mark: 'Bar 2', target: 'below' })
  expect(records[0]!.products[0]).not.toHaveProperty('fractionOfMark')
  expect(records[0]!.activityContext?.treatments?.[0]).toMatchObject({ dose: { target: 'below' }, productConfirmation: check, productRequirement: requirement })
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, name: 'Changed later product' })
  expect((await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt }))[0]!.products[0]).toMatchObject({ mark: 'Bar 2', target: 'below' })
})

test('explicit application atomically replaces old rules, retains the pin/private safety, and invalidates plans', async () => {
  const { t, as, home, pinned } = await setup()
  const before = await t.run((ctx) => ctx.db.get(home.detergent))
  const originalRules = await rulesFor(t, home.detergent)
  const planned = await planFor(as, home.householdId, [home.shirt])
  const args = await argsFor(as, home.detergent, 'tide-he')
  expect(await rulesFor(t, home.detergent)).toEqual(originalRules)
  const ids = await as.mutation(api.catalog.applyDirections, args)
  const saved = await rulesFor(t, home.detergent)
  expect(saved).toHaveLength(3)
  expect(saved.map((rule) => rule.dose)).toEqual([
    { amount: 1, unit: 'cap', mark: 'Bar 1', fractionOfMark: 0.8 },
    { amount: 1, unit: 'cap', mark: 'Bar 3', fractionOfMark: 0.8 },
    { amount: 1, unit: 'cap', mark: 'Bar 5' },
  ])
  expect(saved.every((rule) => ids.includes(rule._id) && rule.provenance.source.includes(pinned.reviewId) && rule.provenance.confidence === 'verified')).toBe(true)
  expect(saved.every((rule) => rule.provenance.source.length <= 200)).toBe(true)
  const after = await t.run((ctx) => ctx.db.get(home.detergent))
  expect(after?.catalogBinding).toEqual(before?.catalogBinding)
  expect(after?.safety).toEqual({ ...before?.safety, capabilities: expect.arrayContaining([expect.objectContaining({ kind: 'protease', status: 'present' })]) })
  expect(after?.formulation).toEqual(before?.formulation)
  expect(after?.name).toBe(before?.name)
  expect(after?.measure?.marks?.every((mark) => mark.amount === undefined && mark.unit === undefined)).toBe(true)
  expect((await t.run((ctx) => ctx.db.get(planned.planId)))?.status).toBe('stale')
  await expect(as.mutation(api.catalog.applyDirections, args)).rejects.toThrow('changed')
  expect(await rulesFor(t, home.detergent)).toEqual(saved)
})

test('authentication, membership, exact physical pack, selected facts and explicit replacement fail closed', async () => {
  const { t, as, home } = await setup()
  const args = await argsFor(as, home.detergent)
  const before = await rulesFor(t, home.detergent)
  await expect(t.query(api.catalog.directionsDraft, { supplyId: home.detergent })).rejects.toThrow('Unauthenticated')
  const outsider = signedIn(t, 'outsider')
  await expect(outsider.query(api.catalog.directionsDraft, { supplyId: home.detergent })).rejects.toThrow('Forbidden')
  await expect(outsider.mutation(api.catalog.applyDirections, args)).rejects.toThrow('Forbidden')
  await expect(t.mutation(api.catalog.applyDirections, args)).rejects.toThrow('Unauthenticated')
  for (const change of [{ physicalPackChecked: false }, { factsChecked: false }, { replaceDirections: false }, { market: 'CA' }, { packIdentifier: 'other' }, { labelRevision: 'other' }, { ordinaryFillOnly: false }]) {
    await expect(as.mutation(api.catalog.applyDirections, { ...args, confirmation: { ...args.confirmation, ...change } })).rejects.toThrow()
    expect(await rulesFor(t, home.detergent)).toEqual(before)
  }
  for (const confirmedClaimIds of [[], args.confirmedClaimIds.slice(1), [...args.confirmedClaimIds, 'lipase']]) {
    await expect(as.mutation(api.catalog.applyDirections, { ...args, confirmedClaimIds })).rejects.toThrow('every required')
    expect(await rulesFor(t, home.detergent)).toEqual(before)
  }
})

test('rule edits, binding changes, review/revision mismatch and unmatching preserve prior directions', async () => {
  const { t, as, home, pinned } = await setup()
  const initial = await argsFor(as, home.detergent)
  await t.run((ctx) => ctx.db.patch(home.rule, { dose: { amount: 41, unit: 'ml' } }))
  const edited = await rulesFor(t, home.detergent)
  await expect(as.mutation(api.catalog.applyDirections, initial)).rejects.toThrow('changed')
  const fresh = await argsFor(as, home.detergent)
  const secondReview = await t.mutation(internal.catalog.review, { revisionId: pinned.revisionId, acceptedClaimIds: pinned.match.acceptedClaimIds, rationale: 'A separate review does not move a pinned reference.', reviewer: 'second-test' })
  expect((await as.query(api.catalog.directionsDraft, { supplyId: home.detergent }))?.reviewId).toBe(pinned.reviewId)
  await expect(as.mutation(api.catalog.applyDirections, { ...fresh, reviewId: secondReview })).rejects.toThrow('changed')
  await as.mutation(api.catalog.match, { ...pinned.match, reviewId: secondReview })
  await expect(as.mutation(api.catalog.applyDirections, fresh)).rejects.toThrow('changed')
  await as.mutation(api.catalog.unmatch, { holding: pinned.match.holding })
  expect(await as.query(api.catalog.directionsDraft, { supplyId: home.detergent })).toBeNull()
  await expect(as.mutation(api.catalog.applyDirections, fresh)).rejects.toThrow('pinned')
  expect(await rulesFor(t, home.detergent)).toEqual(edited)
  await as.mutation(api.catalog.match, pinned.match)
  await t.run(async (ctx) => {
    const supply = (await ctx.db.get(home.detergent))!
    const revision = (await ctx.db.get(pinned.revisionId))!
    const { _id, _creationTime, ...copy } = revision
    const otherRevision = await ctx.db.insert('catalogRevisions', { ...copy, digest: sha256('synthetic mismatch') })
    const other = await ctx.db.insert('catalogReviews', { revisionId: otherRevision, acceptedClaimIds: pinned.match.acceptedClaimIds, rationale: 'Synthetic corrupt pin', reviewer: 'test', createdAt: 1 })
    await ctx.db.patch(home.detergent, { catalogBinding: { ...supply.catalogBinding!, reviewId: other } })
  })
  await expect(as.query(api.catalog.directionsDraft, { supplyId: home.detergent })).rejects.toThrow('no longer agree')
  expect(await rulesFor(t, home.detergent)).toEqual(edited)
})

test('unselected restrictions and unresolved routes refuse application with no mutation', async () => {
  const { t, as, home } = await setup()
  const before = await rulesFor(t, home.detergent)
  await reference(t, as, home.detergent, 'tide-original-liquid-121108', ['directions-main-wash-0'])
  const missing = await argsFor(as, home.detergent)
  await expect(as.mutation(api.catalog.applyDirections, missing)).rejects.toThrow('every required')
  for (const [key, optionId] of [['downy-rinse-refresh-free-gentle-103111', 'downy-direct-rinse'], ['oxiclean-versatile-free', 'oxi-soak'], ['oxiclean-white-revive-paks', 'paks-soak'], ['lysol-crisp-linen-line-1833', 'lysol-presoak']]) {
    await reference(t, as, home.detergent, key)
    await expect(as.mutation(api.catalog.applyDirections, await argsFor(as, home.detergent, optionId))).rejects.toThrow('unresolved')
    expect(await rulesFor(t, home.detergent)).toEqual(before)
  }
})

test('sanitizer saves native rinse doses and a cotton-only guard, while machine contact stays independently unresolved', async () => {
  const { t, as, home } = await setup()
  await reference(t, as, home.detergent, 'lysol-crisp-linen-line-1833')
  await as.mutation(api.catalog.applyDirections, await argsFor(as, home.detergent, 'lysol-rinse'))
  const saved = await rulesFor(t, home.detergent)
  expect(saved.map((rule) => rule.conditions)).toEqual([{ machineClasses: ['he'], materials: ['cotton'] }, { machineClasses: ['standard'], materials: ['cotton'] }])
  const supply = await t.run((ctx) => ctx.db.get(home.detergent))
  expect(supply?.safety?.sanitizing).toMatchObject({ route: 'rinse', minimumContactMinutes: 16 })
  expect(supply?.safety?.incompatibleMaterials).toEqual(['silk', 'wool'])
  expect(saved.every((rule) => rule.provenance.source.length <= 200)).toBe(true)
  // An ordinary detergent stays separate; a source match never selects an optional sanitizer.
  const detergent = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Synthetic manual detergent', kind: 'chemical', use: 'detergent', formulation: { name: 'synthetic', form: 'liquid' }, safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, provenance: { source: 'synthetic test label', confidence: 'verified' } })
  await as.mutation(api.inventory.saveRule, { supplyId: detergent, dose: { amount: 30, unit: 'ml' }, stage: 'wash', placement: 'detergent_compartment', timing: 'before start', provenance: { source: 'synthetic test label', confidence: 'verified' } })
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, highEfficiency: false, placements: ['detergent_compartment', 'softener_compartment'] })
  const without = await planFor(as, home.householdId, [home.shirt])
  expect(without.result.loads.flatMap((load) => load.treatments).some((step) => step.supplyId === home.detergent)).toBe(false)
  const withSanitizer = await planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [home.detergent] })
  expect(withSanitizer.result.reasons.some((reason) => reason.details.cause === 'sanitizer_contact_time')).toBe(true)
  const compute = () => planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [home.detergent] })
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, rinseContact: { normal: { minutes: 15, placement: 'softener_compartment', source: 'Synthetic release-to-drain observation' } } })
  expect((await compute()).status).toBe('needs_confirmation')
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, rinseContact: { normal: { minutes: 16, placement: 'direct_to_drum', source: 'Synthetic release-to-drain observation', timing: 'release during rinse' } } })
  expect((await compute()).status).toBe('needs_confirmation')
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, rinseContact: { normal: { minutes: 16, placement: 'softener_compartment', source: 'Synthetic release-to-drain observation' } } })
  expect((await compute()).status).toBe('ready')
  await as.mutation(api.inventory.setCare, { textileId: home.shirt, material: 'cotton/wool blend', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, restrictions: [], provenance: { source: 'synthetic label', confidence: 'verified' } })
  const blend = await compute()
  expect(blend.status).toBe('needs_confirmation')
  expect(blend.result.loads.flatMap((load) => load.treatments).filter((step) => step.supplyId === home.detergent).every((step) => step.confirmation !== 'confirmed')).toBe(true)
})

test('additional Tide directions round-trip native qualifiers and refuse wrong pack or revision', async () => {
  const { t, as, home } = await setup()
  for (const [key, optionId] of [['tide-free-gentle-235843', 'tide-free-gentle-he'], ['tide-pods-spring-meadow-032503', 'tide-pods']]) {
    await reference(t, as, home.detergent, key)
    const args = await argsFor(as, home.detergent, optionId)
    const oldRules = await rulesFor(t, home.detergent)
    for (const field of ['packIdentifier', 'labelRevision'] as const) await expect(as.mutation(api.catalog.applyDirections, { ...args, confirmation: { ...args.confirmation, [field]: 'other' } })).rejects.toThrow('exact physical pack')
    expect(await rulesFor(t, home.detergent)).toEqual(oldRules)
    await as.mutation(api.catalog.applyDirections, args)
    const saved = await rulesFor(t, home.detergent)
    expect(saved).toHaveLength(3)
    if (key.includes('free-gentle')) {
      expect(saved.map((rule) => rule.dose)).toEqual([{ amount: 1, unit: 'cap', mark: 'Bar 2', target: 'below' }, { amount: 1, unit: 'cap', mark: 'Bar 3', target: 'just_below' }, { amount: 1, unit: 'cap', mark: 'Bar 5' }])
    } else {
      expect(saved.map((rule) => rule.conditions.sourceLoadCategories)).toEqual([['smaller'], ['standard'], ['larger']])
      expect(saved.map((rule) => rule.dose.amount)).toEqual([1, 2, 3])
      expect(saved.every((rule) => rule.conditions.loadSizes === undefined)).toBe(true)
      expect((await t.run((ctx) => ctx.db.get(home.detergent)))?.use).toBe('pods')
    }
    await expect(as.mutation(api.catalog.applyDirections, args)).rejects.toThrow('changed')
  }
})

test('Downy/Oxi persist restrictions, native doses and refuse unconfirmed loads after another supply is added', async () => {
  const { t, as, home } = await setup()
  const normalDetergent = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Synthetic ordinary detergent', kind: 'chemical', use: 'detergent', formulation: { form: 'liquid' }, safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, provenance: { source: 'synthetic label', confidence: 'verified' } })
  await as.mutation(api.inventory.saveRule, { supplyId: normalDetergent, dose: { amount: 20, unit: 'ml' }, stage: 'wash', placement: 'direct_to_drum', timing: 'before clothes', provenance: { source: 'synthetic label', confidence: 'verified' } })
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, placements: ['direct_to_drum', 'softener_compartment'] })
  for (const [key, optionId, expectedDose] of [
    ['downy-rinse-refresh-free-gentle-103111', 'downy-rinse', { amount: 0.25, unit: 'US_cup', approximate: true }],
    ['downy-rinse-refresh-free-gentle-103111', 'downy-half-dispenser', { amount: 0.5, unit: 'dispenser' }],
    ['oxiclean-versatile-free', 'oxi-wash', { amount: 1, unit: 'scoop', mark: 'Line 1' }],
    ['oxiclean-white-revive-paks', 'paks-wash', { amount: 1, unit: 'pod' }],
  ] as const) {
    await reference(t, as, home.detergent, key)
    await as.mutation(api.catalog.applyDirections, await argsFor(as, home.detergent, optionId))
    expect((await rulesFor(t, home.detergent))[0]?.dose).toEqual(expectedDose)
    const supply = await t.run((ctx) => ctx.db.get(home.detergent))
    expect(supply?.safety?.sourceContract).toMatchObject({ requireColorfastness: true, mixing: key.startsWith('downy') ? 'no_bleach_or_liquid_softener' : 'regular_detergent_only' })
    const input = await t.run((ctx) => canonicalPlannerInput(ctx, home.householdId, [home.shirt], { mode: 'normal', loadPins: [], dismissedQuestions: [], excludedSupplyIds: [], optionalSupplyIds: [home.detergent] }))
    expect(plan(input).reasons.some((reason) => reason.details.cause === 'product_load_confirmation')).toBe(true)
    const confirmation = { supplyId: home.detergent, sourceDigest: supply!.safety!.sourceContract!.digest, loadFingerprint: productLoadFingerprint(input.textiles!), colorfastnessChecked: true, ...(key.startsWith('downy') ? { sourceLoadCategory: 'normal' as const } : {}), ...(key.includes('white-revive') ? { ordinaryWashRouteChecked: true, washContextFingerprint: productWashContextFingerprint(input.machines![0]!, 'normal', 40) } : {}) }
    const confirmed = plan({ ...input, productLoadConfirmations: [confirmation] })
    expect(confirmed.status).toBe('ready')
    const future = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: `Synthetic later booster ${optionId}`, kind: 'chemical', use: 'booster', formulation: { form: 'liquid' }, safety: { bleachKind: 'oxygen', incompatibleSupplyIds: [], incompatibleMaterials: [] }, provenance: { source: 'synthetic later label', confidence: 'verified' } })
    await as.mutation(api.inventory.saveRule, { supplyId: future, dose: { amount: 20, unit: 'ml' }, stage: 'wash', placement: 'direct_to_drum', timing: 'before clothes', provenance: { source: 'synthetic later label', confidence: 'verified' } })
    const afterAdding = await t.run((ctx) => canonicalPlannerInput(ctx, home.householdId, [home.shirt], { mode: 'normal', loadPins: [], dismissedQuestions: [], excludedSupplyIds: [], optionalSupplyIds: [home.detergent, future], productLoadConfirmations: [confirmation] }))
    expect(plan(afterAdding).reasons.some((reason) => reason.details.cause === 'chemical_combination_conflict')).toBe(true)
    await as.mutation(api.inventory.updateSupply, { supplyId: future, archived: true })
    // A full safety edit from an older sheet cannot erase the source policy.
    await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, safety: { bleachKind: supply!.safety!.bleachKind, incompatibleSupplyIds: [], incompatibleMaterials: [] } })
    expect((await t.run((ctx) => ctx.db.get(home.detergent)))?.safety?.sourceContract).toEqual(supply!.safety!.sourceContract)
    if (key.startsWith('oxiclean')) {
      for (const material of ['cotton/wool blend', 'cotton/silk blend', 'unknown']) {
        await as.mutation(api.inventory.setCare, { textileId: home.shirt, material, washMethod: 'machine', cycle: material.includes('wool') ? 'delicate' : 'normal', maxTemperatureC: 40, restrictions: [], provenance: { source: 'synthetic label', confidence: 'verified' } })
        const changed = await t.run((ctx) => canonicalPlannerInput(ctx, home.householdId, [home.shirt], { mode: 'normal', loadPins: [], dismissedQuestions: [], excludedSupplyIds: [], optionalSupplyIds: [home.detergent], productLoadConfirmations: [confirmation] }))
        expect(plan(changed).status).toBe('needs_confirmation')
        expect(plan(changed).reasons.some((reason) => reason.code === 'product_restriction')).toBe(true)
      }
      await as.mutation(api.inventory.setCare, { textileId: home.shirt, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, restrictions: [], provenance: { source: 'synthetic label', confidence: 'verified' } })
    }
  }
})

test('detaching or changing a source-backed identity prevents prior source directions from executing', async () => {
  const { t, as, home } = await setup()
  await reference(t, as, home.detergent, 'tide-pods-spring-meadow-032503')
  await as.mutation(api.catalog.applyDirections, await argsFor(as, home.detergent, 'tide-pods'))
  const input = () => t.run((ctx) => canonicalPlannerInput(ctx, home.householdId, [home.shirt], { mode: 'normal', loadPins: [], dismissedQuestions: [], excludedSupplyIds: [] }))
  await as.mutation(api.catalog.unmatch, { holding: { kind: 'product', id: home.detergent } })
  expect((await input()).supplies?.find((supply) => supply.id === home.detergent)?.labelEvidence?.status).toBe('unknown')
  await reference(t, as, home.detergent, 'tide-pods-spring-meadow-032503')
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, formulation: { form: 'powder' } })
  expect((await rulesFor(t, home.detergent)).every((rule) => rule.provenance.confidence === 'unknown')).toBe(true)
  expect((await input()).supplies?.find((supply) => supply.id === home.detergent)?.labelEvidence?.status).toBe('unknown')
})

test('a Tide Original pack brings its SmartLabel enzymes, so wool is held by fact and not by an unknown', async () => {
  const { t, as, home } = await setup()
  await as.mutation(api.catalog.applyDirections, await argsFor(as, home.detergent, 'tide-he'))
  const facts = (await t.run((ctx) => ctx.db.get(home.detergent)))?.safety?.capabilities
  expect(facts?.map((fact) => [fact.kind, fact.status])).toEqual([['protease', 'present'], ['amylase', 'present']])
  expect(facts?.[0]?.source).toContain('smartlabel.pg.com/en-us/00030772121108.html')
  expect(facts?.[0]?.retrievedAt).toBe(Date.parse('2026-10-07T00:00:00Z'))
})

test('pinning the pack is enough: the enzymes attach on match, and the backfill restores them for earlier pins', async () => {
  const { t, home } = await setup()
  const read = async () => (await t.run((ctx) => ctx.db.get(home.detergent)))?.safety?.capabilities?.map((fact) => fact.kind)
  expect(await read()).toEqual(['protease', 'amylase'])
  await t.run(async (ctx) => { const supply = await ctx.db.get(home.detergent); await ctx.db.patch(home.detergent, { safety: { ...supply!.safety!, capabilities: undefined } }) })
  expect(await read()).toBeUndefined()
  expect(await t.mutation(internal.catalog.backfillCatalogFacts, {})).toBeGreaterThan(0)
  expect(await read()).toEqual(['protease', 'amylase'])
})
