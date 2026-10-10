import type { FunctionArgs } from 'convex/server'
import { afterEach, beforeEach, expect, onTestFinished, test, vi } from 'vitest'

import { defaultPackingUnits, plan, sha256, type PlannerInput, type PlanResult } from '@washcloset/planner'
import manifest from '../docs/research/owner-product-integration/output/manifest.json'
import tideAdditions from '../docs/research/owner-product-integration/tide-additions/output/manifest.json'

import { api, internal } from './_generated/api'
import { ruleConditions } from './validators'
import type { Id } from './_generated/dataModel'
import { canonicalPlannerInput, type PlanPass, type StoredPlanResult } from './plans'
import { startLoad, addDryer, capCells, capDetergent, capMeasure, dryerHousehold, dryingCare, finishSteps, fixtureIds, intakeHousehold, label, newBackend, planFor, signedIn, verifiedSampleHousehold, type Backend, type Caller } from './harness.testing'

beforeEach(() => { vi.stubEnv('WASHCLOSET_DEV_FIXTURES', 'enabled') })
afterEach(() => { vi.unstubAllEnvs() })

test('automatic color protection uses recorded wash history and ignores the retired household override', async () => {
  const t = newBackend()
  const as = signedIn(t, 'automatic-colors')
  const home = await intakeHousehold(as)
  const dark = await as.mutation(api.inventory.createTextile, { householdId: home.householdId, name: 'Navy tee', colorGroup: 'dark' })
  await as.mutation(api.inventory.setCare, { textileId: dark, washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, restrictions: [], provenance: label('care label') })
  await as.mutation(api.inventory.setPlanning, { householdId: home.householdId, colorPolicy: 'allow' })
  const selected = [home.shirt, dark]
  const pass: PlanPass = { mode: 'normal', loadPins: [], dismissedQuestions: [], excludedSupplyIds: [] }
  const input = () => t.run((ctx) => canonicalPlannerInput(ctx, home.householdId, selected, pass))

  expect((await input()).policy?.colorPolicy).toBe('separate_first_wash')
  expect((await input()).textiles?.find((item) => item.id === dark)).toMatchObject({ firstWashState: 'unknown' })
  expect((await planFor(as, home.householdId, selected)).result.loads).toHaveLength(2)
  await as.mutation(api.inventory.updateTextile, { textileId: dark, firstWash: true })
  expect((await planFor(as, home.householdId, selected)).result.loads).toHaveLength(2)
  await as.mutation(api.inventory.updateTextile, { textileId: dark, firstWash: false })
  expect((await planFor(as, home.householdId, selected)).result.loads).toHaveLength(1)
  // Historical records with a completed wash do not need a fresh intake answer.
  await t.run((ctx) => ctx.db.patch(dark, { firstWash: undefined, washCount: 1 }))
  expect((await input()).textiles?.find((item) => item.id === dark)).toMatchObject({ firstWashState: 'washed' })
  expect((await planFor(as, home.householdId, selected)).result.loads).toHaveLength(1)
})

test('reconnecting recomputes from current data after another browser changed it', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await intakeHousehold(as)
  const first = await as.mutation(api.plans.recompute, { householdId: home.householdId, selectedTextileIds: [home.shirt], clientInputHash: 'offline-draft-hash' })
  expect(first.recomputed).toBe(true)
  expect(first.stale).toBe(true)

  await as.mutation(api.inventory.setCare, { textileId: home.shirt, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, restrictions: ['Do not bleach'], provenance: label('label reread') })
  expect((await as.query(api.plans.get, { planId: first.planId }))?.status).toBe('stale')
  const second = await as.mutation(api.plans.recompute, { householdId: home.householdId, selectedTextileIds: [home.shirt], clientInputHash: first.inputHash })
  expect(second.stale).toBe(true)
  expect(second.inputHash).not.toBe(first.inputHash)
  // The stale plan is replaced rather than kept forever.
  expect(await as.query(api.plans.get, { planId: first.planId })).toBeNull()
  expect(await t.run(async (ctx) => (await ctx.db.query('plans').collect()).length)).toBe(1)
})

/** Decision summary with stored ids translated back to fixture ids; reason numbering is order-dependent and omitted. */
function decisions(result: StoredPlanResult | PlanResult, ids: Map<string, string> = new Map()) {
  // Stored ids become fixture ids wherever they appear, including inside explanation text.
  const rename = (text: string) => [...ids].reduce((renamed, [id, fixtureId]) => renamed.replaceAll(id, fixtureId), text)
  const translate = (value: unknown) => JSON.parse(JSON.stringify(value ?? null, (_key, entry: unknown) => (typeof entry === 'string' ? rename(entry) : entry)))
  // Convex returns object keys in sorted order, so compare with sorted keys on both sides.
  const canonical = (value: unknown): unknown => (Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonical(entry)]))
    : value)
  const sorted = (values: unknown[]) => values.map((value) => JSON.stringify(canonical(value))).sort()
  return {
    status: result.status,
    cost: canonical(result.cost),
    loads: result.loads.map((load) => canonical(translate({ ...load, treatments: undefined, textileIds: undefined, owners: undefined, machineModelId: undefined })) as Record<string, unknown>)
      .map((load, index) => ({ ...load, textileIds: translate(result.loads[index]!.textileIds).sort(), treatments: sorted(translate(result.loads[index]!.treatments)) })),
    exclusions: sorted(result.exclusions.map((exclusion) => ({ textileId: translate(exclusion.textileId), codes: [...exclusion.reasonCodes].sort() }))),
    reasons: sorted(result.reasons.map(({ id: _id, textileIds, ...reason }) => translate({ ...reason, textileIds: translate(textileIds).sort() }))),
  }
}

async function plannedSample(t: Backend) {
  const as = signedIn(t, 'recompute-test-user')
  const sample = await verifiedSampleHousehold(t, as)
  // These synthetic labels exercise a detergent-only pass. The full inventory also
  // contains two rinse products that cannot share the softener compartment.
  const excludedSupplyIds = await t.run(async (ctx) => (await ctx.db.query('supplies').collect())
    .filter((supply) => supply.fixtureKey !== 'tide-ultra-concentrate').map((supply) => supply._id))
  return { as, sample, excludedSupplyIds, stored: await planFor(as, sample.householdId, sample.textileIds, { excludedSupplyIds }) }
}

test('a stored plan preserves the pure planner decisions for the current trial room', async () => {
  const t = newBackend()
  const { stored, sample, excludedSupplyIds } = await plannedSample(t)
  // The trial room now has twelve washers and twenty dryers; the historical two-washer
  // fixture has different capacities and cannot be used as its expected result.
  const input = await t.run((ctx) => canonicalPlannerInput(ctx, sample.householdId, sample.textileIds, { mode: 'normal', loadPins: [], dismissedQuestions: [], excludedSupplyIds }))
  expect(input.machines).toHaveLength(12)
  expect(input.dryers).toHaveLength(20)
  const pure = plan(input)

  expect(pure.status).toBe('ready')
  expect(stored.result.status).toBe('ready')
  const ids = await fixtureIds(t)
  expect(decisions(stored.result, ids)).toEqual(decisions(pure, ids))
  expect(stored.result.loads.flatMap((load) => load.treatments).some((step) => step.dose.amount === 30 && step.dose.measurementCue === 'fill to line 2' && step.placement === 'detergent_compartment')).toBe(true)
})

test('the unconfirmed trial inventory cannot turn catalog materials or product names into checked labels', async () => {
  const t = newBackend()
  const as = signedIn(t, 'trial-unconfirmed')
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Unconfirmed trial inventory' })
  const sample = await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  const stored = await planFor(as, householdId, sample.textileIds)
  const inventory = await as.query(api.inventory.list, { householdId })
  expect(inventory.textiles).toHaveLength(23)
  expect(inventory.machines).toHaveLength(32)
  expect(inventory.supplies).toHaveLength(6)
  expect(stored.result.status).toBe('needs_confirmation')
  expect(stored.result.exclusions).toHaveLength(23)
  expect(stored.result.reasons.some((reason) => reason.details.cause === 'unknown_care')).toBe(true)
  expect(stored.result.reasons.some((reason) => reason.details.cause === 'insufficient_product_evidence')).toBe(true)
  expect(stored.loadStates.every((load) => !load.startable)).toBe(true)
})

