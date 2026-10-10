import { expect, test } from 'vitest'
import type { FunctionArgs } from 'convex/server'
import { sha256 } from '@washcloset/planner'
import manifest from '../docs/research/owner-product-integration/output/manifest.json'
import additions from '../docs/research/owner-product-integration/tide-additions/output/manifest.json'
import { api, internal } from './_generated/api'
import { intakeHousehold, newBackend, signedIn } from './harness.testing'

const extraction = (variantKey: string, market = 'US', packIdentifier = 'gtin14:00030772103111'): FunctionArgs<typeof internal.catalog.ingest> => ({
  product: { key: 'identifier-test', kind: 'product', brand: 'Synthetic Brand', name: 'Synthetic product' },
  variant: { key: variantKey, name: variantKey, market, packIdentifier },
  labelRevision: 'synthetic-label', retrieverVersion: 'synthetic', extractorVersion: 'synthetic', inputSha256: sha256('synthetic'),
  sources: [{ id: 'maker', url: 'https://example.com/synthetic', retrievedAt: '2026-10-05T00:00:00Z', provider: 'Synthetic maker', snapshot: 'Synthetic facts', snapshotKind: 'factual_summary', permission: 'authored summary', sha256: sha256('Synthetic facts') }],
  claims: [{ id: 'ingredients', key: 'ingredients', value: ['Synthetic disclosed ingredient'], sourceIds: ['maker'], conditions: 'Synthetic pack only' }],
})

test('saved owner GTIN references are useful, source-reviewed candidates without changing private facts', async () => {
  const t = newBackend()
  const as = signedIn(t, 'identifier-owner')
  await intakeHousehold(as)
  const supplies = await t.run((ctx) => ctx.db.query('supplies').collect())
  const rules = await t.run((ctx) => ctx.db.query('rules').collect())
  for (const entry of [...manifest.entries, ...additions.entries]) {
    const imported = await t.mutation(internal.catalog.ingest, { ...entry, inputSha256: sha256(JSON.stringify(entry)), sources: entry.sources.map((source) => ({ ...source, sha256: sha256(source.snapshot.trim()) })) } as FunctionArgs<typeof internal.catalog.ingest>)
    expect((await as.query(api.catalog.findIdentifier, { identifier: '030772103111' })).candidates.some((candidate) => candidate.variant._id === imported.variantId)).toBe(false)
    await t.mutation(internal.catalog.review, { revisionId: imported.revisionId, acceptedClaimIds: entry.claims.map((claim) => claim.id), rationale: 'Saved reviewed source facts, no physical-pack match.', reviewer: 'synthetic-test' })
  }
  for (const [identifier, key] of [['030772103111', 'downy-rinse-refresh-free-gentle-103111'], ['030772121108', 'tide-original-liquid-121108'], ['030772235843', 'tide-free-gentle-235843'], ['030772032503', 'tide-pods-spring-meadow-032503']]) {
    const found = await as.query(api.catalog.findIdentifier, { identifier })
    expect(found.candidates).toHaveLength(1)
    const candidate = found.candidates[0]!
    expect(candidate.variant.key).toBe(`owner-reference:${key}:us`)
    const detail = await as.query(api.catalog.detail, { variantId: candidate.variant._id, revisionId: candidate.revisionId, reviewId: candidate.reviewId })
    expect(detail.revisions[0]?.digest).toBe(candidate.digest)
    expect(detail.revisions[0]?.reviews[0]?._id).toBe(candidate.reviewId)
  }
  expect(await t.run((ctx) => ctx.db.query('supplies').collect())).toEqual(supplies)
  expect(await t.run((ctx) => ctx.db.query('rules').collect())).toEqual(rules)
})

test('market and same-market variant ambiguity stays explicit; unreviewed or withdrawn latest evidence stays out', async () => {
  const t = newBackend()
  const as = signedIn(t, 'identifier-ambiguity')
  for (const [key, market] of [['test-us-a', 'US'], ['test-us-b', 'US'], ['test-ca', 'CA'], ['test-unreviewed', 'US'], ['test-empty-review', 'US']]) {
    const { revisionId } = await t.mutation(internal.catalog.ingest, extraction(key!, market))
    if (key !== 'test-unreviewed') await t.mutation(internal.catalog.review, { revisionId, acceptedClaimIds: key === 'test-empty-review' ? [] : ['ingredients'], rationale: 'Synthetic review', reviewer: 'test' })
  }
  const found = await as.query(api.catalog.findIdentifier, { identifier: '0030772103111' })
  expect(found.candidates.map((candidate) => [candidate.variant.key, candidate.variant.market])).toEqual([['test-ca', 'CA'], ['test-us-a', 'US'], ['test-us-b', 'US']])
  await t.mutation(internal.catalog.ingest, { ...extraction('test-us-a'), labelRevision: 'new-unreviewed' })
  const withdrawn = found.candidates.find((candidate) => candidate.variant.key === 'test-us-b')!
  await t.mutation(internal.catalog.review, { revisionId: withdrawn.revisionId, acceptedClaimIds: [], rationale: 'Withdrawn', reviewer: 'test' })
  expect((await as.query(api.catalog.findIdentifier, { identifier: '030772103111' })).candidates.map((candidate) => candidate.variant.key)).toEqual(['test-ca'])
})

test('invalid, non-barcode source IDs, unmatched codes, unauthenticated callers and oversized catalogs fail explicitly', async () => {
  const t = newBackend()
  const as = signedIn(t, 'identifier-limits')
  await expect(t.query(api.catalog.findIdentifier, { identifier: '030772103111' })).rejects.toThrow('Unauthenticated')
  for (const identifier of ['030772103110', 'material-number:42019647', 'source-product-id:10000443']) await expect(as.query(api.catalog.findIdentifier, { identifier })).rejects.toThrow('valid check digit')
  for (const [key, pack] of [['material', 'material-number:96385074'], ['source', 'source-product-id:96385074']]) {
    const { revisionId } = await t.mutation(internal.catalog.ingest, extraction(key!, 'US', pack))
    await t.mutation(internal.catalog.review, { revisionId, acceptedClaimIds: ['ingredients'], rationale: 'Source identity only', reviewer: 'test' })
  }
  expect((await as.query(api.catalog.findIdentifier, { identifier: '96385074' })).candidates).toEqual([])
  await t.run(async (ctx) => {
    const product = (await ctx.db.query('catalogProducts').first())!
    for (let index = 0; index < 199; index++) await ctx.db.insert('catalogVariants', { key: `limit-${index}`, productId: product._id, name: 'Synthetic', market: 'US', packIdentifier: 'unknown', createdAt: Date.now() })
  })
  await expect(as.query(api.catalog.findIdentifier, { identifier: '030772103111' })).rejects.toThrow('saved-catalog limit')
})

test('a review with missing claim/source evidence cannot become an identifier candidate', async () => {
  const t = newBackend()
  const as = signedIn(t, 'identifier-source')
  const { revisionId } = await t.mutation(internal.catalog.ingest, extraction('source-guard'))
  await t.mutation(internal.catalog.review, { revisionId, acceptedClaimIds: ['ingredients'], rationale: 'Synthetic', reviewer: 'test' })
  await t.run((ctx) => ctx.db.patch(revisionId, { sources: [] }))
  expect((await as.query(api.catalog.findIdentifier, { identifier: '030772103111' })).candidates).toEqual([])
})
