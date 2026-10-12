import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { evidenceLevel, plan, type PlannerInput, type PlanResult } from '@washcloset/planner'

import { sanitizedInvoiceGarments, washerPlannerFixture } from '../packages/planner/src/fixtures'
import { invoiceCatalogMaterial, invoiceCatalogReference, roomMachineCatalog } from '../packages/planner/src/fixture-catalog'
import { api } from './_generated/api'
import { fixtureGarmentIdentity, fixtureGarmentKind, fixtureProvenance, fixtureSupplyName } from './fixtures'
import { newBackend, planFor, signedIn, type Backend } from './harness.testing'
import type { StoredPlanResult } from './plans'

test('fixture names do not repeat a brand already in the product name', () => {
  expect(fixtureSupplyName({ id: 'ball', brand: 'Downy', product: 'Downy Ball' })).toBe('Downy Ball')
  expect(fixtureSupplyName({ id: 'tide', brand: 'Tide', product: 'Original' })).toBe('Tide Original')
})

test('invoice descriptions fill only unambiguous garment types', () => {
  expect(fixtureGarmentKind('5001R Staple Raglan Tee')).toBe('t_shirt')
  expect(fixtureGarmentKind('5910 Court Shorts')).toBe('shorts')
  expect(fixtureGarmentKind('5917 Surplus Track Pants')).toBe('pants')
  expect(fixtureGarmentKind("5121 Men's Premium Crew")).toBeNull()
})

test('invoice model codes are metadata and ordinary garment titles are preserved', () => {
  expect(fixtureGarmentIdentity('5001R Staple Raglan Tee')).toEqual({ name: 'Staple Raglan Tee', styleNumber: '5001R' })
  expect(fixtureGarmentIdentity('5910 Court Shorts')).toEqual({ name: 'Court Shorts', styleNumber: '5910' })
  expect(fixtureGarmentIdentity('10-pack heavyweight tees')).toEqual({ name: '10-pack heavyweight tees' })
})

test('catalog material candidates distinguish heathers, fleece and polyester without guessing revisions', () => {
  expect(invoiceCatalogMaterial('5029 Base LS Tee', 'Athletic Heather')).toBe('85% cotton, 15% viscose')
  expect(invoiceCatalogMaterial('5029 Base LS Tee', 'Navy')).toBe('cotton')
  expect(invoiceCatalogMaterial('5145 Heavy Crew', 'Sand')).toBe('80% cotton, 20% polyester')
  expect(invoiceCatalogMaterial('5910 Court Shorts', 'White')).toBe('polyester')
  expect(invoiceCatalogMaterial('5917 Surplus Track Pants', 'White Heather')).toBe('80% cotton, 20% polyester')
  expect(invoiceCatalogMaterial('5056 General LS Tee', 'Athletic Heather')).toBeNull()
  expect(invoiceCatalogMaterial('5029 Base LS Tee', 'Unmatched color')).toBeNull()
  expect(invoiceCatalogMaterial('5029G Base LS Tee', 'Athletic Heather')).toBeNull()
  expect(roomMachineCatalog.SSGNCFGW113TW01).toMatchObject({ drumVolumeCuFt: 7, ratedDryLoadLb: 18 })
})

test('candidate identities distinguish variants and retain an unresolved historical revision', () => {
  const white = invoiceCatalogReference('5001R Staple Raglan Tee', 'White')!
  const black = invoiceCatalogReference('5001R Staple Raglan Tee', 'Black')!
  expect(white.productId).toBe(black.productId)
  expect(white.variantId).not.toBe(black.variantId)
  expect(white.status).toBe('candidate')
  expect(white.evidenceRevisionId).toMatch(/^sha256:[a-f0-9]{64}$/)
  expect(white.evidenceRevisionId).toBe(black.evidenceRevisionId)
  expect(invoiceCatalogReference('5056 General LS Tee', 'Athletic Heather')).toMatchObject({ status: 'candidate' })
  expect(invoiceCatalogReference('5001RS Staple Raglan Tee', 'White')).toBeUndefined()
  expect(invoiceCatalogReference('5001R Staple Raglan Tee', 'Other color')).toBeUndefined()
  const references = sanitizedInvoiceGarments.map((item) => invoiceCatalogReference(String(item.name), item.color!)!)
  expect(new Set(references.map((ref) => ref.productId)).size).toBe(8)
  expect(new Set(references.map((ref) => ref.variantId)).size).toBe(12)
})

beforeEach(() => { vi.stubEnv('WASHCLOSET_DEV_FIXTURES', 'enabled') })
afterEach(() => { vi.unstubAllEnvs() })