test('confirmed synthetic trial products still block two rinse additives sharing a dispenser', async () => {
  const t = newBackend()
  const as = signedIn(t, 'trial-rinse-conflict')
  const sample = await verifiedSampleHousehold(t, as)
  const optionalSupplyIds = await t.run(async (ctx) => (await ctx.db.query('supplies').collect()).filter((supply) => ['downy-rinse-refresh', 'lysol-laundry-sanitizer'].includes(supply.fixtureKey ?? '')).map((supply) => supply._id))
  const stored = await planFor(as, sample.householdId, sample.textileIds, { optionalSupplyIds })
  const ids = await fixtureIds(t)
  expect(stored.result.status).toBe('needs_confirmation')
  const conflicts = stored.result.reasons.filter((reason) => reason.code === 'shared_compartment_conflict')
  expect(conflicts.length).toBeGreaterThan(0)
  expect(JSON.stringify(decisions(stored.result, ids).reasons)).toContain('downy-rinse-refresh')
  expect(JSON.stringify(decisions(stored.result, ids).reasons)).toContain('lysol-laundry-sanitizer')
  expect(stored.loadStates.every((load) => !load.startable)).toBe(true)
  await expect(startLoad(as, { planId: stored.planId, loadId: stored.result.loads[0]!.id, idempotencyKey: 'conflicting-rinse' })).rejects.toThrow()
})

test.each([
  ['care cycle', (t: Backend) => t.run(async (ctx) => { const care = (await ctx.db.query('care').first())!; await ctx.db.patch(care._id, { cycle: undefined }) }), 'unknown_care'],
  ['product label', (t: Backend) => t.run(async (ctx) => { const supply = (await ctx.db.query('supplies').first())!; await ctx.db.patch(supply._id, { provenance: { source: 'unread-label', confidence: 'unknown' } }) }), 'insufficient_product_evidence'],
])('missing %s fails closed with an explicit reason', async (_label, remove, cause) => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const sample = await verifiedSampleHousehold(t, as)
  await remove(t)
  const stored = await planFor(as, sample.householdId, sample.textileIds)
  expect(stored.result.status).toBe('needs_confirmation')
  expect(stored.result.reasons.some((reason) => reason.code === 'needs_confirmation' && reason.details.cause === cause)).toBe(true)
})

test('a washer whose size was skipped still plans, packing by about a default size and never sizing a dose', async () => {
  const t = newBackend()
  const { as, sample, excludedSupplyIds } = await plannedSample(t)
  await t.run(async (ctx) => { for (const machine of await ctx.db.query('machines').collect()) await ctx.db.patch(machine._id, { capacityUnits: undefined }) })
  const stored = await planFor(as, sample.householdId, sample.textileIds, { excludedSupplyIds })
  expect(stored.result.status).toBe('ready')
  expect(stored.result.reasons.some((reason) => reason.details.cause === 'insufficient_machine_evidence')).toBe(false)
  expect(stored.result.loads.every((load) => load.capacityUnits === defaultPackingUnits && load.loadSize === null)).toBe(true)
})

test('a basic product without marks or directions remains inventory only until its label is recorded', async () => {
  const t = newBackend()
  const as = signedIn(t, 'basic-product-intake')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, archived: true })
  const supplyId = await as.mutation(api.inventory.createSupply, {
    householdId: home.householdId, name: 'Unrecorded liquid', kind: 'chemical', use: 'detergent',
    formulation: { name: 'Unrecorded liquid', form: 'liquid' },
    safety: { bleachKind: 'unknown', incompatibleSupplyIds: [], incompatibleMaterials: [] },
    provenance: { source: 'label_taps', confidence: 'observed' },
  })
  const inventory = await as.query(api.inventory.list, { householdId: home.householdId })
  expect(inventory.supplies.find((supply) => supply.supplyId === supplyId)).toMatchObject({ measure: null, rules: [] })
  const held = await planFor(as, home.householdId, [home.shirt])
  expect(held.loadStates.every((load) => !load.startable)).toBe(true)
  if (held.result.loads[0] !== undefined) await expect(startLoad(as, { planId: held.planId, loadId: held.result.loads[0].id, idempotencyKey: 'missing-dose' })).rejects.toThrow()
  await expect(as.mutation(api.inventory.saveRule, { supplyId, dose: { amount: 1, unit: 'cap', mark: '1' }, stage: 'wash', placement: 'direct_to_drum', timing: 'before starting', provenance: label('pack') })).rejects.toThrow()
  await as.mutation(api.inventory.updateSupply, { supplyId, measure: capMeasure, safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] } })
  await as.mutation(api.inventory.saveRule, { supplyId, dose: { amount: 1, unit: 'cap', mark: '1' }, stage: 'wash', placement: 'direct_to_drum', timing: 'before starting', provenance: label('pack') })
  const ready = await planFor(as, home.householdId, [home.shirt])
  expect(ready.loadStates[0]?.startable).toBe(true)
})

test('an evidence level outside the vocabulary is refused before it is stored', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await intakeHousehold(as)
  await expect(as.mutation(api.inventory.updateMachine, { machineId: home.machine, provenance: { source: 'guess', confidence: 'pretty sure' as 'unknown' } })).rejects.toThrow()
})

test('another household cannot plan with or read this household data', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await intakeHousehold(as)
  const { planId } = await as.mutation(api.plans.recompute, { householdId: home.householdId, selectedTextileIds: [home.shirt], clientInputHash: 'draft' })
  const outsider = signedIn(t, 'outsider')

  await expect(outsider.query(api.plans.get, { planId })).rejects.toThrow('Forbidden')
  await expect(outsider.mutation(api.plans.recompute, { householdId: home.householdId, selectedTextileIds: [home.shirt], clientInputHash: 'draft' })).rejects.toThrow('Forbidden')
  const { householdId: theirs } = await outsider.mutation(api.households.createHousehold, { name: 'Elsewhere' })
  await expect(outsider.mutation(api.plans.recompute, { householdId: theirs, selectedTextileIds: [home.shirt], clientInputHash: 'draft' })).rejects.toThrow('Forbidden')
  expect(await t.run(async (ctx) => (await ctx.db.query('plans').collect()).length)).toBe(1)
})

/** An HE front-loader and a cap detergent whose label doses by soil: light or normal to line 1, heavy to line 3. */
async function soilHousehold(as: Caller) {
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Home', displayName: 'Pat' })
  await as.mutation(api.inventory.createMachine, { householdId, name: 'Front-loader', applianceType: 'front_load_washer', highEfficiency: true, capacityUnits: 12, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['detergent_compartment'], cycleMinutes: { normal: 40 }, provenance: label('washer plate') })
  const detergent = await as.mutation(api.inventory.createSupply, { householdId, name: 'Tide cap', kind: 'chemical', use: 'detergent', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'HE liquid', form: 'liquid' }, measure: capMeasure, provenance: label('Tide cap label') })
  await as.mutation(api.inventory.saveLabelDirections, {
    supplyId: detergent, measure: capMeasure, stage: 'wash', placement: 'detergent_compartment', timing: 'before cycle start',
    rows: [{ soilLevels: ['light', 'normal'], cells: capCells('1', '3') }, { soilLevels: ['heavy'], cells: capCells('3', '5') }],
    provenance: label('Tide cap label'),
  })
  const muddy = await as.mutation(api.inventory.createTextile, { householdId, name: 'Muddy jeans', colorGroup: 'light', soilLevel: 'heavy' })
  const tee = await as.mutation(api.inventory.createTextile, { householdId, name: 'Tee', colorGroup: 'light' })
  for (const textileId of [muddy, tee]) await dryingCare(as, textileId)
  return { householdId, detergent, muddy, tee }
}

