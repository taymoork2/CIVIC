import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { fail } from './errors'
import { ensurePrincipal } from './identity'
import { principalFromAuth } from './principal'
import { guidanceStage, guidanceState, wearerKind } from './validators'
import { authorize, type ReadCtx } from './access'

function householdName(name: string): string {
  const normalized = name.trim()
  if (normalized.length === 0) fail('invalid', 'Household name must not be empty')
  if (normalized.length > 120) fail('invalid', 'Household name is too long')
  return normalized
}

async function membershipsFor(ctx: ReadCtx, principalKey: string) {
  return ctx.db
    .query('memberships')
    .withIndex('by_principal', (q) => q.eq('principalKey', principalKey))
    .collect()
}

async function requireNoHousehold(ctx: ReadCtx, principalKey: string): Promise<void> {
  if ((await membershipsFor(ctx, principalKey)).length > 0) {
    fail('conflict', 'Principal already belongs to a household')
  }
}

const role = v.union(v.literal('owner'), v.literal('member'), v.literal('helper'), v.literal('guest'))
const washPlace = v.union(v.literal('home'), v.literal('shared'), v.literal('laundromat'), v.literal('both'))

export const onboardingStatus = query({
  args: {},
  returns: v.object({
    principalKey: v.string(),
    displayName: v.union(v.string(), v.null()),
    households: v.array(v.object({ householdId: v.id('households'), name: v.string(), role, washPlace: v.union(washPlace, v.null()), firstHamperNotePending: v.boolean(), guidance: v.optional(guidanceState) })),
  }),
  handler: async (ctx: QueryCtx) => {
    const actor = await principalFromAuth(ctx.auth)
    const person = await ctx.db
      .query('people')
      .withIndex('by_principal_key', (q) => q.eq('principalKey', actor.key))
      .unique()
    const memberships = await membershipsFor(ctx, actor.key)
    const households = (
      await Promise.all(
        memberships.map(async (membership) => {
          const household = await ctx.db.get(membership.householdId)
          return household === null ? null : { householdId: household._id, name: household.name, role: membership.role,
            washPlace: household.washPlace ?? null, firstHamperNotePending: membership.firstHamperNotePending === true,
            ...(membership.guidance === undefined ? {} : { guidance: membership.guidance }) }
        }),
      )
    ).filter((household) => household !== null)
    return {
      principalKey: actor.key as string,
      displayName: person?.displayName ?? null,
      households,
    }
  },
})

const maxFirstWearers = 12

function wearerName(name: string): string {
  const normalized = name.trim()
  if (normalized.length === 0) fail('invalid', 'Name must not be empty')
  if (normalized.length > 60) fail('invalid', 'Name is too long')
  return normalized
}

/**
 * Creates the household with its owner and, from first run's "Who do you wash for?", the people
 * whose clothes it washes, in one transaction: a household never exists without them. `self`
 * links that wearer to the person creating it; at most one may.
 */
export const createHousehold = mutation({
  args: {
    displayName: v.optional(v.string()),
    name: v.string(),
    washPlace: v.optional(washPlace),
    wearers: v.optional(v.array(v.object({ name: v.string(), kind: wearerKind, self: v.optional(v.boolean()) }))),
    startGuidance: v.optional(v.boolean()),
  },
  returns: v.object({ householdId: v.id('households'), name: v.string(), role: v.literal('owner') }),
  handler: async (ctx, args) => {
    const name = householdName(args.name)
    const wearers = (args.wearers ?? []).map((wearer) => ({ name: wearerName(wearer.name), kind: wearer.kind, self: wearer.self === true }))
    if (wearers.length > maxFirstWearers) fail('invalid', 'Too many people')
    if (wearers.filter((wearer) => wearer.self).length > 1) fail('invalid', 'Only one of them can be you')
    const actor = await ensurePrincipal(ctx, args.displayName)
    await requireNoHousehold(ctx, actor.key)
    const createdAt = Date.now()
    const householdId = await ctx.db.insert('households', { name, createdBy: actor.key, createdAt, ...(args.washPlace === undefined ? {} : { washPlace: args.washPlace }) })
    await ctx.db.insert('memberships', { householdId, principalKey: actor.key, role: 'owner', createdAt, firstHamperNotePending: true,
      ...(args.startGuidance ? { guidance: { status: 'started' as const, stage: 'intent' as const, startedAt: createdAt, updatedAt: createdAt } } : {}) })
    for (const wearer of wearers) {
      await ctx.db.insert('wearers', {
        householdId,
        name: wearer.name,
        kind: wearer.kind,
        ...(wearer.self ? { principalKey: actor.key as string } : {}),
        createdAt,
      })
    }
    return { householdId, name, role: 'owner' as const }
  },
})

