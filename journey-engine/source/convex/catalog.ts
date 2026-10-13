import { compileDirections, sha256 } from '@washcloset/planner'
import { v } from 'convex/values'
import { internalMutation, mutation, query, type QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { catalogClaim, catalogKind, catalogSource } from './catalogValues'
import { authorize, type Action } from './access'
import { principalFromAuth } from './principal'
import { fail } from './errors'
import { catalogCapabilities, catalogDirectionDraft, catalogSourceContract } from './catalogDirectionAdapter'
import { invalidatePlans } from './plans'
import { loadSize, soilLevel, sourceLoadCategory, supplyMeasure, washerClass } from './validators'
import { normalizeGtin } from './catalogIdentity'

const fields = {
  garment: ['material', 'care', 'massGrams', 'dimensions', 'styleNumber'],
  machine: ['model', 'drumVolumeCuFt', 'drumVolumeLitres', 'highEfficiency', 'programs', 'directions'],
  product: ['function', 'ingredients', 'lipaseDisclosure', 'directions', 'restrictions', 'rinseMinimumContactMinutes'],
} as const

function text(value: string, field: string, max = 200): string {
  const result = value.trim()
  if (!result || result.length > max) fail('invalid', `${field} must contain 1–${max} characters`)
  return result
}
function key(value: string): string {
  const result = text(value, 'Stable key', 120)
  if (!/^[a-z0-9][a-z0-9._:-]*$/.test(result)) fail('invalid', 'Stable keys must use lowercase letters, numbers, dots, colons or hyphens')
  return result
}
function hash(value: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) fail('invalid', 'Expected a SHA-256 digest')
  return value
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([name, entry]) => `${JSON.stringify(name)}:${canonical(entry)}`).join(',')}}`
  return JSON.stringify(value)
}

/** Internal/admin only. No household member can publish or overwrite shared catalog evidence. */
export const ingest = internalMutation({
  args: {
    product: v.object({ key: v.string(), kind: catalogKind, brand: v.string(), name: v.string() }),
    variant: v.object({ key: v.string(), name: v.string(), market: v.string(), packIdentifier: v.string() }),
    labelRevision: v.string(), retrieverVersion: v.string(), extractorVersion: v.string(), inputSha256: v.string(),
    sources: v.array(catalogSource), claims: v.array(catalogClaim),
  },
  handler: async (ctx, args) => {
    if (args.sources.length < 1 || args.sources.length > 20 || args.claims.length < 1 || args.claims.length > 100) fail('invalid', 'Supply 1–20 sources and 1–100 claims')
    const product = { ...args.product, key: key(args.product.key), brand: text(args.product.brand, 'Brand'), name: text(args.product.name, 'Product') }
    const variant = { ...args.variant, key: key(args.variant.key), name: text(args.variant.name, 'Variant'), market: text(args.variant.market, 'Market', 20), packIdentifier: text(args.variant.packIdentifier, 'Pack or model identifier') }
    const sources = args.sources.map((source) => {
      const url = new URL(text(source.url, 'Source URL', 2000))
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.hostname === 'localhost' || url.hostname.endsWith('.local') || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.includes(':')) fail('invalid', 'Catalog sources must be public HTTPS URLs')
      const snapshot = text(source.snapshot, 'Source snapshot', 20000)
      if (sha256(snapshot) !== hash(source.sha256)) fail('invalid', 'Source snapshot digest does not match')
      const permission = text(source.permission, 'Reuse basis', 500)
      if (source.snapshotKind === 'source_text' && !permission.startsWith('explicit:')) fail('invalid', 'Source text needs an explicit reuse basis')
      if (!Number.isFinite(Date.parse(source.retrievedAt))) fail('invalid', 'Source retrieval date is required')
      if (source.providerId !== undefined) text(source.providerId, 'Provider identifier')
      if (source.sourceUpdatedAt !== undefined) text(source.sourceUpdatedAt, 'Source update date', 100)
      text(source.retrievedAt, 'Retrieval date', 100)
      return { ...source, id: key(source.id), url: url.href, snapshot, permission, provider: text(source.provider, 'Provider'), sha256: hash(source.sha256) }
    }).sort((a, b) => a.id.localeCompare(b.id))
    if (new Set(sources.map((source) => source.id)).size !== sources.length) fail('invalid', 'Source IDs must be unique')
    const claims = args.claims.map((claim) => {
      if (!(fields[product.kind] as readonly string[]).includes(claim.key)) fail('invalid', 'Unsupported claim field for this catalog kind')
      if (claim.sourceIds.length < 1 || claim.sourceIds.some((id) => !sources.some((source) => source.id === id))) fail('invalid', 'Every claim needs captured source evidence')
      if (typeof claim.value === 'number' && (!Number.isFinite(claim.value) || claim.value <= 0)) fail('invalid', 'Numeric catalog facts must be positive')
      const measured = ['massGrams', 'drumVolumeCuFt', 'drumVolumeLitres', 'rinseMinimumContactMinutes'].includes(claim.key)
      if (typeof claim.value === 'number' && !measured || typeof claim.value === 'boolean' && claim.key !== 'highEfficiency') fail('invalid', 'Claim value does not match its field')
      if (typeof claim.value === 'string') text(claim.value, 'Claim', 2000)
      if (Array.isArray(claim.value) && (claim.value.length < 1 || claim.value.length > 100 || claim.value.some((value) => !value.trim() || value.length > 300))) fail('invalid', 'Invalid claim list')
      if (measured && typeof claim.value !== 'number') fail('invalid', 'Measured facts require numeric values in the named unit')
      if (claim.key === 'highEfficiency' && typeof claim.value !== 'boolean') fail('invalid', 'HE must be an explicit boolean fact')
      if (claim.key === 'lipaseDisclosure' && !['present', 'not_listed', 'unknown'].includes(String(claim.value))) fail('invalid', 'Disclosure absence is not verified chemical absence')
      return { ...claim, id: key(claim.id), conditions: text(claim.conditions, 'Claim scope', 1000), sourceIds: [...new Set(claim.sourceIds)].sort() }
    }).sort((a, b) => a.id.localeCompare(b.id))
    if (new Set(claims.map((claim) => claim.id)).size !== claims.length) fail('invalid', 'Claim IDs must be unique')
    const extraction = { labelRevision: text(args.labelRevision, 'Label revision'), retrieverVersion: text(args.retrieverVersion, 'Retriever version'), extractorVersion: text(args.extractorVersion, 'Extractor version'), inputSha256: hash(args.inputSha256), sources, claims }
    if (new TextEncoder().encode(canonical(extraction)).byteLength > 400_000) fail('invalid', 'Extraction exceeds the bounded source snapshot size; use a reviewed factual summary')
    const digest = sha256(canonical({ product, variant, ...extraction }))
    const existing = await ctx.db.query('catalogRevisions').withIndex('by_digest', (q) => q.eq('digest', digest)).unique()
    if (existing !== null) return { revisionId: existing._id, variantId: existing.variantId, digest, created: false }
    const now = Date.now()
    const storedProduct = await ctx.db.query('catalogProducts').withIndex('by_key', (q) => q.eq('key', product.key)).unique()
    if (storedProduct !== null && canonical(product) !== canonical({ key: storedProduct.key, kind: storedProduct.kind, brand: storedProduct.brand, name: storedProduct.name })) fail('conflict', 'Product identity changed; use a distinct stable product key')
    const productId = storedProduct?._id ?? await ctx.db.insert('catalogProducts', { ...product, createdAt: now })
    const storedVariant = await ctx.db.query('catalogVariants').withIndex('by_key', (q) => q.eq('key', variant.key)).unique()
    if (storedVariant !== null && (storedVariant.productId !== productId || canonical(variant) !== canonical({ key: storedVariant.key, name: storedVariant.name, market: storedVariant.market, packIdentifier: storedVariant.packIdentifier }))) fail('conflict', 'Variant identity changed; use a distinct stable variant key')
    const variantId = storedVariant?._id ?? await ctx.db.insert('catalogVariants', { ...variant, productId, createdAt: now })
    const revisionId = await ctx.db.insert('catalogRevisions', { variantId, digest, ...extraction, createdAt: now })
    return { revisionId, variantId, digest, created: true }
  },
})

export const review = internalMutation({
  args: { revisionId: v.id('catalogRevisions'), acceptedClaimIds: v.array(v.string()), rationale: v.string(), reviewer: v.string() },
  handler: async (ctx, args) => {
    const revision = await ctx.db.get(args.revisionId)
    if (revision === null) fail('not_found', 'Revision not found')
    const acceptedClaimIds = [...new Set(args.acceptedClaimIds)].sort()
    if (acceptedClaimIds.some((id) => !revision.claims.some((claim) => claim.id === id))) fail('invalid', 'Unknown accepted claim')
    const accepted = revision.claims.filter((claim) => acceptedClaimIds.includes(claim.id))
    for (const claim of accepted) {
      if (accepted.some((other) => other.key === claim.key && other.conditions === claim.conditions && canonical(other.value) !== canonical(claim.value))) fail('conflict', 'Resolve conflicting claims before accepting them')
    }
    return ctx.db.insert('catalogReviews', { ...args, acceptedClaimIds, rationale: text(args.rationale, 'Review rationale', 1000), reviewer: text(args.reviewer, 'Reviewer identifier'), createdAt: Date.now() })
  },
})

/** Exact brand lookup, bounded and authenticated; no fuzzy match is automatically accepted. */
export const find = query({
  args: { kind: catalogKind, brand: v.string() },
  handler: async (ctx, args) => {
    await principalFromAuth(ctx)
    const products = await ctx.db.query('catalogProducts').withIndex('by_kind_brand', (q) => q.eq('kind', args.kind).eq('brand', args.brand.trim())).take(20)
    return Promise.all(products.map(async (product) => ({ product, variants: await ctx.db.query('catalogVariants').withIndex('by_product', (q) => q.eq('productId', product._id)).take(50) })))
  },
})

/** Saved, reviewed product candidates only. Lookup never binds a private pack or replaces directions. */
export const findIdentifier = query({
  args: { identifier: v.string() },
  handler: async (ctx, args) => {
    await principalFromAuth(ctx)
    const gtin14 = normalizeGtin(args.identifier)
    if (gtin14 === null) fail('invalid', 'Enter a UPC-A, EAN-8, EAN-13 or GTIN-14 with a valid check digit.')
    // ponytail: bounded scan of 200 saved variants; add a normalized identifier index before catalog growth.
    const variants = await ctx.db.query('catalogVariants').take(201)
    if (variants.length > 200) fail('invalid', 'Identifier lookup has reached its saved-catalog limit. Use the brand lookup for now.')
    const candidates = []
    for (const variant of variants) {
      if (normalizeGtin(variant.packIdentifier) !== gtin14) continue
      const product = await ctx.db.get(variant.productId)
      if (product?.kind !== 'product') continue
      const revision = await ctx.db.query('catalogRevisions').withIndex('by_variant', (q) => q.eq('variantId', variant._id)).order('desc').first()
      if (revision === null) continue
      const review = await ctx.db.query('catalogReviews').withIndex('by_revision', (q) => q.eq('revisionId', revision._id)).order('desc').first()
      if (review === null || review.acceptedClaimIds.length === 0 || review.acceptedClaimIds.some((id) => {
        const claim = revision.claims.find((entry) => entry.id === id)
        return claim === undefined || claim.sourceIds.length === 0 || claim.sourceIds.some((sourceId) => !revision.sources.some((source) => source.id === sourceId))
      })) continue
      candidates.push({ product, variant, revisionId: revision._id, reviewId: review._id, labelRevision: revision.labelRevision, digest: revision.digest })
    }
    candidates.sort((a, b) => a.variant.market.localeCompare(b.variant.market) || a.variant.key.localeCompare(b.variant.key))
    return { gtin14, candidates }
  },
})

export const detail = query({
  args: { variantId: v.id('catalogVariants'), revisionId: v.optional(v.id('catalogRevisions')), reviewId: v.optional(v.id('catalogReviews')) },
  handler: async (ctx, args) => {
    await principalFromAuth(ctx)
    const variant = await ctx.db.get(args.variantId)
    if (variant === null) fail('not_found', 'Variant not found')
    const product = await ctx.db.get(variant.productId)
    const pinned = args.revisionId === undefined ? null : await ctx.db.get(args.revisionId)
    if (args.revisionId !== undefined && (pinned === null || pinned.variantId !== variant._id)) fail('invalid', 'Revision belongs to another variant')
    const recent = await ctx.db.query('catalogRevisions').withIndex('by_variant', (q) => q.eq('variantId', variant._id)).order('desc').take(20)
    const chosen = pinned ?? recent[0]
    const revisionChoices = (pinned !== null && !recent.some((entry) => entry._id === pinned._id) ? [pinned, ...recent] : recent).map((entry) => ({ revisionId: entry._id, labelRevision: entry.labelRevision, digest: entry.digest, createdAt: entry.createdAt }))
    // Return one source body at a time; many revisions with snapshots can exceed response limits.
    return { product, variant, revisionChoices, revisions: await Promise.all((chosen === undefined ? [] : [chosen]).map(async (revision) => {
      const pinnedReview = args.reviewId === undefined ? null : await ctx.db.get(args.reviewId)
      if (args.reviewId !== undefined && pinnedReview?.revisionId !== revision._id) fail('invalid', 'Review belongs to another revision')
      const reviews = pinnedReview === null ? await ctx.db.query('catalogReviews').withIndex('by_revision', (q) => q.eq('revisionId', revision._id)).order('desc').take(1) : [pinnedReview]
      return { ...revision, reviews }
    })) }
  },
})

type Safety = NonNullable<Doc<'supplies'>['safety']>
/** Sourced capability facts (enzymes) for a supply pinned to an exact reviewed pack; replaces same-kind facts, never inferred from a name. */
async function withCatalogFacts(ctx: QueryCtx, supply: Doc<'supplies'>, binding: NonNullable<Doc<'supplies'>['catalogBinding']>) {
  const revision = await ctx.db.get(binding.revisionId)
  const variant = await ctx.db.get(binding.variantId)
  if (revision === null || variant === null) return null
  const facts = catalogCapabilities(variant.key, revision.digest, variant.packIdentifier, revision.labelRevision)
  if (facts.length === 0) return null
  const base: Safety = supply.safety ?? { bleachKind: 'unknown', incompatibleSupplyIds: [], incompatibleMaterials: [] }
  return { ...base, capabilities: [...(base.capabilities ?? []).filter((own) => !facts.some((fact) => fact.kind === own.kind)), ...facts] }
}

/** One-off for products pinned before the facts were attached; run once per deployment. */
export const backfillCatalogFacts = internalMutation({
  args: {}, returns: v.number(),
  handler: async (ctx) => {
    let patched = 0
    for (const supply of await ctx.db.query('supplies').take(5000)) {
      if (supply.catalogBinding === undefined || supply.archived) continue
      const safety = await withCatalogFacts(ctx, supply, supply.catalogBinding)
      if (safety === null) continue
      await ctx.db.patch(supply._id, { safety })
      await invalidatePlans(ctx, supply.householdId)
      patched += 1
    }
    return patched
  },
})

const holding = v.union(v.object({ kind: v.literal('garment'), id: v.id('textiles') }), v.object({ kind: v.literal('machine'), id: v.id('machines') }), v.object({ kind: v.literal('product'), id: v.id('supplies') }))
/** A pinned reference records deliberate matching and selected reviewed facts; it grants no care permission. */
export const match = mutation({
  args: { holding, reviewId: v.id('catalogReviews'), acceptedClaimIds: v.array(v.string()),
    confirmation: v.object({ market: v.string(), packIdentifier: v.string(), labelRevision: v.string() }) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.holding.id)
    if (item === null) fail('not_found', 'Holding not found')
    const actor = (await authorize(ctx, 'supply.edit', { householdId: item.householdId })).actor
    if (args.holding.kind === 'garment') await authorize(ctx, 'textile.edit', { textileId: args.holding.id })
    const review = await ctx.db.get(args.reviewId)
    if (review === null) fail('not_found', 'Review not found')
    const revision = await ctx.db.get(review.revisionId)
    const variant = revision === null ? null : await ctx.db.get(revision.variantId)
    const product = variant === null ? null : await ctx.db.get(variant.productId)
    if (revision === null || variant === null || product?.kind !== args.holding.kind) fail('invalid', 'Catalog kind does not match this holding')
    if (args.confirmation.market.trim() !== variant.market || args.confirmation.packIdentifier.trim() !== variant.packIdentifier || args.confirmation.labelRevision.trim() !== revision.labelRevision) fail('conflict', 'Confirm the exact market, pack or model and label revision')
    const acceptedClaimIds = [...new Set(args.acceptedClaimIds)].sort()
    if (acceptedClaimIds.length === 0 || acceptedClaimIds.some((id) => !review.acceptedClaimIds.includes(id))) fail('invalid', 'Select only reviewed claims')
    const catalogBinding = { variantId: variant._id, revisionId: revision._id, reviewId: review._id, acceptedClaimIds, matchedAt: Date.now(), matchedBy: actor.key }
    const safety = args.holding.kind === 'product' ? await withCatalogFacts(ctx, item as Doc<'supplies'>, catalogBinding) : null
    await ctx.db.patch(item._id, { catalogBinding, ...(safety === null ? {} : { safety }) })
    if (safety !== null) await invalidatePlans(ctx, item.householdId)
    return null
  },
})

export const unmatch = mutation({
  args: { holding }, returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.holding.id)
    if (item === null) fail('not_found', 'Holding not found')
    await authorize(ctx, 'supply.edit', { householdId: item.householdId })
    if (args.holding.kind === 'garment') await authorize(ctx, 'textile.edit', { textileId: args.holding.id })
    await ctx.db.patch(item._id, { catalogBinding: undefined })
    return null
  },
})

const directionTableValue = v.object({
  measure: supplyMeasure, stage: v.union(v.literal('wash'), v.literal('rinse')),
  placement: v.union(v.literal('detergent_compartment'), v.literal('direct_to_drum'), v.literal('softener_compartment')),
  timing: v.string(), rows: v.array(v.object({
    sourceLoadCategories: v.optional(v.array(sourceLoadCategory)),
    rowText: v.optional(v.string()), loadSizes: v.optional(v.array(loadSize)), soilLevels: v.optional(v.array(soilLevel)),
    join: v.optional(v.union(v.literal('or'), v.literal('and'))),
    cells: v.array(v.object({ machineClass: v.optional(washerClass), amount: v.number(), unit: v.string(), mark: v.optional(v.string()), fractionOfMark: v.optional(v.number()), target: v.optional(v.union(v.literal('below'), v.literal('just_below'))), approximate: v.optional(v.boolean()) })),
  })),
})
const directionDraftValue = v.object({
  revisionId: v.id('catalogRevisions'), reviewId: v.id('catalogReviews'), digest: v.string(), stateToken: v.string(),
  name: v.string(), market: v.string(), packIdentifier: v.string(), labelRevision: v.string(),
  selectedClaimIds: v.array(v.string()), requiredClaimIds: v.array(v.string()), missingClaimIds: v.array(v.string()),
  restrictions: v.array(v.object({ claimId: v.string(), text: v.string() })), limitations: v.array(v.string()),
  sources: v.array(v.object({ id: v.string(), provider: v.string(), url: v.string(), retrievedAt: v.string() })),
  options: v.array(v.object({ id: v.string(), label: v.string(), table: v.union(directionTableValue, v.null()), blockers: v.array(v.string()) })),
})

async function directionBasis(ctx: QueryCtx, action: Action, supplyId: Doc<'supplies'>['_id']) {
  const supply = await ctx.db.get(supplyId)
  if (supply === null) fail('not_found', 'Product not found')
  await authorize(ctx, action, { householdId: supply.householdId })
  if (supply.archived || !['chemical', 'single_use'].includes(supply.kind)) fail('invalid', 'Use an active washer product for these directions')
  const binding = supply.catalogBinding
  if (binding === undefined) fail('invalid', 'Save a pinned manufacturer reference first')
  const [review, revision, variant] = await Promise.all([ctx.db.get(binding.reviewId), ctx.db.get(binding.revisionId), ctx.db.get(binding.variantId)])
  const product = variant === null ? null : await ctx.db.get(variant.productId)
  if (review === null || revision === null || variant === null || product?.kind !== 'product'
    || review.revisionId !== revision._id || revision.variantId !== variant._id
    || binding.acceptedClaimIds.some((id) => !review.acceptedClaimIds.includes(id))) fail('conflict', 'The pinned review and revision no longer agree. Check the reference again.')
  // The schema indexes rules by household; bound this read and refuse oversized households rather than truncate a replacement.
  const householdRules = await ctx.db.query('rules').withIndex('by_household', (q) => q.eq('householdId', supply.householdId)).take(1001)
  if (householdRules.length > 1000) fail('invalid', 'This household needs a product-rule index before source directions can be replaced')
  const rules = householdRules.filter((rule) => rule.supplyId === supplyId).sort((a, b) => a._id.localeCompare(b._id))
  const stateToken = sha256(canonical({ supply, rules }))
  const draft = catalogDirectionDraft({ variantKey: variant.key, digest: revision.digest, claims: revision.claims, selectedClaimIds: binding.acceptedClaimIds })
  return { supply, binding, revision, variant, product, rules, stateToken, draft }
}

/** Reading a draft grants no physical-pack permission and never changes private rules. */
export const directionsDraft = query({
  args: { supplyId: v.id('supplies') }, returns: v.union(directionDraftValue, v.null()),
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.supplyId)
    if (current === null) fail('not_found', 'Product not found')
    await authorize(ctx, 'supply.read', { householdId: current.householdId })
    // Live reference removal/archiving is a stale editor state, not a subscription error that drops its draft.
    if (current.catalogBinding === undefined || current.archived || !['chemical', 'single_use'].includes(current.kind)) return null
    const { binding, revision, variant, product, stateToken, draft } = await directionBasis(ctx, 'supply.read', args.supplyId)
    return { revisionId: revision._id, reviewId: binding.reviewId, digest: revision.digest, stateToken,
      name: product.name, market: variant.market, packIdentifier: variant.packIdentifier, labelRevision: revision.labelRevision,
      selectedClaimIds: binding.acceptedClaimIds, ...draft,
      sources: revision.sources.map(({ id, provider, url, retrievedAt }) => ({ id, provider, url, retrievedAt })),
    }
  },
})

/** Recompile server-side and replace only after exact-pack, selected-fact and stale-state checks, in one transaction. */
export const applyDirections = mutation({
  args: { supplyId: v.id('supplies'), revisionId: v.id('catalogRevisions'), reviewId: v.id('catalogReviews'), stateToken: v.string(), optionId: v.string(),
    confirmedClaimIds: v.array(v.string()), confirmation: v.object({ market: v.string(), packIdentifier: v.string(), labelRevision: v.string(),
      physicalPackChecked: v.boolean(), factsChecked: v.boolean(), replaceDirections: v.boolean(), ordinaryFillOnly: v.boolean() }) },
  returns: v.array(v.id('rules')),
  handler: async (ctx, args) => {
    const { supply, binding, revision, variant, rules, stateToken, draft } = await directionBasis(ctx, 'supply.edit', args.supplyId)
    if (args.stateToken !== stateToken || args.reviewId !== binding.reviewId || args.revisionId !== binding.revisionId) fail('conflict', 'The product, reference or directions changed. Reopen the draft and check again.')
    if (!args.confirmation.physicalPackChecked || !args.confirmation.factsChecked || !args.confirmation.replaceDirections
      || args.confirmation.market.trim() !== variant.market || args.confirmation.packIdentifier.trim() !== variant.packIdentifier
      || args.confirmation.labelRevision.trim() !== revision.labelRevision) fail('invalid', 'Confirm the exact physical pack, formulation/revision, selected facts and replacement of prior directions')
    if (draft.requiredClaimIds.length === 0 || draft.missingClaimIds.length > 0
      || canonical([...new Set(args.confirmedClaimIds)].sort()) !== canonical(draft.requiredClaimIds)) fail('invalid', 'Confirm every required selected and reviewed fact, including restrictions')
    const option = draft.options.find((entry) => entry.id === args.optionId)
    if (option?.table === null || option === undefined || option.blockers.length > 0) fail('invalid', 'This route remains unresolved; existing directions were preserved')
    const isTide = option.id.startsWith('tide-')
    if (isTide && option.id !== 'tide-pods' && !args.confirmation.ordinaryFillOnly) fail('invalid', 'These Tide rows cover ordinary fill only; deep-fill amounts remain unresolved')
    // Keep the sanitizer's reviewed application slice at exact cotton; no blend permission is inferred.
    const materialConditions = option.id === 'lysol-rinse' ? { materials: ['cotton'] } : {}
    const compiled = compileDirections(option.table, supply.kind)
    if (!compiled.ok) fail('invalid', compiled.error)
    // The claim-set digest preserves scope without exceeding the existing 200-character evidence-source contract.
    const source = `catalog-directions:${revision.digest}:${binding.reviewId}:${sha256(canonical(draft.requiredClaimIds))}`
    const provenance = { source, confidence: 'verified' as const }
    const now = Date.now()
    // No writes precede all validation. Convex transaction retries recheck the token against concurrent edits.
    for (const rule of rules) await ctx.db.delete(rule._id)
    const ids = []
    for (const rule of compiled.rules) ids.push(await ctx.db.insert('rules', { householdId: supply.householdId, supplyId: supply._id,
      conditions: { ...rule.conditions, ...materialConditions }, dose: rule.dose,
      stage: option.table.stage, placement: option.table.placement, timing: rule.timing, row: rule.row,
      ...(rule.rowText === undefined ? {} : { rowText: rule.rowText }), provenance, createdAt: now,
    }))
    const sourceContract = catalogSourceContract(variant.key, revision.digest)
    const { sourceContract: _previousContract, sanitizing: previousSanitizing, ...baseSafety } = supply.safety ?? { bleachKind: 'unknown' as const, incompatibleSupplyIds: [], incompatibleMaterials: [] }
    const facts = catalogCapabilities(variant.key, revision.digest, variant.packIdentifier, revision.labelRevision)
    const retainedSafety = { ...baseSafety, ...(facts.length === 0 ? {} : { capabilities: [...(baseSafety.capabilities ?? []).filter((own) => !facts.some((fact) => fact.kind === own.kind)), ...facts] }), ...(previousSanitizing === undefined || previousSanitizing.source.startsWith('catalog-directions:') ? {} : { sanitizing: previousSanitizing }) }
    await ctx.db.patch(supply._id, { measure: option.table.measure, use: option.id === 'tide-pods' ? 'pods' : isTide ? 'detergent' : option.id.startsWith('downy-') ? 'softener' : option.id.startsWith('paks-') || option.id.startsWith('oxi-') ? 'booster' : 'rinse_sanitizer',
      kind: option.id === 'tide-pods' ? 'single_use' : 'chemical',
      safety: { ...retainedSafety, bleachKind: option.id.startsWith('paks-') || option.id.startsWith('oxi-') ? 'oxygen' as const : retainedSafety.bleachKind, ...(sourceContract === undefined ? {} : { sourceContract }) },
      ...(option.id !== 'lysol-rinse' ? {} : { safety: { ...retainedSafety,
        bleachKind: supply.safety?.bleachKind ?? 'unknown', incompatibleSupplyIds: supply.safety?.incompatibleSupplyIds ?? [],
        incompatibleMaterials: [...new Set([...(supply.safety?.incompatibleMaterials ?? []), 'silk', 'wool'])],
        sanitizing: { route: 'rinse' as const, minimumContactMinutes: 16, formulation: `${variant.packIdentifier}:${revision.labelRevision}`, source },
      } }),
    })
    await invalidatePlans(ctx, supply.householdId)
    return ids
  },
})