test('each garment\'s soil doses its load, is planned from only when recorded, and clears once the garment is washed', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await soilHousehold(as)
  const heavy = await planFor(as, home.householdId, [home.muddy])
  expect(heavy.status).toBe('ready')
  expect(heavy.result.loads[0]).toMatchObject({ soilLevel: 'heavy', treatments: [expect.objectContaining({ dose: { amount: 1, unit: 'cap', mark: '3' }, basis: expect.stringContaining('heavy soil') })] })

  // No soil recorded: the label has a normal row, so the garment is read as normal and the plan says so.
  const unrecorded = await planFor(as, home.householdId, [home.tee])
  expect(unrecorded.result.loads[0]).toMatchObject({ soilLevel: null, treatments: [expect.objectContaining({ dose: { amount: 1, unit: 'cap', mark: '1' }, basis: expect.stringContaining('(assumed)') })] })
  const snapshot = await t.run(async (ctx) => (await ctx.db.get(unrecorded.planId))!.inputSnapshot as { textiles: Record<string, unknown>[] })
  expect('soilLevel' in snapshot.textiles[0]!).toBe(false)
  expect(snapshot.textiles[0]!.care).not.toHaveProperty('dryMethod')

  const load = heavy.result.loads[0]!
  const { sessionId } = await startLoad(as, { planId: heavy.planId, loadId: load.id, idempotencyKey: 'muddy' })
  for (const step of (await as.query(api.execution.sessionDetail, { sessionId })).actions) {
    await as.mutation(api.actions.recordAction, step.kind === 'task'
      ? { sessionId, actionId: step.id, status: 'confirmed' }
      : { sessionId, actionId: step.id, status: 'confirmed', usage: { supplyId: home.detergent, amount: 1, unit: 'cap', mark: '3', placement: step.placement } })
  }
  await as.mutation(api.sessions.complete, { sessionId, planInputHash: heavy.inputHash, idempotencyKey: 'muddy' })
  const washed = (await as.query(api.inventory.list, { householdId: home.householdId })).textiles.find((textile) => textile.textileId === home.muddy)!
  // No dryer is recorded, so the washed garment hangs until All dry; its soil clears either way.
  expect(washed).toMatchObject({ status: 'hanging', soilLevel: null })
  expect(await t.run(async (ctx) => (await ctx.db.query('usage').collect()).map((use) => use.mark))).toEqual(['3'])
})

test('a washer whose HE status is not recorded asks before using a label\'s HE or standard rows', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await dryerHousehold(as)
  await as.mutation(api.inventory.updateMachine, { machineId: home.washer, highEfficiency: null })
  const unknown = await planFor(as, home.householdId, [home.tee])
  expect(unknown.status).toBe('needs_confirmation')
  expect(unknown.loadStates[0]!.startable).toBe(false)
  const asked = unknown.result.reasons.find((reason) => reason.details.cause === 'dose_input_needed')!
  expect(asked).toMatchObject({ code: 'needs_confirmation', supplyId: home.detergent, details: { missing: 'washer_class' } })
  expect(unknown.result.explanations.find((entry) => entry.reasonId === asked.id)!.text).toContain('HE')

  // Recorded as standard: the label's standard column is read at the machine, by how full the drum is.
  await as.mutation(api.inventory.updateMachine, { machineId: home.washer, highEfficiency: false })
  const standard = await planFor(as, home.householdId, [home.tee])
  expect(standard.status).toBe('ready')
  const [step] = standard.result.loads[0]!.treatments
  expect(standard.result.loads[0]).toMatchObject({ washerClass: 'standard', loadSize: null })
  expect(step).toMatchObject({ supplyId: home.detergent, dose: { amount: 0, unit: 'at_machine' }, atMachine: { machine: 'washer', context: { machineClasses: expect.arrayContaining(['standard']) } } })
  expect(step!.atMachine!.candidates.map((candidate) => [candidate.size, candidate.dose.mark])).toEqual([['small', '3'], ['medium', '3'], ['large', '5'], ['extra_large', '5']])
})

test('a single washer at home is the one washer its ready load may start on, and a load that needs an answer lists none', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await dryerHousehold(as)
  const ready = await planFor(as, home.householdId, [home.tee])
  expect(ready.result.loads[0]).not.toHaveProperty('alternates')
  expect(ready.loadStates[0]).toMatchObject({ startable: true, startableMachineIds: [home.washer] })

  await as.mutation(api.inventory.updateMachine, { machineId: home.washer, highEfficiency: null })
  const unknown = await planFor(as, home.householdId, [home.tee])
  expect(unknown.loadStates[0]).toMatchObject({ startable: false, startableMachineIds: [] })
})

test('a plan from an older planner reads stale, never starts, and is replaced by planning again', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt, home.towel])
  expect(planned.textileIds).toEqual([home.shirt, home.towel].sort())
  await t.run((ctx) => ctx.db.patch(planned.planId, { plannerVersion: 'planner-v1' }))

  const old = (await as.query(api.plans.get, { planId: planned.planId }))!
  expect(old.status).toBe('stale')
  expect(old.loadStates.every((state) => !state.startable)).toBe(true)
  await expect(startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'old' })).rejects.toThrow('Stale plan')
  expect(await as.query(api.plans.upNext, { householdId: home.householdId })).toBeNull()

  const again = await as.mutation(api.plans.recompute, { householdId: home.householdId, selectedTextileIds: [home.towel, home.shirt], clientInputHash: planned.inputHash })
  expect(again.planId).not.toBe(planned.planId)
  expect(again.inputHash).toBe(planned.inputHash)
  expect(await as.query(api.plans.get, { planId: planned.planId })).toBeNull()
})

test('up next is the newest plan with a load still to start, with its doses and the dryer\'s minutes', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await dryerHousehold(as)
  const jeans = await as.mutation(api.inventory.createTextile, { householdId: home.householdId, name: 'Jeans', color: 'Indigo', colorGroup: 'dark', firstWash: true })
  await dryingCare(as, jeans, 'tumble_dry')
  await as.mutation(api.inventory.setPlanning, { householdId: home.householdId, dryerPricePerStart: 1.5 })
  expect(await as.query(api.plans.upNext, { householdId: home.householdId })).toBeNull()

  const planned = await planFor(as, home.householdId, [home.tee, jeans])
  expect(planned.result.loads).toHaveLength(2)
  const next = (await as.query(api.plans.upNext, { householdId: home.householdId }))!
  expect(next).toMatchObject({ planId: planned.planId, status: 'ready', cost: { dryer: 3 } })
  const light = next.loads.find((load) => load.textileIds.includes(home.tee))!
  // The cap's line depends on how full the drum is, so it is chosen at the machine; nothing sizes the load now.
  expect(light).toMatchObject({
    machineName: 'Front-loader', washMinutes: 40, washConfidence: 'verified', loadSize: null, startable: true, sessionId: null,
    treatments: [expect.objectContaining({ supplyName: 'Tide cap', dose: { amount: 0, unit: 'at_machine' }, placement: 'detergent_compartment', reusable: false })],
    dryer: { status: 'ready', name: 'Dryer', heatLabel: 'Low temp', minutes: 64, minutesConfidence: 'verified', tumbleCount: 1, heldOutCount: 0, treatments: [expect.objectContaining({ supplyName: 'Bounce', dose: { amount: 1, unit: 'sheet' } })] },
  })

  // A plan with one load started is still up next for the other.
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: light.loadId, idempotencyKey: 'light' })
  const used = (await as.query(api.plans.upNext, { householdId: home.householdId }))!
  expect(used.status).toBe('used')
  expect(used.loads.find((load) => load.loadId === light.loadId)).toMatchObject({ sessionId, startable: false })
  const dark = used.loads.find((load) => load.loadId !== light.loadId)!
  expect(dark.startable).toBe(true)

  await startLoad(as, { planId: planned.planId, loadId: dark.loadId, idempotencyKey: 'dark' })
  expect(await as.query(api.plans.upNext, { householdId: home.householdId })).toBeNull()

  await planFor(as, home.householdId, [home.scarf])
  expect((await as.query(api.plans.upNext, { householdId: home.householdId }))?.loads[0]?.textileIds).toEqual([home.scarf])
  await as.mutation(api.inventory.updateMachine, { machineId: home.dryer, cycleMinutes: { timed: 60 } })
  expect(await as.query(api.plans.upNext, { householdId: home.householdId })).toBeNull()
  await expect(signedIn(t, 'outsider').query(api.plans.upNext, { householdId: home.householdId })).rejects.toThrow('Forbidden')
})