async function setup() {
  const t = newBackend()
  const as = signedIn(t, 'fixture-test-user')
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Fixture household' })
  return { t, as, householdId }
}

const counts = (t: Backend) => t.run(async (ctx) => Object.fromEntries(await Promise.all(
  (['collections', 'textiles', 'care', 'supplies', 'rules', 'machines'] as const).map(async (table) => [table, (await ctx.db.query(table).collect()).length]),
)))

test('fixture seeding is refused unless the development flag is set', async () => {
  const { as, householdId } = await setup()
  vi.stubEnv('WASHCLOSET_DEV_FIXTURES', '')
  await expect(as.mutation(api.fixtures.seedWasherFixture, { householdId })).rejects.toThrow('Fixture seeding is disabled')
  expect(await as.query(api.fixtures.available, {})).toBe(false)
})

test('a non-member cannot seed another household', async () => {
  const { t, householdId } = await setup()
  await expect(signedIn(t, 'outsider').mutation(api.fixtures.seedWasherFixture, { householdId })).rejects.toThrow('Forbidden')
})

test('re-seeding the same household creates no duplicates', async () => {
  const { t, as, householdId } = await setup()
  const first = await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  const afterFirst = await counts(t)
  const second = await as.mutation(api.fixtures.seedWasherFixture, { householdId })

  expect(first.seeded).toBe(true)
  expect(second.seeded).toBe(false)
  expect(afterFirst.textiles).toBe(23)
  expect(afterFirst.machines).toBe(32)
  expect(await counts(t)).toEqual(afterFirst)
  expect(second.textileIds).toEqual(first.textileIds)
  expect(second.supplyIds).toEqual(first.supplyIds)
  expect(second.machineIds).toEqual(first.machineIds)
})

test('candidate links survive a nickname, detach on identity changes and are not silently reattached', async () => {
  const { t, as, householdId } = await setup()
  const seed = await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  const textileId = seed.textileIds[0]!
  const read = () => t.run((ctx) => ctx.db.get(textileId))
  const initial = (await read())!.catalogCandidate
  expect(initial).toMatchObject({ productId: 'garment-product-0001', variantId: 'garment-variant-0001', status: 'candidate' })
  await as.mutation(api.inventory.updateTextile, { textileId, name: 'My everyday shirt' })
  expect((await read())!.catalogCandidate).toEqual(initial)
  await as.mutation(api.inventory.updateTextile, { textileId, identity: (await read())!.identity!, color: 'White' })
  expect((await read())!.catalogCandidate).toEqual(initial)
  await as.mutation(api.inventory.updateTextile, { textileId, identity: { brand: 'Generic' } })
  expect((await read())!.catalogCandidate).toBeUndefined()
  await as.mutation(api.fixtures.seedWasherFixture, { householdId, refreshCatalogFacts: true })
  expect((await read())!.catalogCandidate).toBeUndefined()
  expect((await read())!.identity?.brand).toBe('Generic')
})

test('an explicit refresh can fill missing candidate metadata without rewriting checked care', async () => {
  const { t, as, householdId } = await setup()
  const seed = await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  const textileId = seed.textileIds[0]!
  await as.mutation(api.inventory.setCare, { textileId, material: 'custom blend', washMethod: 'machine', maxTemperatureC: 30, restrictions: ['Wash alone'], provenance: { source: 'Owner label', confidence: 'observed' } })
  await t.run((ctx) => ctx.db.patch(textileId, { catalogCandidate: undefined }))
  const read = () => t.run(async (ctx) => ({ textile: await ctx.db.get(textileId), care: await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textileId)).unique() }))
  const before = await read()
  await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  expect((await read()).textile!.catalogCandidate).toBeUndefined()
  await as.mutation(api.fixtures.seedWasherFixture, { householdId, refreshCatalogFacts: true })
  expect((await read()).textile!.catalogCandidate?.status).toBe('candidate')
  expect((await read()).care).toEqual(before.care)
})