export const acknowledgeFirstHamper = mutation({
  args: { householdId: v.id('households') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { membership } = await authorize(ctx, 'membership.editOwn', { householdId: args.householdId })
    await ctx.db.patch(membership._id, { firstHamperNotePending: false })
    return null
  },
})

/** Account + household guidance survives device changes; completion comes only from real care writes. */
export const setGuidance = mutation({
  args: { householdId: v.id('households'), command: v.union(v.literal('start'), v.literal('resume'), v.literal('dismiss'), v.literal('replay')), stage: v.optional(guidanceStage) },
  returns: guidanceState,
  handler: async (ctx, args) => {
    const { membership: member } = await authorize(ctx, 'membership.editOwn', { householdId: args.householdId })
    if (member.guidance?.status === 'completed' && args.command !== 'replay') return member.guidance
    const now = Date.now()
    // Leaving a replay keeps the earned completion: Home offers Replay again, never Resume.
    if (args.command === 'dismiss' && member.guidance?.completedAt !== undefined) {
      const restored = { ...member.guidance, status: 'completed' as const, updatedAt: now }
      await ctx.db.patch(member._id, { guidance: restored })
      return restored
    }
    const guidance = {
      ...member.guidance,
      status: args.command === 'dismiss' ? 'dismissed' as const : 'started' as const,
      stage: args.stage ?? (args.command === 'replay' ? 'intent' : member.guidance?.stage ?? 'intent'),
      startedAt: args.command === 'replay' ? now : member.guidance?.startedAt ?? now,
      updatedAt: now,
    }
    await ctx.db.patch(member._id, { guidance })
    return guidance
  },
})

/** Called after recorded put-away, never from navigation, timer expiry or a tutorial tooltip. */
export async function completeGuidance(ctx: MutationCtx, householdId: Id<'households'>, principalKey: string, now: number): Promise<void> {
  const member = await ctx.db.query('memberships').withIndex('by_household_principal', (q) => q.eq('householdId', householdId).eq('principalKey', principalKey)).unique()
  if (member?.guidance?.status !== 'started') return
  await ctx.db.patch(member._id, { guidance: { ...member.guidance, status: 'completed', stage: 'laundry', completedAt: member.guidance.completedAt ?? now, updatedAt: now } })
}

const inviteLifetimeMs = 7 * 24 * 60 * 60 * 1000

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function normalizedInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** The person an invite links to: in this household, not yet linked to an account, and old enough to hold one. */
async function invitableWearer(ctx: ReadCtx, householdId: Id<'households'>, wearerId: Id<'wearers'>) {
  const wearer = await ctx.db.get(wearerId)
  if (wearer === null || wearer.householdId !== householdId) fail('invalid', 'That person isn’t in this household')
  if (wearer.principalKey !== undefined) fail('conflict', `${wearer.name} already has an account`)
  if (wearer.kind === 'baby') fail('invalid', 'A baby can’t have an account')
  return wearer
}

/**
 * Issues a single-use, expiring invite. Only its hash is stored; the code is shown once. With a
 * person, joining links the new account to them, and a newer invite for the same person replaces
 * (revokes) any earlier unused one, so only one code at a time can claim a closet.
 */
