import { v } from 'convex/values'

import { mutation, type MutationCtx } from './_generated/server'
import { fail } from './errors'
import { deletePhotoRows } from './photos'
import { principalFromAuth, type AuthenticatedPrincipal } from './principal'
import { eraseOutcomeData } from './outcomeAssessments'
import { eraseIntakeSaves } from './intakeSaves'

export async function ensurePrincipal(ctx: MutationCtx, displayName?: string): Promise<AuthenticatedPrincipal> {
  const normalizedDisplayName = displayName?.trim()
  if (normalizedDisplayName !== undefined && normalizedDisplayName.length === 0) {
    fail('invalid', 'Display name must not be empty')
  }
  if (normalizedDisplayName !== undefined && normalizedDisplayName.length > 120) {
    fail('invalid', 'Display name is too long')
  }
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) fail('unauthenticated', 'Unauthenticated')
  const actor = await principalFromAuth(ctx.auth)
  const now = Date.now()
  const principal = await ctx.db
    .query('principals')
    .withIndex('by_principal_key', (q) => q.eq('principalKey', actor.key))
    .unique()
  if (principal === null) {
    await ctx.db.insert('principals', {
      principalKey: actor.key,
      issuer: identity.issuer,
      subject: identity.subject,
      createdAt: now,
    })
  }
  const person = await ctx.db
    .query('people')
    .withIndex('by_principal_key', (q) => q.eq('principalKey', actor.key))
    .unique()
  if (person === null) {
    await ctx.db.insert('people', {
      principalKey: actor.key,
      ...(normalizedDisplayName === undefined ? {} : { displayName: normalizedDisplayName }),
      createdAt: now,
    })
  } else if (normalizedDisplayName !== undefined && person.displayName !== normalizedDisplayName) {
    await ctx.db.patch(person._id, { displayName: normalizedDisplayName })
  }
  return actor
}

export const ensureCurrentPrincipal = mutation({
  args: { displayName: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => (await ensurePrincipal(ctx, args.displayName)).key,
})

/**
 * Removes a deleted account's household access, profile, notification subscriptions, and the
 * care photos it uploaded (bytes included). Garments it added remain household records.
 * Access removal and initial cleanup run in the auth deletion transaction. Long assessment/audit
 * histories are removed in bounded scheduled batches; membership loss immediately prevents reads.
 */
export async function removePrincipalData(ctx: MutationCtx, principalKey: string): Promise<{ removedMemberships: number }> {
  await eraseIntakeSaves(ctx, principalKey)
  await eraseOutcomeData(ctx, { reporterKey: principalKey })
  const memberships = await ctx.db.query('memberships').withIndex('by_principal', (q) => q.eq('principalKey', principalKey)).collect()
  const subscriptions = await ctx.db.query('notificationSubscriptions').withIndex('by_principal', (q) => q.eq('principalKey', principalKey)).collect()
  const people = await ctx.db.query('people').withIndex('by_principal_key', (q) => q.eq('principalKey', principalKey)).collect()
  const principals = await ctx.db.query('principals').withIndex('by_principal_key', (q) => q.eq('principalKey', principalKey)).collect()
  for (const membership of memberships) {
    const outfits = await ctx.db.query('dailyOutfits').withIndex('by_household_principal', (q) => q.eq('householdId', membership.householdId).eq('principalKey', principalKey)).collect()
    for (const outfit of outfits) await ctx.db.delete(outfit._id)
  }
  for (const row of [...memberships, ...subscriptions, ...people, ...principals]) await ctx.db.delete(row._id)
  const photos = await ctx.db.query('carePhotos').withIndex('by_uploader', (q) => q.eq('uploadedBy', principalKey)).collect()
  await deletePhotoRows(ctx, photos)
  return { removedMemberships: memberships.length }
}
