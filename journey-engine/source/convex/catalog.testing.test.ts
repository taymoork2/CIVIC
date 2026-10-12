import { expect, test } from 'vitest'
import type { FunctionArgs } from 'convex/server'
import { sha256 } from '@washcloset/planner'
import ownerManifest from '../docs/research/owner-product-integration/output/manifest.json'
import ownerReview from '../docs/research/owner-product-integration/review.json'
import { api, internal } from './_generated/api'
import { finishSteps, intakeHousehold, newBackend, planFor, signedIn, startLoad } from './harness.testing'

const snapshot = 'Synthetic manufacturer summary: exact test pack, ingredients disclosure only.'
const extraction = () => ({
  product: { key: 'test-detergent', kind: 'product' as const, brand: 'Synthetic Brand', name: 'Test detergent' },
  variant: { key: 'test-detergent-us-123', name: 'Liquid 64 loads', market: 'US', packIdentifier: '123' },
  labelRevision: 'test-label-1', retrieverVersion: 'manual-summary-v1', extractorVersion: 'test-v1', inputSha256: sha256('test input'),
  sources: [{ id: 'maker', url: 'https://example.com/test-pack', retrievedAt: '2026-10-04T00:00:00Z', provider: 'Synthetic manufacturer', snapshot, snapshotKind: 'factual_summary' as const, permission: 'authored factual summary', sha256: sha256(snapshot) }],
  claims: [{ id: 'lipase', key: 'lipaseDisclosure', value: 'not_listed', sourceIds: ['maker'], conditions: 'This disclosure and pack only; not verified absence.' }],
})

const ownerExtractions = ownerManifest.entries.map((entry) => ({
  ...entry,
  inputSha256: sha256(JSON.stringify(entry)),
  sources: entry.sources.map((source) => ({ ...source, sha256: sha256(source.snapshot.trim()) })),
}) as FunctionArgs<typeof internal.catalog.ingest>)

test('the completed owner packet imports and reviews all five references without altering household directions', async () => {
  const t = newBackend()
  const as = signedIn(t, 'owner-packet')
  const home = await intakeHousehold(as)
  const originalSupply = await t.run((ctx) => ctx.db.get(home.detergent))
  const originalRule = await t.run((ctx) => ctx.db.get(home.rule))
  expect(ownerExtractions).toHaveLength(5)
  expect(ownerExtractions.reduce((count, entry) => count + entry.claims.length, 0)).toBe(38)

  for (const entry of ownerExtractions) {
    const imported = await t.mutation(internal.catalog.ingest, entry)
    expect(await t.mutation(internal.catalog.ingest, entry)).toEqual({ ...imported, created: false })
    const unreviewed = await as.query(api.catalog.detail, { variantId: imported.variantId })
    expect(unreviewed.revisions[0]?.reviews).toEqual([])
    const decision = ownerReview.entries.find((review) => review.variantKey === entry.variant.key)!
    expect(decision.acceptedClaimIds).toEqual(entry.claims.map((claim) => claim.id).sort())
    const reviewId = await t.mutation(internal.catalog.review, {
      revisionId: imported.revisionId,
      acceptedClaimIds: decision.acceptedClaimIds,
      rationale: decision.rationale,
      reviewer: ownerReview.reviewer,
    })
    const detail = await as.query(api.catalog.detail, { variantId: imported.variantId, reviewId })
    expect(detail.revisions[0]?.claims).toEqual([...entry.claims].sort((left, right) => left.id.localeCompare(right.id)))
    expect(detail.revisions[0]?.reviews[0]?.acceptedClaimIds).toEqual(entry.claims.map((claim) => claim.id).sort())
    expect((await as.query(api.catalog.find, { kind: 'product', brand: entry.product.brand })).flatMap((result) => result.variants).some((variant) => variant._id === imported.variantId)).toBe(true)
  }
  expect(await t.run((ctx) => ctx.db.get(home.detergent))).toEqual(originalSupply)
  expect(await t.run((ctx) => ctx.db.get(home.rule))).toEqual(originalRule)
})