test('care and product evidence stays unknown while the owner-described room stays traceable', async () => {
  const { t, as, householdId } = await setup()
  await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  const { stored, machines, care } = await t.run(async (ctx) => {
    const machines = await ctx.db.query('machines').collect()
    const care = await ctx.db.query('care').collect()
    const stored = [
      ...care.map((row) => row.provenance),
      ...(await ctx.db.query('supplies').collect()).map((row) => row.provenance),
      ...(await ctx.db.query('rules').collect()).map((row) => row.provenance),
    ]
    return { stored, machines, care }
  })

  expect(stored.every((provenance) => provenance.confidence === 'unknown')).toBe(true)
  expect(stored.some((provenance) => provenance.source.includes('owned-tide-label'))).toBe(true)
  expect(machines.every((machine) => machine.provenance.confidence === 'observed')).toBe(true)
  expect(machines.every((machine) => machine.capacityConfidence === 'estimated')).toBe(true)
  expect(machines.every((machine) => Object.values(machine.cycleProfile?.cycles ?? {}).every((cycle) => cycle.confidence === 'observed'))).toBe(true)
  expect(JSON.stringify(machines.map((machine) => machine.dispensingProfile))).not.toContain('"verified"')
  expect(care.every((row) => row.status === 'needs_confirmation')).toBe(true)
  expect(care.filter((row) => row.material === 'polyester')).toHaveLength(2)
  expect(care.filter((row) => row.material === '85% cotton, 15% viscose')).toHaveLength(2)
  expect(care.filter((row) => row.material === '80% cotton, 20% polyester')).toHaveLength(3)
  expect(care.filter((row) => row.material === undefined)).toHaveLength(2)
  expect(care.every((row) => row.provenance.source.includes('catalog:'))).toBe(true)
})

test('explicit catalog refresh corrects legacy fixture materials, invalidates plans and preserves user edits and progress', async () => {
  const { t, as, householdId } = await setup()
  const first = await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  const care = await t.run(async (ctx) => {
    const rows = await ctx.db.query('care').collect()
    for (const row of rows) await ctx.db.patch(row._id, { material: 'cotton', provenance: { source: 'sanitized-fixture:invoice-care-label', confidence: 'unknown' } })
    return rows
  })
  const heather = care.find((row) => row.material === '85% cotton, 15% viscose')!
  const shorts = care.find((row) => row.material === 'polyester')!
  const otherShorts = care.filter((row) => row.material === 'polyester')[1]!
  // A modified unknown care record, an actual checked label and a changed identity
  // must all survive; baseline material alone is not proof we own the field.
  await t.run(async (ctx) => {
    await ctx.db.patch(heather._id, { dryMethod: 'line_dry', restrictions: ['No soaking'] })
    await ctx.db.patch(shorts._id, { material: 'linen', status: 'confirmed', provenance: { source: 'label_taps', confidence: 'observed' } })
    await ctx.db.patch(otherShorts.textileId, { identity: { brand: 'Edited brand' } })
    await ctx.db.patch(first.textileIds[0]!, { washCount: 7, status: 'clean' })
  })
  const storedPlan = await planFor(as, householdId, first.textileIds.slice(1))
  await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  expect(await t.run(async (ctx) => (await ctx.db.query('care').collect()).filter((row) => row.material === '80% cotton, 20% polyester'))).toHaveLength(0)
  expect((await as.mutation(api.fixtures.seedWasherFixture, { householdId, refreshCatalogFacts: true })).seeded).toBe(true)
  const after = await t.run(async (ctx) => ({ care: await ctx.db.query('care').collect(), textile: await ctx.db.get(first.textileIds[0]!), plan: await ctx.db.get(storedPlan.planId) }))
  expect(after.care.filter((row) => row.material === '80% cotton, 20% polyester')).toHaveLength(3)
  expect(after.care.filter((row) => row.material === undefined)).toHaveLength(2)
  expect(after.care.find((row) => row._id === heather._id)).toMatchObject({ material: 'cotton', dryMethod: 'line_dry', restrictions: ['No soaking'] })
  expect(after.care.find((row) => row._id === shorts._id)).toMatchObject({ material: 'linen', status: 'confirmed', provenance: { confidence: 'observed' } })
  expect(after.care.find((row) => row._id === otherShorts._id)?.material).toBe('cotton')
  expect(after.textile).toMatchObject({ washCount: 7, status: 'clean' })
  expect(after.plan?.status).toBe('stale')
  expect((await as.mutation(api.fixtures.seedWasherFixture, { householdId, refreshCatalogFacts: true })).seeded).toBe(false)
  expect(await t.run(async (ctx) => ctx.db.query('care').collect())).toEqual(after.care)
})

test('product family corrections do not certify fixture doses or misplace rinse sanitizer in bleach', async () => {
  expect(washerPlannerFixture.supplies?.find((row) => row.id === 'downy-rinse-refresh')?.kind).not.toBe('softener')
  const { t, as, householdId } = await setup()
  await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  const rule = await t.run(async (ctx) => (await ctx.db.query('rules').collect()).find((row) => row.fixtureKey === 'lysol-rinse-medium-load'))
  expect(rule).toMatchObject({ stage: 'rinse', placement: 'softener_compartment', provenance: { confidence: 'unknown' } })
})