export const createInvite = mutation({
  args: { householdId: v.id('households'), wearerId: v.optional(v.id('wearers')), name: v.optional(v.string()), replacesInviteId: v.optional(v.id('householdInvites')) },
  returns: v.object({ inviteId: v.id('householdInvites'), code: v.string(), expiresAt: v.number() }),
  handler: async (ctx: MutationCtx, args) => {
    const actor = (await authorize(ctx, 'people.invite', { householdId: args.householdId })).actor
    const now = Date.now()
    let wearerId = args.wearerId
    let name = args.name?.trim()
    if (name !== undefined && name.length === 0) fail('invalid', 'Invite name must not be empty')
    if (name !== undefined && name.length > 60) fail('invalid', 'Invite name is too long')
    if (args.replacesInviteId !== undefined) {
      const previous = await ctx.db.get(args.replacesInviteId)
      if (previous === null || previous.householdId !== args.householdId) fail('not_found', 'Invite isn’t in this household')
      if (previous.usedAt !== undefined || previous.revokedAt !== undefined) fail('conflict', 'This invite is no longer pending')
      if ((wearerId !== undefined && wearerId !== previous.wearerId) || (name !== undefined && name !== previous.name)) fail('invalid', 'Replacement must be for the same invitation')
      wearerId = previous.wearerId
      name = previous.name
      await ctx.db.patch(previous._id, { revokedAt: now })
    }
    if (wearerId !== undefined) {
      await invitableWearer(ctx, args.householdId, wearerId)
      const earlier = await ctx.db.query('householdInvites').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect()
      for (const invite of earlier) {
        if (invite.wearerId === wearerId && invite.usedAt === undefined && invite.revokedAt === undefined) await ctx.db.patch(invite._id, { revokedAt: now })
      }
    }
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    const code = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
    const inviteId = await ctx.db.insert('householdInvites', {
      householdId: args.householdId,
      codeHash: await sha256Hex(code),
      createdBy: actor.key,
      ...(wearerId === undefined ? {} : { wearerId }),
      ...(name === undefined ? {} : { name }),
      expiresAt: now + inviteLifetimeMs,
      createdAt: now,
    })
    return { inviteId, code: `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12)}`, expiresAt: now + inviteLifetimeMs }
  },
})

/** Pending invitations are separate from profiles; raw codes are never returned. */
export const pendingInvites = query({
  args: { householdId: v.id('households') },
  returns: v.array(v.object({ inviteId: v.id('householdInvites'), name: v.string(), wearerId: v.optional(v.id('wearers')), expiresAt: v.number() })),
  handler: async (ctx, args) => {
    await authorize(ctx, 'people.read', { householdId: args.householdId })
    const invitations = await ctx.db.query('householdInvites').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect()
    const pending = await Promise.all(invitations.filter((invite) => inviteProblem(invite, Date.now()) === null).map(async (invite) => {
      const person = invite.wearerId === undefined ? null : await ctx.db.get(invite.wearerId)
      if (invite.wearerId !== undefined && (person === null || person.householdId !== args.householdId || person.principalKey !== undefined)) return null
      return { inviteId: invite._id, name: person?.name ?? invite.name ?? 'Invite link', ...(invite.wearerId === undefined ? {} : { wearerId: invite.wearerId }), expiresAt: invite.expiresAt! }
    }))
    return pending.filter((invite) => invite !== null)
  },
})

/** Owners cancel a person's pending link without removing their clothing profile. */
export const cancelInvite = mutation({
  args: { inviteId: v.optional(v.id('householdInvites')), wearerId: v.optional(v.id('wearers')) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if ((args.inviteId === undefined) === (args.wearerId === undefined)) fail('invalid', 'Choose one invitation or clothing profile')
    if (args.inviteId !== undefined) {
      const invite = await ctx.db.get(args.inviteId)
      if (invite === null) fail('not_found', 'Invite not found')
      await authorize(ctx, 'people.invite', { householdId: invite.householdId })
      if (invite.usedAt !== undefined) fail('conflict', 'This invite was already accepted. Remove household access instead.')
      if (invite.revokedAt === undefined) await ctx.db.patch(invite._id, { revokedAt: Date.now() })
      return null
    }
    // Keep the previous caller contract for clients already open during an update.
    const person = await ctx.db.get(args.wearerId!)
    if (person === null) fail('not_found', 'Person not found')
    await authorize(ctx, 'people.invite', { householdId: person.householdId })
    if (person.principalKey !== undefined) fail('conflict', 'They have joined. Remove access from Household members instead.')
    const invite = await ctx.db.query('householdInvites').withIndex('by_wearer', (q) => q.eq('wearerId', person._id)).order('desc').first()
    if (invite !== null && invite.householdId === person.householdId && invite.usedAt === undefined && invite.revokedAt === undefined) await ctx.db.patch(invite._id, { revokedAt: Date.now() })
    return null
  },
})