/**
 * A plain household for the pass: an HE top-loader with a drawer, a label-backed detergent with no
 * saved rows yet (what it is for is recorded), and two dirty tees with machine care.
 */
async function passHousehold(t: Backend, as: Caller) {
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Home', displayName: 'Pat' })
  const washer = await as.mutation(api.inventory.createMachine, { householdId, name: 'Washer', applianceType: 'top_load_washer', highEfficiency: true, capacityUnits: 12, capacityConfidence: 'verified', supportedCycles: ['normal', 'delicate'], placements: ['detergent_compartment', 'direct_to_drum'], cycleMinutes: { normal: 40 }, provenance: label('washer plate') })
  const detergent = await as.mutation(api.inventory.createSupply, { householdId, name: 'Tide', kind: 'chemical', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'HE liquid', form: 'liquid' }, measure: capMeasure, provenance: label('Tide bottle') })
  await t.run((ctx) => ctx.db.patch(detergent, { use: 'detergent' }))
  const tee = await as.mutation(api.inventory.createTextile, { householdId, name: 'Tee', colorGroup: 'light', soilLevel: 'normal' })
  const jeans = await as.mutation(api.inventory.createTextile, { householdId, name: 'Jeans', colorGroup: 'dark', soilLevel: 'normal' })
  for (const textileId of [tee, jeans]) await dryingCare(as, textileId)
  return { householdId, washer, detergent, tee, jeans }
}

type Pass = Omit<FunctionArgs<typeof api.plans.recompute>, 'householdId' | 'selectedTextileIds' | 'clientInputHash'>

const recompute = (as: Caller, householdId: Id<'households'>, selectedTextileIds: Id<'textiles'>[], pass: Pass = {}) =>
  as.mutation(api.plans.recompute, { householdId, selectedTextileIds, clientInputHash: 'pass', ...pass })

test('recompute checks the pass and plans only what is in the hamper', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await passHousehold(t, as)
  const both = [home.tee, home.jeans]
  for (const group of [0, 1.5, 100]) {
    await expect(recompute(as, home.householdId, both, { loadPins: [{ textileId: home.tee, group }] })).rejects.toThrow('whole number from 1 to 99')
  }
  await expect(recompute(as, home.householdId, both, { loadPins: Array.from({ length: 401 }, () => ({ textileId: home.tee, group: 1 })) })).rejects.toThrow('Too many moves')
  const dismissal = { kind: 'label_row' as const, subjectId: home.detergent, context: {}, answer: 'label_doesnt_say' as const }
  await expect(recompute(as, home.householdId, both, { dismissedQuestions: Array.from({ length: 51 }, () => dismissal) })).rejects.toThrow('Too many answered questions')
  await expect(recompute(as, home.householdId, both, { excludedSupplyIds: Array.from({ length: 51 }, () => home.detergent) })).rejects.toThrow('Too many products left out')
  // A label question names a product, and an HE question a washer, of this household.
  await expect(recompute(as, home.householdId, both, { dismissedQuestions: [{ ...dismissal, subjectId: home.washer }] })).rejects.toThrow('not in this household')
  await expect(recompute(as, home.householdId, both, { dismissedQuestions: [{ ...dismissal, subjectId: 'not-an-id' }] })).rejects.toThrow('not in this household')

  const outsider = signedIn(t, 'outsider')
  const elsewhere = await passHousehold(t, outsider)
  await expect(recompute(as, home.householdId, both, { excludedSupplyIds: [elsewhere.detergent] })).rejects.toThrow('Forbidden')
  await expect(recompute(as, home.householdId, both, { detergentId: elsewhere.detergent })).rejects.toThrow('Forbidden')
  await expect(recompute(as, home.householdId, both, { pretreatmentChoices: [{ textileId: home.tee, supplyId: elsewhere.detergent }] })).rejects.toThrow('Forbidden')
  await expect(recompute(as, home.householdId, both, { pretreatmentChoices: [{ textileId: elsewhere.tee, supplyId: home.detergent }] })).rejects.toThrow('selected pieces')
  const choice = { textileId: home.tee, supplyId: home.detergent }
  await expect(recompute(as, home.householdId, both, { pretreatmentChoices: [choice, choice] })).rejects.toThrow('one pretreatment per piece')
  await expect(recompute(as, home.householdId, both, { pretreatmentChoices: Array.from({ length: 251 }, () => choice) })).rejects.toThrow('Too many pretreatment choices')
  await expect(recompute(as, home.householdId, both, { dismissedQuestions: [{ ...dismissal, subjectId: elsewhere.detergent }] })).rejects.toThrow('Forbidden')
  await expect(recompute(as, home.householdId, both, { loadPins: [{ textileId: elsewhere.tee, group: 1 }] })).rejects.toThrow('Forbidden')

  await as.mutation(api.inventory.setTextileStatus, { textileIds: [home.jeans], status: 'clean' })
  await expect(recompute(as, home.householdId, both)).rejects.toThrow('Only laundry items in the hamper can be washed')
  expect(await t.run(async (ctx) => (await ctx.db.query('plans').collect()).length)).toBe(0)
})

test('the pass is part of the plan: each field changes the hash, the same pass returns the same plan, and get reads it back', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await passHousehold(t, as)
  const both = [home.tee, home.jeans]
  const plain = await recompute(as, home.householdId, both)
  const passes: Pass[] = [
    { mode: 'rush' },
    { loadPins: [{ textileId: home.tee, group: 1 }, { textileId: home.jeans, group: 2 }] },
    { dismissedQuestions: [{ kind: 'label_row', subjectId: home.detergent, context: { soilLevel: 'normal', washerClass: 'he' }, answer: 'label_doesnt_say' }] },
    { excludedSupplyIds: [home.detergent] },
    { detergentId: home.detergent },
    { pretreatmentChoices: [{ textileId: home.tee, supplyId: home.detergent }] },
  ]
  const hashes = new Set([plain.inputHash])
  for (const pass of passes) {
    const planned = await recompute(as, home.householdId, both, pass)
    hashes.add(planned.inputHash)
    const again = await recompute(as, home.householdId, both, pass)
    expect(again).toMatchObject({ planId: planned.planId, inputHash: planned.inputHash })
    const stored = (await as.query(api.plans.get, { planId: planned.planId }))!
    expect(stored.pass).toEqual({ mode: 'normal', loadPins: [], dismissedQuestions: [], excludedSupplyIds: [], pretreatmentChoices: [], optionalSupplyIds: [], washGoals: ['ordinary'], ...pass })
  }
  expect(hashes.size).toBe(passes.length + 1)

  // Wash now is stored on the plan; normal planning leaves it unset.
  const rush = await recompute(as, home.householdId, both, { mode: 'rush' })
  expect(await t.run(async (ctx) => (await ctx.db.get(rush.planId))!.mode)).toBe('rush')
  const normal = await recompute(as, home.householdId, both)
  expect(await t.run(async (ctx) => 'mode' in (await ctx.db.get(normal.planId))!)).toBe(false)
  // Only the latest pass for the selection is kept.
  expect(await t.run(async (ctx) => (await ctx.db.query('plans').collect()).length)).toBe(1)
  expect(await as.query(api.plans.get, { planId: plain.planId })).toBeNull()
})

