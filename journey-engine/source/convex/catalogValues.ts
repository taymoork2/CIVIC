import { v } from 'convex/values'

export const catalogKind = v.union(v.literal('garment'), v.literal('machine'), v.literal('product'))
export const catalogSource = v.object({
  id: v.string(), url: v.string(), retrievedAt: v.string(),
  provider: v.string(), providerId: v.optional(v.string()),
  sourceUpdatedAt: v.optional(v.string()),
  // A factual summary is our own extraction; full source text needs explicit reuse permission.
  snapshot: v.string(), snapshotKind: v.union(v.literal('factual_summary'), v.literal('source_text')),
  permission: v.string(), sha256: v.string(),
})
export const catalogClaim = v.object({
  id: v.string(), key: v.string(),
  value: v.union(v.string(), v.number(), v.boolean(), v.array(v.string())),
  sourceIds: v.array(v.string()), conditions: v.string(),
})
export const catalogBinding = v.object({
  variantId: v.id('catalogVariants'), revisionId: v.id('catalogRevisions'), reviewId: v.id('catalogReviews'),
  acceptedClaimIds: v.array(v.string()), matchedAt: v.number(), matchedBy: v.string(),
})