test('legacy sanitizer refresh preserves changed doses and only corrects the original fixture rule', async () => {
  const { t, as, householdId } = await setup()
  await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  const rule = await t.run(async (ctx) => (await ctx.db.query('rules').collect()).find((row) => row.fixtureKey === 'lysol-rinse-medium-load'))
  if (!rule) throw new Error('Sanitizer fixture rule missing')
  await t.run(async (ctx) => ctx.db.patch(rule._id, { placement: 'bleach_compartment', dose: { ...rule.dose, amount: 121 } }))
  await as.mutation(api.fixtures.seedWasherFixture, { householdId, refreshCatalogFacts: true })
  expect(await t.run(async (ctx) => ctx.db.get(rule._id))).toMatchObject({ placement: 'bleach_compartment', dose: { amount: 121 } })
  await t.run(async (ctx) => ctx.db.patch(rule._id, { dose: rule.dose }))
  await as.mutation(api.fixtures.seedWasherFixture, { householdId, refreshCatalogFacts: true })
  expect(await t.run(async (ctx) => ctx.db.get(rule._id))).toMatchObject({ placement: 'softener_compartment', provenance: { confidence: 'unknown' } })
  expect((await as.mutation(api.fixtures.seedWasherFixture, { householdId, refreshCatalogFacts: true })).seeded).toBe(false)
})

test('invoice brand is filled in without replacing edited identity or care history', async () => {
  const { t, as, householdId } = await setup()
  const { textileIds } = await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  await t.run(async (ctx) => {
    await ctx.db.patch(textileIds[0]!, { identity: { size: 'M' }, washCount: 7 })
    await ctx.db.patch(textileIds[1]!, { identity: { brand: 'Edited brand', size: 'L' } })
  })
  await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  const rows = await t.run(async (ctx) => Promise.all(textileIds.slice(0, 2).map((id) => ctx.db.get(id))))
  expect(rows[0]?.identity).toEqual({ brand: 'AS Colour', styleNumber: '5001R', size: 'M' })
  expect(rows[0]?.washCount).toBe(7)
  expect(rows[1]?.identity).toEqual({ brand: 'Edited brand', size: 'L' })
})

test('catalog refresh cleans original invoice titles but preserves renamed garments and edited model codes', async () => {
  const { t, as, householdId } = await setup()
  const { textileIds } = await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  await t.run(async (ctx) => {
    await ctx.db.patch(textileIds[0]!, { name: '5001R Staple Raglan Tee', identity: { brand: 'AS Colour' } })
    await ctx.db.patch(textileIds[1]!, { name: 'My everyday tee', identity: { brand: 'AS Colour', styleNumber: 'My code' } })
    await ctx.db.patch(textileIds[2]!, { name: '5001R Staple Raglan Tee', identity: { brand: 'AS Colour', styleNumber: 'Edited model' } })
  })
  await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  expect((await t.run(async (ctx) => ctx.db.get(textileIds[0]!)))?.name).toBe('5001R Staple Raglan Tee')
  await as.mutation(api.fixtures.seedWasherFixture, { householdId, refreshCatalogFacts: true })
  const rows = await t.run(async (ctx) => Promise.all(textileIds.slice(0, 3).map((id) => ctx.db.get(id))))
  expect(rows[0]).toMatchObject({ name: 'Staple Raglan Tee', identity: { brand: 'AS Colour', styleNumber: '5001R' } })
  expect(rows[1]).toMatchObject({ name: 'My everyday tee', identity: { styleNumber: 'My code' } })
  expect(rows[2]).toMatchObject({ name: '5001R Staple Raglan Tee', identity: { styleNumber: 'Edited model' } })
})

test('family demo assigns matching garments to people and preserves edited ownership on rerun', async () => {
  const t = newBackend()
  const as = signedIn(t, 'family-fixture')
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Family fixture', wearers: [{ name: 'Me', kind: 'adult', self: true }, { name: 'Partner', kind: 'adult' }, { name: 'Child', kind: 'child' }] })
  await as.mutation(api.fixtures.seedWasherFixture, { householdId, family: true })
  const inventory = await as.query(api.inventory.list, { householdId })
  expect(inventory.textiles).toHaveLength(23)
  expect(new Set(inventory.textiles.map((textile) => textile.wearerId)).size).toBe(3)
  expect(inventory.textiles.every((textile) => textile.wearerId !== null)).toBe(true)
  const first = inventory.textiles[0]!
  await as.mutation(api.inventory.updateTextile, { textileId: first.textileId, wearerId: null })
  await as.mutation(api.fixtures.seedWasherFixture, { householdId, family: true })
  expect((await as.query(api.inventory.list, { householdId })).textiles.find((textile) => textile.textileId === first.textileId)?.wearerId).toBeNull()
})