test('a load takes one detergent: the pass chooses it, and the preview says what switching changes', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await soilHousehold(as)
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, use: 'detergent' })
  const gentle = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Gentle cap', kind: 'chemical', use: 'detergent', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'HE liquid', form: 'liquid' }, measure: capMeasure, provenance: label('Gentle cap label') })
  await as.mutation(api.inventory.saveLabelDirections, {
    supplyId: gentle, measure: capMeasure, stage: 'wash', placement: 'detergent_compartment', timing: 'before cycle start',
    rows: [{ soilLevels: ['light', 'normal'], cells: capCells('3', '5') }, { soilLevels: ['heavy'], cells: capCells('5', '5') }],
    provenance: label('Gentle cap label'),
  })
  const selection = [home.muddy, home.tee]
  const first = await recompute(as, home.householdId, selection)
  const planned = (await as.query(api.plans.get, { planId: first.planId }))!
  const detergentSteps = (plan: typeof planned) => plan.result.loads.map((load) => load.treatments.filter((step) => step.supplyId === home.detergent || step.supplyId === gentle).map((step) => step.supplyId))
  expect(detergentSteps(planned).every((steps) => steps.length === 1)).toBe(true)
  const load = planned.result.loads[0]!
  expect(load.detergent!.options.map((option) => option.supplyId).sort()).toEqual([home.detergent, gentle].sort())
  const other = load.detergent!.chosenId === home.detergent ? gentle : home.detergent

  const preview = await as.query(api.plans.detergentPreview, { planId: first.planId, loadId: load.id, supplyId: other })
  expect(preview!.changes.length).toBeGreaterThan(0)
  expect(preview!.changes[0]).toMatchObject({ from: { supplyId: load.detergent!.chosenId }, to: { supplyId: other } })

  const switched = await recompute(as, home.householdId, selection, { detergentId: other })
  const after = (await as.query(api.plans.get, { planId: switched.planId }))!
  expect(after.pass.detergentId).toBe(other)
  expect(after.result.loads[0]!.detergent!.chosenId).toBe(other)
  expect(detergentSteps(after)[0]).toEqual([other])
})

test('get names the machines the loads use, with where they are and what a start costs', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await dryerHousehold(as)
  await t.run((ctx) => ctx.db.patch(home.dryer, { location: 'shared', pricePerStart: 1.75 }))
  const planned = await planFor(as, home.householdId, [home.tee])
  expect(planned.pass).toEqual({ mode: 'normal', loadPins: [], dismissedQuestions: [], excludedSupplyIds: [], pretreatmentChoices: [], optionalSupplyIds: [], washGoals: ['ordinary'] })
  expect(planned.machines).toEqual([
    { machineId: home.washer, name: 'Front-loader', location: null, pricePerStart: null, blockMinutes: null, applianceType: 'front_load_washer' },
    { machineId: home.dryer, name: 'Dryer', location: 'shared', pricePerStart: 1.75, blockMinutes: null, applianceType: 'tumble_dryer' },
  ])
})

test('choosing pretreatment persists the recipe choice without recording a performed treatment', async () => {
  const t = newBackend()
  const as = signedIn(t, 'pretreatment-choice')
  const home = await intakeHousehold(as)
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['food'], soilLevel: 'normal', stainReport: { kind: 'protein', priorTreatmentAttempts: [] } })
  const spray = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Recorded pretreatment', kind: 'chemical', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'spray', form: 'spray' }, provenance: label('pretreatment label') })
  await as.mutation(api.inventory.saveRule, { supplyId: spray, dose: { amount: 10, unit: 'ml' }, stage: 'prewash', placement: 'manual', timing: 'Before washing', stainChemistry: 'protease', stainKinds: ['protein'], provenance: label('pretreatment label') })
  const initial = await planFor(as, home.householdId, [home.shirt])
  expect(initial.result.reasons).toContainEqual(expect.objectContaining({ supplyId: spray, textileIds: [home.shirt], details: expect.objectContaining({ cause: 'pretreatment_choice_needed' }) }))
  expect(initial.loadStates.every((load) => !load.startable)).toBe(true)
  const choice = { textileId: home.shirt, supplyId: spray }
  const updated = await recompute(as, home.householdId, [home.shirt], { pretreatmentChoices: [choice] })
  const stored = (await as.query(api.plans.get, { planId: updated.planId }))!
  expect(stored.pass.pretreatmentChoices).toEqual([choice])
  expect(stored.result.reasons.some((reason) => reason.details.cause === 'pretreatment_choice_needed')).toBe(false)
  expect(stored.result.loads.flatMap((load) => load.treatments)).toContainEqual(expect.objectContaining({ textileId: home.shirt, supplyId: spray, confirmation: 'confirmed' }))
  expect(await t.run((ctx) => ctx.db.query('sessions').withIndex('by_plan', (q) => q.eq('planId', updated.planId)).collect())).toEqual([])
  expect((await t.run((ctx) => ctx.db.get(home.shirt)))!.flag?.stainReport?.priorTreatmentAttempts).toEqual([])
})

test('the planner input carries kind, wearer, stain words, guests, typed lines and product defaults only when recorded', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await passHousehold(t, as)
  const baby = await as.mutation(api.inventory.createWearer, { householdId: home.householdId, name: 'Baby', kind: 'baby' })
  const [bodysuit] = await as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Bodysuit', quantity: 1, kind: 'baby_bodysuit', wearerId: baby, colorGroup: 'light' })
  await dryingCare(as, bodysuit!)
  await as.mutation(api.closet.flagDirty, { textileIds: [bodysuit!], reasons: ['worn', 'food', 'mud_grass'], soilLevel: 'heavy', stainNote: 'left knee' })
  await t.run((ctx) => ctx.db.patch(home.jeans, { guest: true }))
  await as.mutation(api.inventory.saveRule, { supplyId: home.detergent, dose: { amount: 1, unit: 'cap', mark: '3' }, stage: 'wash', placement: 'detergent_compartment', timing: 'before starting', provenance: label('Tide bottle') })
  await t.run(async (ctx) => { const rule = (await ctx.db.query('rules').first())!; await ctx.db.patch(rule._id, { rowText: 'Normal load' }) })
  await as.mutation(api.inventory.setPlanning, { householdId: home.householdId, babySeparate: false })

  const { planId } = await recompute(as, home.householdId, [home.tee, home.jeans, bodysuit!])
  const snapshot = await t.run(async (ctx) => (await ctx.db.get(planId))!.inputSnapshot as PlannerInput)
  const textile = (id: string) => snapshot.textiles!.find((entry) => entry.id === id)!
  expect(textile(bodysuit!)).toMatchObject({ kind: 'baby_bodysuit', bulkUnits: 0.25, wearerKind: 'baby', stainNote: 'food or drink, grass or mud, left knee' })
  expect(textile(home.jeans)).toMatchObject({ guest: true })
  for (const key of ['kind', 'bulkUnits', 'wearerKind', 'stainNote', 'guest']) expect(textile(home.tee)).not.toHaveProperty(key)
  expect(snapshot.supplies![0]).toMatchObject({ defaults: { stage: 'wash', placement: 'detergent_compartment', timing: 'before starting' }, applicationRules: [expect.objectContaining({ rowText: 'Normal load' })] })
  expect(snapshot.preferences).toMatchObject({ babySeparate: false })
  for (const key of ['mode', 'loadPins', 'dismissedQuestions', 'excludedSupplyIds']) expect(snapshot).not.toHaveProperty(key)
})

/**
 * A plan that needs every kind of card: a sweater with no care, a dry-clean-only blazer, a tee whose
 * soil is not recorded (for a label that doses light and heavy only), a washer whose HE is not
 * recorded (for a label split by HE), a detergent with no saved rows, two rows that disagree, and a
 * dryer sheet with no saved rows.
 */