test('reviewed owner directions retain native marks, rinse contact and missing presoak amounts', () => {
  const byKey = (key: string) => ownerExtractions.find((entry) => entry.variant.key === `owner-reference:${key}:us`)!
  const claimValue = (key: string, id: string) => byKey(key).claims.find((claim) => claim.id === id)!.value
  const tide = JSON.parse(String(claimValue('tide-original-liquid-121108', 'directions-main-wash-0')))
  expect(tide.doseByLoad.medium).toEqual({ capBar: 1, fractionOfBar: 0.8 })
  expect(tide.volumeMl).toBeNull()
  const lysol = JSON.parse(String(claimValue('lysol-crisp-linen-line-1833', 'directions-rinse-sanitization-0')))
  expect(lysol.minimumContactMinutes).toBe(16)
  expect(lysol.doseByMachine.heOrFrontLoad).toEqual({ capfuls: 2, fillEachToLine: 2 })
  expect(lysol.volumeMl).toBeNull()
  expect(claimValue('lysol-crisp-linen-line-1833', 'rinse-minimum-contact')).toBe(16)
  const paks = JSON.parse(String(claimValue('oxiclean-white-revive-paks', 'directions-main-wash-0')))
  expect(paks.regularOrLightSoil).toEqual({ paks: 1 })
  expect(paks.openPak).toBe(false)
  expect(byKey('oxiclean-white-revive-paks').claims.some((claim) => claim.id.startsWith('directions-presoak'))).toBe(false)
  expect(claimValue('downy-rinse-refresh-free-gentle-103111', 'restriction-0')).toBe('Do not use with bleach')
  expect(claimValue('tide-original-liquid-121108', 'lipase')).toBe('not_listed')
})

test('reproducible ingestion deduplicates normalized content, retains changed versions and rejects identity drift', async () => {
  const t = newBackend()
  const first = await t.mutation(internal.catalog.ingest, extraction())
  expect(first.created).toBe(true)
  expect(await t.mutation(internal.catalog.ingest, extraction())).toEqual({ ...first, created: false })
  const next = await t.mutation(internal.catalog.ingest, { ...extraction(), extractorVersion: 'test-v2' })
  expect(next.revisionId).not.toBe(first.revisionId)
  expect(next.variantId).toBe(first.variantId)
  await expect(t.mutation(internal.catalog.ingest, { ...extraction(), variant: { ...extraction().variant, market: 'CA' } })).rejects.toThrow('Variant identity changed')
  expect(await t.run((ctx) => ctx.db.query('catalogProducts').collect())).toHaveLength(1)
  expect(await t.run((ctx) => ctx.db.query('catalogVariants').collect())).toHaveLength(1)
  expect(await t.run((ctx) => ctx.db.query('catalogRevisions').collect())).toHaveLength(2)
})

test('source digests, reuse basis, claim types and source references fail closed', async () => {
  const t = newBackend()
  const data = extraction()
  for (const invalid of [
    { ...data, sources: [{ ...data.sources[0]!, sha256: sha256('different') }] },
    { ...data, sources: [{ ...data.sources[0]!, snapshotKind: 'source_text' as const }] },
    { ...data, claims: [{ ...data.claims[0]!, sourceIds: ['missing'] }] },
    { ...data, claims: [{ ...data.claims[0]!, value: 'absent' }] },
    { ...data, claims: [{ ...data.claims[0]!, key: 'rinseMinimumContactMinutes', value: 0 }] },
    { ...data, claims: [{ ...data.claims[0]!, key: 'rinseMinimumContactMinutes', value: '16' }] },
    { ...data, claims: [{ ...data.claims[0]!, key: 'privateOwnerName' }] },
    { ...data, claims: [{ ...data.claims[0]!, key: 'ingredients', value: false }] },
    { ...data, claims: [{ ...data.claims[0]!, key: 'ingredients', value: [] }] },
    { ...data, sources: Array.from({ length: 20 }, (_, index) => ({ ...data.sources[0]!, id: index === 0 ? 'maker' : `maker-${index}`, snapshot: 'x'.repeat(20000), sha256: sha256('x'.repeat(20000)) })) },
  ]) await expect(t.mutation(internal.catalog.ingest, invalid)).rejects.toThrow()
  expect(await t.run((ctx) => ctx.db.query('catalogRevisions').collect())).toHaveLength(0)
})