/** The date an invite ended, spelled the same for everyone (the server has no viewer time zone). */
function inviteDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

type InviteRow = NonNullable<Awaited<ReturnType<typeof findInvite>>>

async function findInvite(ctx: ReadCtx, code: string) {
  const codeHash = await sha256Hex(normalizedInviteCode(code))
  return ctx.db.query('householdInvites').withIndex('by_code_hash', (q) => q.eq('codeHash', codeHash)).unique()
}

/** Why a code cannot be used right now, or null when it can. A revoked invite reads as unknown. */
function inviteProblem(invite: InviteRow | null, now: number): 'unknown' | 'used' | 'expired' | null {
  if (invite === null || invite.revokedAt !== undefined) return 'unknown'
  if (invite.expiresAt === undefined || (invite.role !== undefined && invite.role !== 'member')) return 'unknown'
  if (invite.usedAt !== undefined) return 'used'
  if (invite.expiresAt <= now) return 'expired'
  return null
}

const invitePreviewResult = v.union(
  v.object({
    status: v.literal('valid'),
    householdName: v.string(),
    inviterName: v.union(v.string(), v.null()),
    /** The person whose closet becomes theirs; null for an invite without one, or one claimed meanwhile. */
    wearerName: v.union(v.string(), v.null()),
    role: v.literal('member'),
    expiresAt: v.number(),
  }),
  v.object({ status: v.literal('expired'), expiresAt: v.number() }),
  v.object({ status: v.literal('used') }),
  v.object({ status: v.literal('unknown') }),
)

/**
 * What a person sees before joining: the household, who invited them, the role they get and when
 * the invite ends. Needs a signed-in person who holds the code; the code is the secret, and only
 * its hash is stored. Nothing here changes any data.
 */
export const invitePreview = query({
  args: { code: v.string() },
  returns: invitePreviewResult,
  handler: async (ctx, args) => {
    await principalFromAuth(ctx.auth)
    const invite = await findInvite(ctx, args.code)
    const problem = inviteProblem(invite, Date.now())
    if (problem === 'unknown' || invite === null || invite.expiresAt === undefined) return { status: 'unknown' as const }
    if (problem === 'used') return { status: 'used' as const }
    if (problem === 'expired') return { status: 'expired' as const, expiresAt: invite.expiresAt }
    const household = await ctx.db.get(invite.householdId)
    if (household === null) return { status: 'unknown' as const }
    const inviter = await ctx.db.query('people').withIndex('by_principal_key', (q) => q.eq('principalKey', invite.createdBy)).unique()
    const wearer = invite.wearerId === undefined ? null : await ctx.db.get(invite.wearerId)
    const wearerName = wearer !== null && wearer.householdId === invite.householdId && wearer.principalKey === undefined ? wearer.name : null
    return { status: 'valid' as const, householdName: household.name, inviterName: inviter?.displayName ?? null, wearerName, role: 'member' as const, expiresAt: invite.expiresAt }
  },
})