async function questionHousehold(t: Backend, as: Caller) {
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Home', displayName: 'Pat' })
  const washer = await as.mutation(api.inventory.createMachine, { householdId, name: 'Washer 2', applianceType: 'front_load_washer', capacityUnits: 12, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['detergent_compartment', 'direct_to_drum'], cycleMinutes: { normal: 40 }, provenance: label('washer plate') })
  await addDryer(as, householdId)
  const supply = (name: string, kind: 'chemical' | 'dryer_sheet' = 'chemical') =>
    as.mutation(api.inventory.createSupply, { householdId, name, kind, ...(kind === 'chemical' ? { safety: { bleachKind: 'none' as const, incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'liquid', form: 'liquid' }, measure: capMeasure } : { measure: { kind: 'count' as const, countUnit: 'sheet' as const } }), provenance: label(`${name} label`) })
  const soilSoap = await supply('Soil soap')
  await as.mutation(api.inventory.saveLabelDirections, { supplyId: soilSoap, measure: capMeasure, stage: 'wash', placement: 'detergent_compartment', timing: 'before starting', rows: [{ soilLevels: ['light'], cells: [{ amount: 1, unit: 'cap', mark: '1' }] }, { soilLevels: ['heavy'], cells: [{ amount: 1, unit: 'cap', mark: '3' }] }], provenance: label('Soil soap label') })
  const tide = await capDetergent(as, householdId)
  const plain = await supply('Plain soap')
  const twin = await supply('Twin soap')
  const twinRules: Id<'rules'>[] = []
  for (const mark of ['1', '3']) twinRules.push(await as.mutation(api.inventory.saveRule, { supplyId: twin, dose: { amount: 1, unit: 'cap', mark }, stage: 'wash', placement: 'detergent_compartment', timing: 'before starting', provenance: label('Twin soap label') }))
  await t.run((ctx) => ctx.db.patch(twinRules[1]!, { rowText: 'Heavy duty' }))
  const sheets = await supply('Bounce', 'dryer_sheet')
  const garment = (name: string) => as.mutation(api.inventory.createTextile, { householdId, name, colorGroup: 'light' })
  const sweater = await garment('Mystery sweater')
  const blazer = await garment('Navy blazer')
  const tee = await garment('Tee')
  await as.mutation(api.inventory.setCare, { textileId: blazer, washMethod: 'dry_clean_only', restrictions: [], provenance: label('care label') })
  await dryingCare(as, tee, 'tumble_dry')
  return { householdId, washer, soilSoap, tide, plain, twin, twinRules, sheets, sweater, blazer, tee, optionalSupplyIds: [soilSoap, plain, twin] }
}

test('only a shared washer adds its location to the planner input, so a washer at home keeps its hash', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await intakeHousehold(as)
  const selection = [home.shirt, home.towel]
  const unset = await planFor(as, home.householdId, selection)
  const pass: PlanPass = { mode: 'normal', loadPins: [], dismissedQuestions: [], excludedSupplyIds: [] }
  const machinesIn = () => t.run(async (ctx) => (await canonicalPlannerInput(ctx, home.householdId, selection, pass)).machines ?? [])

  expect((await machinesIn())[0]!).not.toHaveProperty('location')
  await t.run((ctx) => ctx.db.patch(home.machine, { location: 'home' }))
  expect((await machinesIn())[0]!).not.toHaveProperty('location')
  const atHome = await as.mutation(api.plans.recompute, { householdId: home.householdId, selectedTextileIds: selection, clientInputHash: unset.inputHash })
  expect(atHome.inputHash).toBe(unset.inputHash)

  await t.run((ctx) => ctx.db.patch(home.machine, { location: 'shared' }))
  expect((await machinesIn())[0]!).toMatchObject({ location: 'shared' })
  const shared = await as.mutation(api.plans.recompute, { householdId: home.householdId, selectedTextileIds: selection, clientInputHash: unset.inputHash })
  expect(shared.inputHash).not.toBe(unset.inputHash)
})

test('the bleach triangle reaches the planner only when the tag says, so unchanged care keeps its hash', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await intakeHousehold(as)
  const selection = [home.shirt, home.towel]
  const unset = await planFor(as, home.householdId, selection)
  const pass: PlanPass = { mode: 'normal', loadPins: [], dismissedQuestions: [], excludedSupplyIds: [] }
  const shirtCare = async () => (await t.run(async (ctx) => (await canonicalPlannerInput(ctx, home.householdId, selection, pass)).textiles ?? [])).find((textile) => textile.id === home.shirt)!.care!

  expect(await shirtCare()).not.toHaveProperty('bleach')
  const careRow = await t.run((ctx) => ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', home.shirt)).unique())
  await t.run((ctx) => ctx.db.patch(careRow!._id, { bleach: 'none' }))
  expect(await shirtCare()).toMatchObject({ bleach: 'none' })
  const withBleach = await as.mutation(api.plans.recompute, { householdId: home.householdId, selectedTextileIds: selection, clientInputHash: unset.inputHash })
  expect(withBleach.inputHash).not.toBe(unset.inputHash)
  await t.run((ctx) => ctx.db.patch(careRow!._id, { bleach: undefined }))
  const cleared = await as.mutation(api.plans.recompute, { householdId: home.householdId, selectedTextileIds: selection, clientInputHash: withBleach.inputHash })
  expect(cleared.inputHash).toBe(unset.inputHash)
})

test('questions turn the plan\'s reasons into cards, in order, each with its key', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await questionHousehold(t, as)
  const { planId } = await recompute(as, home.householdId, [home.sweater, home.blazer, home.tee], { optionalSupplyIds: home.optionalSupplyIds })
  const cards = await as.query(api.plans.questions, { planId })
  const load = (await as.query(api.plans.get, { planId }))!.result.loads[0]!.id
  expect(cards.map((card) => card.kind)).toEqual(['care_unknown', 'dry_clean_only', 'soil_level', 'washer_he', 'label_row', 'label_row', 'conflicting_rows'])
  const [care, dryClean, soil, he, washerRow, dryerRow, conflict] = cards
  expect(care).toEqual({ kind: 'care_unknown', key: { kind: 'care_unknown', subjectId: home.sweater, context: {} }, subjectIds: [home.sweater], context: {} })
  expect(dryClean).toEqual({ kind: 'dry_clean_only', key: { kind: 'dry_clean_only', subjectId: home.blazer, context: {} }, subjectIds: [home.blazer], context: {} })
  expect(soil).toMatchObject({ key: { kind: 'soil_level', subjectId: load, context: {} }, subjectIds: [home.tee], context: { loadId: load }, product: { supplyId: home.soilSoap, name: 'Soil soap' } })
  expect(he).toMatchObject({ key: { kind: 'washer_he', subjectId: home.washer, context: {} }, context: { loadId: load, stage: 'washer' }, product: { supplyId: home.tide, name: 'Tide cap' }, machine: { machineId: home.washer, name: 'Washer 2' } })
  expect(washerRow).toMatchObject({ key: { kind: 'label_row', subjectId: home.plain, context: {} }, context: { loadId: load, stage: 'washer' }, product: { supplyId: home.plain, name: 'Plain soap', use: null, measure: capMeasure } })
  expect(dryerRow).toMatchObject({ key: { kind: 'label_row', subjectId: home.sheets, context: {} }, context: { loadId: load, stage: 'dryer' }, product: { supplyId: home.sheets, name: 'Bounce' } })
  expect(conflict).toMatchObject({
    key: { kind: 'conflicting_rows', subjectId: home.twin, context: {} },
    product: { supplyId: home.twin },
    rows: [
      { ruleId: home.twinRules[0], row: null, rowText: null, dose: { amount: 1, unit: 'cap', mark: '1' } },
      { ruleId: home.twinRules[1], row: null, rowText: 'Heavy duty', dose: { amount: 1, unit: 'cap', mark: '3' } },
    ],
  })
  await expect(signedIn(t, 'outsider').query(api.plans.questions, { planId })).rejects.toThrow('Forbidden')
})

test('a tag checked and found to say nothing washes fail-closed instead of asking forever', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await intakeHousehold(as)
  const selection = [home.shirt, home.sweater]

  // Nobody has checked the sweater's tag yet: it asks, and stays out of the wash.
  const notChecked = await planFor(as, home.householdId, selection)
  expect(notChecked.result.exclusions.map((exclusion) => exclusion.textileId)).toEqual([home.sweater])
  expect(await as.query(api.plans.questions, { planId: notChecked.planId })).toMatchObject([{ kind: 'care_unknown', subjectIds: [home.sweater] }])

  // "Tag doesn't say": the tag was checked, but nothing on it was usable.
  await as.mutation(api.inventory.answerTagQuestions, { textileIds: [home.sweater], washMethod: 'unknown' })
  const checked = await planFor(as, home.householdId, selection)
  expect(checked.result.status).toBe('ready')
  expect(checked.result.exclusions).toEqual([])
  expect(checked.result.reasons.some((reason) => reason.code === 'needs_confirmation' && reason.details.cause === 'unknown_care')).toBe(false)
  const sweaterLoad = checked.result.loads.find((load) => load.textileIds.includes(home.sweater))!
  expect(sweaterLoad.textileIds).toContain(home.sweater)
  expect(sweaterLoad.temperatureC).toBe(30)
  expect(sweaterLoad.cycle).toBe('normal')
  // Not re-asked: the card is gone, even though the sweater's care still needs confirming in Closet.
  expect(await as.query(api.plans.questions, { planId: checked.planId })).toEqual([])
})