test('conflicting extracted claims remain visible while review selects a supported alternative', async () => {
  const t = newBackend()
  const data = extraction()
  const claim = { id: 'time-a', key: 'rinseMinimumContactMinutes', value: 16, sourceIds: ['maker'], conditions: 'rinse' }
  const { revisionId, variantId } = await t.mutation(internal.catalog.ingest, { ...data, claims: [claim, { ...claim, id: 'time-b', value: 15 }] })
  await expect(t.mutation(internal.catalog.review, { revisionId, acceptedClaimIds: ['time-a', 'time-b'], rationale: 'Unresolved', reviewer: 'test' })).rejects.toThrow('Resolve conflicting')
  const reviewId = await t.mutation(internal.catalog.review, { revisionId, acceptedClaimIds: ['time-a'], rationale: 'Choose the rinse direction; reject the conflicting presoak extraction.', reviewer: 'test' })
  const as = signedIn(t, 'catalog-review')
  const detail = await as.query(api.catalog.detail, { variantId })
  expect(detail.revisions[0]?.claims).toHaveLength(2)
  expect(detail.revisions[0]?.reviews[0]?._id).toBe(reviewId)
  expect(detail.revisions[0]?.reviews[0]?.acceptedClaimIds).toEqual(['time-a'])
})

test('matching requires exact identity, reviewed claims and membership without replacing private safety or care', async () => {
  const t = newBackend()
  const as = signedIn(t, 'catalog-owner')
  const home = await intakeHousehold(as)
  const { revisionId, variantId } = await t.mutation(internal.catalog.ingest, extraction())
  const reviewId = await t.mutation(internal.catalog.review, { revisionId, acceptedClaimIds: ['lipase'], rationale: 'Disclosure scope retained.', reviewer: 'test' })
  const args = { holding: { kind: 'product' as const, id: home.detergent }, reviewId, acceptedClaimIds: ['lipase'], confirmation: { market: 'US', packIdentifier: '123', labelRevision: 'test-label-1' } }
  const original = await t.run((ctx) => ctx.db.get(home.detergent))
  await expect(signedIn(t, 'outsider').mutation(api.catalog.match, args)).rejects.toThrow('Forbidden')
  await expect(as.mutation(api.catalog.match, { ...args, confirmation: { ...args.confirmation, market: 'CA' } })).rejects.toThrow('Confirm the exact')
  await expect(as.mutation(api.catalog.match, { ...args, acceptedClaimIds: ['invented'] })).rejects.toThrow('reviewed claims')
  await expect(as.mutation(api.catalog.match, { ...args, holding: { kind: 'garment', id: home.shirt } })).rejects.toThrow('kind does not match')
  await expect(t.query(api.catalog.find, { kind: 'product', brand: 'Synthetic Brand' })).rejects.toThrow('Unauthenticated')
  await as.mutation(api.catalog.match, args)
  const matched = await t.run((ctx) => ctx.db.get(home.detergent))
  expect(matched?.catalogBinding).toMatchObject({ variantId, revisionId, reviewId, acceptedClaimIds: ['lipase'] })
  expect(matched?.safety).toEqual(original?.safety)
  expect(matched?.formulation).toEqual(original?.formulation)
  expect(await as.query(api.catalog.find, { kind: 'product', brand: 'Synthetic Brand' })).toHaveLength(1)
  const newer = await t.mutation(internal.catalog.ingest, { ...extraction(), labelRevision: 'test-label-2' })
  expect(newer.revisionId).not.toBe(revisionId)
  expect((await t.run((ctx) => ctx.db.get(home.detergent)))?.catalogBinding?.revisionId).toBe(revisionId)
  await as.mutation(api.catalog.unmatch, { holding: args.holding })
  expect((await t.run((ctx) => ctx.db.get(home.detergent)))?.catalogBinding).toBeUndefined()
  await as.mutation(api.catalog.match, args)
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, name: 'Another exact pack' })
  expect((await t.run((ctx) => ctx.db.get(home.detergent)))?.catalogBinding).toBeUndefined()
})