export const joinWithInvite = mutation({
  args: { code: v.string(), displayName: v.optional(v.string()) },
  /** `linked` is present only for an invite made for a person: false when that closet was claimed or removed meanwhile. */
  returns: v.object({ householdId: v.id('households'), name: v.string(), role: v.literal('member'), linked: v.optional(v.boolean()) }),
  handler: async (ctx, args) => {
    const actor = await ensurePrincipal(ctx, args.displayName)
    const match = await findInvite(ctx, args.code)
    const now = Date.now()
    const problem = inviteProblem(match, now)
    if (problem === 'unknown' || match === null || match.expiresAt === undefined) fail('invalid', 'We couldn’t find that code.')
    if (problem === 'used') fail('invalid', 'This code was already used. Ask the person who invited you for a new one.')
    if (problem === 'expired') fail('invalid', `This code expired on ${inviteDate(match.expiresAt)}. Ask the person who invited you for a new one.`)
    await requireNoHousehold(ctx, actor.key)
    const household = await ctx.db.get(match.householdId)
    if (household === null) fail('invalid', 'We couldn’t find that code.')
    // The joiner gets the same first-run choices as the creator, so guidance starts at the chooser.
    await ctx.db.insert('memberships', { householdId: household._id, principalKey: actor.key, role: 'member', createdAt: now,
      guidance: { status: 'started', stage: 'intent', startedAt: now, updatedAt: now } })
    await ctx.db.patch(match._id, { usedBy: actor.key, usedAt: now })
    if (match.wearerId === undefined) return { householdId: household._id, name: household.name, role: 'member' as const }
    // Link only a person still unclaimed in this household, and only if this account has no closet here already (a return visit).
    const wearer = await ctx.db.get(match.wearerId)
    const mine = await ctx.db.query('wearers').withIndex('by_household_principal', (q) => q.eq('householdId', household._id).eq('principalKey', actor.key)).first()
    const linked = wearer !== null && wearer.householdId === household._id && wearer.principalKey === undefined && mine === null
    if (linked) await ctx.db.patch(wearer._id, { principalKey: actor.key as string })
    return { householdId: household._id, name: household.name, role: 'member' as const, linked: linked || mine?._id === match.wearerId }
  },
})

/** Where the household washes, set from optional setup. Owners only, like the other household settings. */
export const setWashPlace = mutation({
  args: { householdId: v.id('households'), washPlace },
  returns: v.null(),
  handler: async (ctx, args) => {
    await authorize(ctx, 'place.edit', { householdId: args.householdId })
    await ctx.db.patch(args.householdId, { washPlace: args.washPlace })
    return null
  },
})

export const members = query({
  args: { householdId: v.id('households') },
  returns: v.array(v.object({
    membershipId: v.id('memberships'),
    displayName: v.union(v.string(), v.null()),
    role,
    isYou: v.boolean(),
    wearerId: v.union(v.id('wearers'), v.null()),
  })),
  handler: async (ctx, args) => {
    const { actor } = await authorize(ctx, 'people.read', { householdId: args.householdId })
    const memberships = await ctx.db.query('memberships').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect()
    return Promise.all(memberships.map(async (membership) => {
      const person = await ctx.db.query('people').withIndex('by_principal_key', (q) => q.eq('principalKey', membership.principalKey)).unique()
      const wearer = await ctx.db.query('wearers').withIndex('by_household_principal', (q) => q.eq('householdId', args.householdId).eq('principalKey', membership.principalKey)).unique()
      return {
        membershipId: membership._id,
        displayName: person?.displayName ?? null,
        role: membership.role,
        isYou: membership.principalKey === actor.key,
        wearerId: wearer?._id ?? null,
      }
    }))
  },
})

/** Owners remove other members; any member may remove themselves. The last owner cannot leave. */
export const removeMember = mutation({
  args: { membershipId: v.id('memberships') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { target } = await authorize(ctx, 'people.remove', { membershipId: args.membershipId })
    const outfits = await ctx.db.query('dailyOutfits').withIndex('by_household_principal', (q) => q.eq('householdId', target.householdId).eq('principalKey', target.principalKey)).collect()
    for (const outfit of outfits) await ctx.db.delete(outfit._id)
    // Their closet stays with the household, unlinked, so they can be invited back to it.
    const person = await ctx.db.query('wearers').withIndex('by_household_principal', (q) => q.eq('householdId', target.householdId).eq('principalKey', target.principalKey)).unique()
    if (person !== null) {
      const textiles = await ctx.db.query('textiles').withIndex('by_household', (q) => q.eq('householdId', target.householdId)).collect()
      await authorize(ctx, 'textile.edit', { householdId: target.householdId, uses: { textileIds: textiles.filter((piece) => piece.wearerId === person._id && piece.private).map((piece) => piece._id) } })
      await ctx.db.patch(person._id, { principalKey: undefined })
    }
    await ctx.db.delete(target._id)
    return null
  },
})