test('a card answered without a row does not come back once the pass sends it; other causes never make a card', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await questionHousehold(t, as)
  const selection = [home.tee]
  const first = await recompute(as, home.householdId, selection, { optionalSupplyIds: home.optionalSupplyIds, excludedSupplyIds: [home.soilSoap, home.twin] })
  const asked = await as.query(api.plans.questions, { planId: first.planId })
  expect(asked.map((card) => card.kind)).toEqual(['washer_he', 'label_row', 'label_row'])

  const dismissal = (card: (typeof asked)[number], answer: 'label_doesnt_say' | 'depends_on_size' | 'cant_tell') => ({ kind: card.key.kind as 'label_row' | 'washer_he', subjectId: card.key.subjectId, context: card.key.context, answer })
  const dismissedQuestions = [dismissal(asked[0]!, 'cant_tell'), dismissal(asked[1]!, 'label_doesnt_say'), dismissal(asked[2]!, 'depends_on_size')]
  const second = await recompute(as, home.householdId, selection, { optionalSupplyIds: home.optionalSupplyIds, excludedSupplyIds: [home.soilSoap, home.twin], dismissedQuestions })
  expect(second.status).toBe('ready')
  expect(await as.query(api.plans.questions, { planId: second.planId })).toEqual([])
  const stored = (await as.query(api.plans.get, { planId: second.planId }))!
  expect(stored.result.reasons.filter((reason) => reason.code === 'product_left_out').map((reason) => [reason.supplyId, reason.details.cause]).sort()).toEqual([
    [home.tide, 'cant_tell_he'], [home.plain, 'label_doesnt_say'], [home.soilSoap, 'left_out'], [home.twin, 'left_out'],
  ].sort())
  // The sheet waits for the dryer's fullness.
  expect(stored.result.loads[0]!.drying!.treatments).toEqual([expect.objectContaining({ supplyId: home.sheets, atMachine: expect.objectContaining({ machine: 'dryer', candidates: [] }) })])

  // A product label nobody has read blocks the plan, but it is not a question a card can answer.
  await t.run((ctx) => ctx.db.patch(home.plain, { provenance: { source: 'unread-label', confidence: 'unknown' } }))
  const unread = await recompute(as, home.householdId, selection, { optionalSupplyIds: home.optionalSupplyIds, excludedSupplyIds: [home.soilSoap, home.twin], dismissedQuestions })
  expect(unread.status).toBe('needs_confirmation')
  expect(await as.query(api.plans.questions, { planId: unread.planId })).toEqual([])
})

test('a size-dependent answer puts the step at the machine, where the product\'s use says it goes', async () => {
  const t = newBackend()
  const as = signedIn(t, 'recompute-test-user')
  const home = await passHousehold(t, as)
  const { planId } = await recompute(as, home.householdId, [home.tee])
  const [card] = await as.query(api.plans.questions, { planId })
  expect(card).toMatchObject({ kind: 'label_row', key: { subjectId: home.detergent, context: { soilLevel: 'normal', washerClass: 'he' } }, product: { use: 'detergent' } })
  const answered = await recompute(as, home.householdId, [home.tee], { dismissedQuestions: [{ kind: 'label_row', subjectId: card!.key.subjectId, context: card!.key.context, answer: 'depends_on_size' }] })
  const atMachine = (await as.query(api.plans.get, { planId: answered.planId }))!
  expect(atMachine.status).toBe('ready')
  expect(atMachine.result.loads[0]!.treatments).toEqual([expect.objectContaining({ supplyId: home.detergent, placement: 'detergent_compartment', stage: 'wash', timing: 'before starting', dose: { amount: 0, unit: 'at_machine' } })])
})

/** Every blocker on each load reaches at least one item, so no reason a load cannot start is lost. */
function everyBlockerItemized(stored: NonNullable<Awaited<ReturnType<typeof planFor>>>) {
  for (const load of stored.loadStates) {
    const blocking = load.blockedItems.filter((item) => item.blocking)
    expect(blocking.length).toBeGreaterThanOrEqual(load.blockingReasonIds.length)
    expect([...new Set(blocking.map((item) => item.reasonId))].sort()).toEqual([...load.blockingReasonIds].sort())
  }
}

test('a product the garment\'s tag forbids sits under that product as a conflict naming the product and the garment', async () => {
  const t = newBackend()
  const as = signedIn(t, 'blocked-items-bleach')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, safety: { bleachKind: 'oxygen', incompatibleSupplyIds: [], incompatibleMaterials: [] } })
  const careRow = await t.run((ctx) => ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', home.shirt)).unique())
  await t.run((ctx) => ctx.db.patch(careRow!._id, { bleach: 'none' }))
  const stored = await planFor(as, home.householdId, [home.shirt, home.towel])
  const load = stored.loadStates.find((state) => stored.result.loads.find((entry) => entry.id === state.loadId)!.textileIds.includes(home.shirt))!
  const reason = stored.result.reasons.find((entry) => entry.details.cause === 'tag_forbids_bleach')!
  expect(load.blockedItems).toContainEqual({ reasonId: reason.id, source: { kind: 'product', id: home.detergent }, kind: 'conflict', blocking: false, textileIds: [home.shirt], supplyIds: [home.detergent] })
  everyBlockerItemized(stored)
})

test('a product a garment\'s material rules out leaves the garment out with a conflict under that product', async () => {
  const t = newBackend()
  const as = signedIn(t, 'blocked-items-material')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.setCare, { textileId: home.sweater, material: 'wool', washMethod: 'machine', cycle: 'delicate', maxTemperatureC: 30, restrictions: [], provenance: label('care label') })
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: ['wool'] } })
  const stored = await planFor(as, home.householdId, [home.shirt, home.sweater])
  const reason = stored.result.reasons.find((entry) => entry.code === 'product_restriction')!
  expect(reason.details).toEqual({ cause: 'no_compatible_supply', supplyIds: [home.detergent] })
  expect(stored.result.loads.flatMap((load) => load.textileIds)).not.toContain(home.sweater)
  expect(stored.excludedItems).toContainEqual({ reasonId: reason.id, source: { kind: 'product', id: home.detergent }, kind: 'conflict', blocking: true, textileIds: [home.sweater], supplyIds: [home.detergent] })
  everyBlockerItemized(stored)
})

test('a garment whose care is unknown is a confirm item under that garment', async () => {
  const t = newBackend()
  const as = signedIn(t, 'blocked-items-unknown-care')
  const home = await intakeHousehold(as)
  const stored = await planFor(as, home.householdId, [home.shirt, home.sweater])
  const reason = stored.result.reasons.find((entry) => entry.details.cause === 'unknown_care')!
  expect(stored.excludedItems).toEqual([{ reasonId: reason.id, source: { kind: 'garment', id: home.sweater }, kind: 'confirm', blocking: true, textileIds: [home.sweater] }])
  // Planned alone, with no load to sit on, it still is not lost.
  const alone = await planFor(as, home.householdId, [home.sweater])
  expect(alone.loadStates).toEqual([])
  expect(alone.excludedItems).toContainEqual(expect.objectContaining({ source: { kind: 'garment', id: home.sweater }, kind: 'confirm' }))
})