test('matching a bottle to its exact reviewed pack records the pack\'s sourced enzymes on the product', async () => {
  const t = newBackend()
  const as = signedIn(t, 'pack-enzymes')
  const home = await intakeHousehold(as)
  const entry = ownerExtractions.find((candidate) => candidate.variant.key === 'owner-reference:tide-original-liquid-121108:us')!
  const imported = await t.mutation(internal.catalog.ingest, entry)
  const decision = ownerReview.entries.find((review) => review.variantKey === entry.variant.key)!
  const reviewId = await t.mutation(internal.catalog.review, { revisionId: imported.revisionId, acceptedClaimIds: decision.acceptedClaimIds, rationale: decision.rationale, reviewer: ownerReview.reviewer })
  expect((await t.run((ctx) => ctx.db.get(home.detergent)))?.safety?.capabilities?.some((fact) => fact.kind === 'protease')).not.toBe(true)
  await as.mutation(api.catalog.match, { holding: { kind: 'product', id: home.detergent }, reviewId, acceptedClaimIds: decision.acceptedClaimIds, confirmation: { market: entry.variant.market, packIdentifier: entry.variant.packIdentifier, labelRevision: entry.labelRevision } })
  const facts = (await t.run((ctx) => ctx.db.get(home.detergent)))?.safety?.capabilities ?? []
  expect(facts.find((fact) => fact.kind === 'protease')).toMatchObject({ status: 'present', variant: entry.variant.packIdentifier })
})

test('garment, machine and product references survive in completed history after holdings change', async () => {
  const t = newBackend()
  const as = signedIn(t, 'catalog-history')
  const home = await intakeHousehold(as)
  const holdings = [{ kind: 'garment' as const, id: home.shirt }, { kind: 'machine' as const, id: home.machine }, { kind: 'product' as const, id: home.detergent }]
  const references = []
  for (const holding of holdings) {
    const data = extraction()
    const claim = { ...data.claims[0]!, id: 'fact', key: holding.kind === 'garment' ? 'material' : holding.kind === 'machine' ? 'model' : 'lipaseDisclosure', value: holding.kind === 'garment' ? 'cotton' : holding.kind === 'machine' ? 'SWNNX2' : 'not_listed' }
    const { revisionId, variantId } = await t.mutation(internal.catalog.ingest, { ...data, product: { ...data.product, key: `history-${holding.kind}`, kind: holding.kind }, variant: { ...data.variant, key: `history-${holding.kind}-123` }, claims: [claim] })
    const reviewId = await t.mutation(internal.catalog.review, { revisionId, acceptedClaimIds: ['fact'], rationale: 'Synthetic history reference.', reviewer: 'test' })
    await as.mutation(api.catalog.match, { holding, reviewId, acceptedClaimIds: ['fact'], confirmation: { market: 'US', packIdentifier: '123', labelRevision: 'test-label-1' } })
    references.push({ revisionId, variantId, reviewId })
  }
  const planned = await planFor(as, home.householdId, [home.shirt])
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'catalog-history' })
  await finishSteps(as, sessionId)
  await as.mutation(api.inventory.updateTextile, { textileId: home.shirt, identity: { brand: 'Replacement' } })
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, model: 'Replacement' })
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, name: 'Replacement pack' })
  for (const holding of holdings) expect((await t.run((ctx) => ctx.db.get(holding.id)))?.catalogBinding).toBeUndefined()
  await as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'catalog-history' })
  const record = (await t.run((ctx) => ctx.db.query('washRecords').collect()))[0]!
  expect(record.activityContext?.garment?.catalogBinding).toMatchObject(references[0]!)
  expect(record.activityContext?.washer?.catalogBinding).toMatchObject(references[1]!)
  expect(record.activityContext?.products[0]?.context?.catalogBinding).toMatchObject(references[2]!)
  expect((await as.query(api.catalog.detail, { ...references[0]! })).revisions[0]?._id).toBe(references[0]!.revisionId)
})