test('mixed demo includes ready packs and care needs without resetting history on ordinary reruns', async () => {
  const { t, as, householdId } = await setup()
  const first = await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  await t.run(async (ctx) => ctx.db.patch(first.textileIds[0]!, { washCount: 7, identity: { brand: 'Edited brand', size: 'M' } }))
  await as.mutation(api.fixtures.seedWasherFixture, { householdId, mixed: true })
  const rows = (await as.query(api.inventory.list, { householdId })).textiles
  expect(rows.filter((row) => row.status === 'clean')).toHaveLength(13)
  expect(rows.filter((row) => row.status === 'dirty')).toHaveLength(9)
  expect(rows.filter((row) => row.status === 'needs_refresh')).toHaveLength(1)
  const whiteTees = rows.filter((row) => row.name === 'Staple Raglan Tee' && row.color === 'White')
  expect(whiteTees.map((row) => row.status)).toEqual(['clean', 'clean', 'dirty', 'dirty'])
  expect(rows[0]?.washCount).toBe(7)
  expect(rows[0]?.identity).toEqual({ brand: 'Edited brand', size: 'M' })
  expect((await as.mutation(api.fixtures.seedWasherFixture, { householdId, mixed: true })).seeded).toBe(false)
  await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  expect((await as.query(api.inventory.list, { householdId })).textiles).toEqual(rows)
})

test('a seeded fixture plans the same fail-closed decisions as the pure fixture under equivalent evidence', async () => {
  const { t, as, householdId } = await setup()
  const { textileIds } = await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  const persisted: StoredPlanResult = (await planFor(as, householdId, textileIds)).result

  const downgrade = (evidence: { source?: string; status?: string } | null | undefined) => {
    const stored = fixtureProvenance(evidence)
    return { source: stored.source, status: evidenceLevel(stored.confidence) }
  }
  const equivalent: PlannerInput = {
    textiles: sanitizedInvoiceGarments.map((garment) => ({ ...garment, care: { ...garment.care, status: 'needs_confirmation' as const, evidence: downgrade(garment.care?.evidence) } })),
    supplies: washerPlannerFixture.supplies!.map((supply) => ({ ...supply, labelEvidence: downgrade(supply.labelEvidence), applicationRules: supply.applicationRules?.map((rule) => ({ ...rule, evidence: downgrade(rule.evidence) })) })),
    machines: washerPlannerFixture.machines!.map((machine) => ({ ...machine, capacityConfidence: downgrade({ source: machine.evidence?.source, status: machine.capacityConfidence }).status, evidence: downgrade(machine.evidence) })),
  }
  const pure: PlanResult = plan(equivalent)
  const causes = (result: StoredPlanResult) => [...new Set(result.reasons.map((reason) => `${reason.code}:${String(reason.details.cause)}`))].sort()

  expect(persisted.status).toBe('needs_confirmation')
  expect(persisted.loads.some((load) => load.status === 'ready')).toBe(false)
  expect(persisted.exclusions).toHaveLength(23)
  expect(persisted.status).toBe(pure.status)
  expect(causes(persisted)).toEqual(causes(pure).filter((cause) => cause !== 'needs_confirmation:insufficient_machine_evidence'))
  expect(await t.run(async (ctx) => (await ctx.db.query('plans').collect()).length)).toBe(1)
})

test('the sample wool balls and 20 shared dryers seed with the room inventory', async () => {
  const { t, as, householdId } = await setup()
  await as.mutation(api.fixtures.seedWasherFixture, { householdId })
  const { balls, machines } = await t.run(async (ctx) => ({
    balls: (await ctx.db.query('supplies').collect()).find((supply) => supply.fixtureKey === 'wool-dryer-balls'),
    machines: await ctx.db.query('machines').collect(),
  }))
  expect(balls).toMatchObject({ kind: 'wool_dryer_ball', provenance: { confidence: 'unknown' } })
  expect(machines.filter((machine) => machine.applianceType === 'tumble_dryer')).toHaveLength(20)
  expect(machines.find((machine) => machine.fixtureKey === 'trial-dryer-1')?.heatSettings).toContainEqual({ heat: 'delicate', label: 'Delicates' })
})