test('every blocker of every load becomes an item under a garment, product or washer', async () => {
  const t = newBackend()
  const as = signedIn(t, 'blocked-items-questions')
  const home = await questionHousehold(t, as)
  const { planId } = await recompute(as, home.householdId, [home.sweater, home.blazer, home.tee], { optionalSupplyIds: home.optionalSupplyIds })
  const stored = (await as.query(api.plans.get, { planId }))!
  expect(stored.loadStates.some((load) => load.blockingReasonIds.length > 1)).toBe(true)
  everyBlockerItemized(stored)
  const items = stored.loadStates.flatMap((load) => load.blockedItems)
  const next = (await as.query(api.plans.upNext, { householdId: home.householdId }))!
  expect(next.loads.some((load) => load.blockers.some((blocker) => blocker.name !== null && blocker.source === 'product'))).toBe(true)
  for (const load of next.loads) {
    expect(load.blockers.map(({ code, details }) => ({ code, details }))).toEqual(stored.loadStates.find((state) => state.loadId === load.loadId)!.blockedItems
      .filter((item) => item.blocking).map((item) => stored.result.reasons.find((reason) => reason.id === item.reasonId)!)
      .map(({ code, details }) => ({ code, details })))
  }
  expect(items.some((item) => item.source.kind === 'washer' && item.source.id === home.washer && item.kind === 'confirm')).toBe(true)
  expect(items.some((item) => item.source.kind === 'product' && item.source.id === home.twin && item.kind === 'confirm')).toBe(true)
  expect(items.some((item) => item.source.kind === 'garment' && item.source.id === home.tee && item.kind === 'confirm')).toBe(true)
  // The dry-clean-only blazer and the unknown-care sweater sit on no load.
  expect(stored.excludedItems.map((item) => [item.source.kind, item.source.id, item.kind]).sort()).toEqual([['garment', home.blazer, 'conflict'], ['garment', home.sweater, 'confirm']].sort())
})

test('Confirm recipe records the washer for one load and starts nothing; a new plan asks again', async () => {
  const t = newBackend()
  const as = signedIn(t, 'confirm-recipe')
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt])
  const loadId = planned.loadStates[0]!.loadId
  expect(planned.loadStates[0]!.confirmedMachineId).toBeNull()

  await as.mutation(api.plans.confirmRecipe, { planId: planned.planId, loadId, machineId: home.machine })
  await as.mutation(api.plans.confirmRecipe, { planId: planned.planId, loadId, machineId: home.machine })
  const confirmed = (await as.query(api.plans.get, { planId: planned.planId }))!
  expect(confirmed.loadStates[0]).toMatchObject({ confirmedMachineId: home.machine, sessionId: null, startable: true })
  expect(await t.run(async (ctx) => (await ctx.db.query('sessions').collect()).length), 'confirming is not starting').toBe(0)
  await expect(as.mutation(api.plans.confirmRecipe, { planId: planned.planId, loadId: 'no-such-load', machineId: home.machine })).rejects.toThrow('No such load')
  const dryer = await addDryer(as, home.householdId)
  await expect(as.mutation(api.plans.confirmRecipe, { planId: planned.planId, loadId, machineId: dryer })).rejects.toThrow()

  // Any change that replans the load asks for the recipe to be confirmed again.
  const replanned = await planFor(as, home.householdId, [home.shirt])
  expect(replanned.loadStates[0]!.confirmedMachineId).toBeNull()

  const stranger = signedIn(t, 'confirm-recipe-stranger')
  await expect(stranger.mutation(api.plans.confirmRecipe, { planId: replanned.planId, loadId, machineId: home.machine })).rejects.toThrow()
})

test('qualifying soft water enters the hashed planner input, and changes no dose a person sees on the seeded or catalog labels', async () => {
  // EBMUD's 2025 report stops counting after 2026, so the clock is pinned.
  vi.useFakeTimers()
  vi.setSystemTime(Date.UTC(2026, 9, 6))
  onTestFinished(() => { vi.useRealTimers() })
  // The rules table stores only these conditions, so every stored row matches any water.
  expect(Object.keys(ruleConditions.fields)).not.toContain('waterConditions')
  const t = newBackend()
  const { as, sample, excludedSupplyIds } = await plannedSample(t)
  const pass: PlanPass = { mode: 'normal', loadPins: [], dismissedQuestions: [], excludedSupplyIds }
  const ids = await fixtureIds(t)
  const input = () => t.run((ctx) => canonicalPlannerInput(ctx, sample.householdId, sample.textileIds, pass))
  expect((await input()).waterCondition, 'no water saved: none fed').toBeUndefined()
  // What a person sees: the step without the inert calculated dose, and the at-machine facts without the water they were read with.
  const shown = (result: PlanResult): PlanResult => JSON.parse(JSON.stringify(result, (key, value: unknown) => key === 'calculatedDose' || key === 'waterCondition' ? undefined : value))
  const sameDoses = async () => {
    const soft = await input()
    expect(soft.waterCondition).toBe('soft')
    const { waterCondition: _soft, ...unset } = soft
    const after = plan(soft)
    expect(after.loads.flatMap((load) => load.treatments).length).toBeGreaterThan(0)
    expect(decisions(shown(after), ids)).toEqual(decisions(shown(plan(unset)), ids))
  }
  await as.mutation(api.inventory.setWater, { householdId: sample.householdId, water: { zip: '94596', utility: 'ebmud', area: 'walnut_creek', source: 'lookup' } })
  await sameDoses()
  // The seeded detergent's rows replaced by its catalog direction rows.
  const entry = [...manifest.entries, ...tideAdditions.entries].find((item) => item.variant.key === 'owner-reference:tide-original-liquid-121108:us')!
  const supply = await t.run(async (ctx) => (await ctx.db.query('supplies').collect()).find((row) => row.fixtureKey === 'tide-ultra-concentrate')!._id)
  const extraction = { ...entry, inputSha256: sha256(JSON.stringify(entry)), sources: entry.sources.map((source) => ({ ...source, sha256: sha256(source.snapshot.trim()) })) } as FunctionArgs<typeof internal.catalog.ingest>
  const { revisionId } = await t.mutation(internal.catalog.ingest, extraction)
  const reviewId = await t.mutation(internal.catalog.review, { revisionId, acceptedClaimIds: entry.claims.map((claim) => claim.id), rationale: 'Synthetic review for the water test.', reviewer: 'test' })
  await as.mutation(api.catalog.match, { holding: { kind: 'product', id: supply }, reviewId, acceptedClaimIds: entry.claims.map((claim) => claim.id), confirmation: { market: entry.variant.market, packIdentifier: entry.variant.packIdentifier, labelRevision: entry.labelRevision } })
  const draft = (await as.query(api.catalog.directionsDraft, { supplyId: supply }))!
  await as.mutation(api.catalog.applyDirections, { supplyId: supply, revisionId: draft.revisionId, reviewId: draft.reviewId, stateToken: draft.stateToken, optionId: 'tide-he', confirmedClaimIds: draft.requiredClaimIds,
    confirmation: { market: draft.market, packIdentifier: draft.packIdentifier, labelRevision: draft.labelRevision, physicalPackChecked: true, factsChecked: true, replaceDirections: true, ordinaryFillOnly: true } })
  await sameDoses()
})

test('a plan keeps its loads still to start after its first wash moves to drying', async () => {
  const t = newBackend()
  const as = signedIn(t, 'keeps-plan-user')
  const home = await dryerHousehold(as)
  const jeans = await as.mutation(api.inventory.createTextile, { householdId: home.householdId, name: 'Jeans', color: 'Indigo', colorGroup: 'dark', firstWash: true })
  await dryingCare(as, jeans, 'tumble_dry')
  const planned = await planFor(as, home.householdId, [home.tee, jeans])
  const light = planned.result.loads.find((load) => load.textileIds.includes(home.tee))!
  const dark = planned.result.loads.find((load) => load.id !== light.id)!
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: light.id, idempotencyKey: 'light-first' })
  await finishSteps(as, sessionId)
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })

  const next = (await as.query(api.plans.upNext, { householdId: home.householdId }))!
  expect(next).toMatchObject({ planId: planned.planId, status: 'used' })
  expect(next.loads.find((load) => load.loadId === dark.id)).toMatchObject({ sessionId: null, startable: true })
  await expect(startLoad(as, { planId: planned.planId, loadId: dark.id, idempotencyKey: 'dark-next' })).resolves.toMatchObject({ status: 'running' })
})
