import type { Doc, Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { fail } from './errors'
import { principalFromAuth, type AuthenticatedPrincipal } from './principal'

/** What authorization needs from a function context. A mutation context satisfies it as well. */
export type ReadCtx = Pick<QueryCtx, 'db' | 'auth'>

/**
 * Who may do what. `member`: any member of the resource's household. `owner`: owners only.
 * `selfOrOwner`: a member acting only on their own account (the target's `subjects`), or an owner.
 * `self`: a member acting on rows that are theirs alone (`subjects`, the rows' principal keys); owners too.
 * Roles, place scopes and privacy change this table and `authorize`, not the call sites.
 */
export type Rule = 'member' | 'owner' | 'selfOrOwner' | 'self' | 'closetOwner'

export const rules = {
  // Reads
  'household.read': 'member',
  'textile.read': 'member',
  'session.read': 'member',
  'plan.read': 'member',
  'supply.read': 'member',
  'people.read': 'member',
  'feedback.read': 'owner',
  // Writes
  'household.edit': 'member',
  'membership.editOwn': 'member',
  'place.edit': 'owner',
  'textile.add': 'member',
  'textile.edit': 'member',
  'textile.privacy': 'closetOwner',
  'textile.trash': 'member',
  'photo.edit': 'member',
  'outfit.edit': 'member',
  'session.run': 'member',
  'plan.edit': 'member',
  'machine.add': 'member',
  'machine.edit': 'member',
  'supply.add': 'member',
  'supply.edit': 'member',
  'people.add': 'member',
  'people.edit': 'member',
  'people.link': 'selfOrOwner',
  'people.invite': 'owner',
  'people.remove': 'selfOrOwner',
  'feedback.send': 'member',
  'feedback.manage': 'owner',
  'fixture.seed': 'member',
  // Rows owned by one person
  'routine.set': 'self',
  'routine.clear': 'self',
  'reminder.dismiss': 'self',
} as const satisfies Record<string, Rule>

export type Action = keyof typeof rules

/** Scoped roles stay closed until their place-specific rules ship. */
export const roleRules = { owner: rules, member: rules, helper: {}, guest: {} } as const

/** A refusal with its own words; every other refusal is 'Forbidden'. */
const refusals: Partial<Record<Action, string>> = {
  'people.link': 'Only that person or an owner can link them',
  'routine.set': 'Choose only your own pieces in this household',
  'routine.clear': 'Only the owner can remove this garment’s routine',
}

export type Access = { actor: AuthenticatedPrincipal; membership: Doc<'memberships'> }

/** `subjects`: the principal keys a self or self-or-owner action touches. `uses`: rows the action uses. */
type HouseholdTarget = { householdId: Id<'households'>; subjects?: readonly string[]; uses?: Uses; textile?: Doc<'textiles'> }

/** A linked person owns their closet; household owners manage people without accounts. */
export async function ownsCloset(ctx: Pick<ReadCtx, 'db'>, principalKey: string, role: Doc<'memberships'>['role'], textile: Doc<'textiles'>): Promise<boolean> {
  if (role !== 'owner' && role !== 'member') return false
  const wearer = textile.wearerId === undefined ? null : await ctx.db.get(textile.wearerId)
  if (wearer !== null && wearer.householdId !== textile.householdId) return false
  return wearer?.principalKey === undefined ? role === 'owner' || (wearer === null && textile.ownerPrincipalKey === principalKey) : wearer.principalKey === principalKey
}

export async function hidesTextile(ctx: Pick<ReadCtx, 'db'>, principalKey: string, textile: Doc<'textiles'>): Promise<boolean> {
  if (textile.private !== true) return false
  const membership = await ctx.db.query('memberships').withIndex('by_household_principal', (q) => q.eq('householdId', textile.householdId).eq('principalKey', principalKey)).unique()
  return membership === null || !await ownsCloset(ctx, principalKey, membership.role, textile)
}

/** Identity for a load response, with care retained for a private piece. Never changes planner input. */
export type PrivateCare = {
  washMethod: NonNullable<Doc<'care'>['washMethod']>; cycle: string | null; maxTemperatureC: number | null;
  dryMethod: NonNullable<Doc<'care'>['dryMethod']>; dryHeat: Doc<'care'>['dryHeat'] | null; bleach: NonNullable<Doc<'care'>['bleach']> | 'unknown';
  restrictions: string[]; lines: string[];
}
export type LoadIdentity = { textileId: Id<'textiles'>; name: string | null; color: string | null; colorGroup?: string; guest?: boolean; private?: boolean; privateCare?: PrivateCare | null }

export async function loadIdentity(ctx: Pick<ReadCtx, 'db'>, principalKey: string, textileId: Id<'textiles'>): Promise<LoadIdentity> {
  const textile = await ctx.db.get(textileId)
  const hidden = textile !== null && await hidesTextile(ctx, principalKey, textile)
  const care = hidden ? await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textileId)).unique() : null
  return {
    textileId, name: hidden ? null : textile?.name ?? null, color: hidden ? null : textile?.color ?? null,
    ...(hidden ? { private: true, privateCare: care === null ? null : {
      washMethod: care.washMethod ?? 'unknown', cycle: care.cycle ?? null, maxTemperatureC: care.maxTemperatureC ?? null,
      dryMethod: care.dryMethod ?? 'unknown', dryHeat: care.dryHeat ?? null, bleach: care.bleach ?? 'unknown',
      restrictions: care.restrictions,
      lines: care.instructions === undefined ? [] : [...care.instructions.preparation, ...care.instructions.washing, ...care.instructions.beforeDrying, ...care.instructions.drying],
    } } : { ...(textile?.colorGroup === undefined ? {} : { colorGroup: textile.colorGroup }), ...(textile?.guest === true ? { guest: true } : {}) }),
  }
}

/** Rows an action uses besides its target (by id, or an unchecked id string): each must be of the target's household. */
export type Uses = { machineIds?: readonly string[]; supplyIds?: readonly string[]; textileIds?: readonly string[] }
export type Used = { machines: Doc<'machines'>[]; supplies: Doc<'supplies'>[]; textiles: Doc<'textiles'>[] }

/** The resource relation: every row `uses` names exists and belongs to `householdId`, else 'Forbidden'. */
export async function related(ctx: Pick<ReadCtx, 'db'>, householdId: Id<'households'>, uses: Uses): Promise<Used> {
  const rows = <T extends 'machines' | 'supplies' | 'textiles'>(table: T, ids: readonly string[] = []) => Promise.all(ids.map(async (id) => {
    const rowId = ctx.db.normalizeId(table, id)
    const row = rowId === null ? null : await ctx.db.get(rowId)
    if (row === null || row.householdId !== householdId) fail('forbidden', 'Forbidden')
    return row as Doc<T>
  }))
  return { machines: await rows('machines', uses.machineIds), supplies: await rows('supplies', uses.supplyIds), textiles: await rows('textiles', uses.textileIds) }
}

/** The rule check for a known principal key: the membership when allowed, else the refusal text. */
async function check(ctx: Pick<ReadCtx, 'db'>, principalKey: string, action: Action, target: HouseholdTarget): Promise<Doc<'memberships'> | string> {
  const membership = await ctx.db
    .query('memberships')
    .withIndex('by_household_principal', (q) => q.eq('householdId', target.householdId).eq('principalKey', principalKey))
    .unique()
  if (membership === null) return 'Forbidden'
  if (!(action in roleRules[membership.role])) return 'Forbidden'
  if (target.textile !== undefined && target.textile.householdId !== target.householdId) return 'Forbidden'
  const rule: Rule = rules[action]
  if (rule === 'closetOwner') return target.textile !== undefined && await ownsCloset(ctx, principalKey, membership.role, target.textile) ? membership : 'Forbidden'
  if (target.textile !== undefined && await hidesTextile(ctx, principalKey, target.textile)) return 'Forbidden'
  if (rule === 'self') {
    const own = target.subjects !== undefined && target.subjects.length > 0 && target.subjects.every((key) => key === principalKey)
    return own ? membership : refusals[action] ?? 'Forbidden'
  }
  if (rule === 'member' || membership.role === 'owner') return membership
  // An owner action, or a self action without its subjects, stays the owner's.
  if (rule === 'owner' || target.subjects === undefined || target.subjects.some((key) => key !== principalKey)) {
    return refusals[action] ?? 'Forbidden'
  }
  return membership
}

async function allow(ctx: ReadCtx, action: Action, target: HouseholdTarget): Promise<Access & { used: Used }> {
  const actor = await principalFromAuth(ctx.auth)
  const membership = await check(ctx, actor.key, action, target)
  if (typeof membership === 'string') fail('forbidden', membership)
  const used = await related(ctx, target.householdId, target.uses ?? {})
  if (action.startsWith('textile.') || action === 'outfit.edit' || action.startsWith('routine.')) {
    for (const textile of used.textiles) if (await hidesTextile(ctx, actor.key, textile)) fail('forbidden', 'Forbidden')
  }
  return { actor, membership, used }
}

/**
 * `authorize` for a principal key carried outside `ctx.auth` (a signed photo link). Returns the
 * membership, or null where `authorize` would refuse.
 */
export async function authorizeKey(ctx: Pick<ReadCtx, 'db'>, principalKey: string, action: Action, target: HouseholdTarget): Promise<Doc<'memberships'> | null> {
  const membership = await check(ctx, principalKey, action, target)
  return typeof membership === 'string' ? null : membership
}

/**
 * The one permission check: may the signed-in person do `action` to `target`, using the rows in
 * `uses`? Returns the actor, their membership, the loaded document and the used rows (`used`).
 * A trashed garment reads as not found.
 */
export async function authorize(ctx: ReadCtx, action: Action, target: HouseholdTarget): Promise<Access & { used: Used }>
export async function authorize(ctx: ReadCtx, action: Action, target: { textileId: Id<'textiles'> }): Promise<Access & { textile: Doc<'textiles'> }>
export async function authorize(ctx: ReadCtx, action: Action, target: { sessionId: Id<'sessions'>; uses?: Uses }): Promise<Access & { session: Doc<'sessions'>; used: Used }>
export async function authorize(ctx: ReadCtx, action: Action, target: { membershipId: Id<'memberships'> }): Promise<Access & { target: Doc<'memberships'> }>
export async function authorize(
  ctx: ReadCtx,
  action: Action,
  target: HouseholdTarget | { textileId: Id<'textiles'> } | { sessionId: Id<'sessions'>; uses?: Uses } | { membershipId: Id<'memberships'> },
): Promise<Access & { textile?: Doc<'textiles'>; session?: Doc<'sessions'>; target?: Doc<'memberships'>; used?: Used }> {
  if ('textileId' in target) {
    const textile = await ctx.db.get(target.textileId)
    if (textile === null || textile.trashedAt !== undefined) fail('not_found', 'Not found')
    return { ...(await allow(ctx, action, { householdId: textile.householdId, textile })), textile }
  }
  if ('sessionId' in target) {
    const session = await ctx.db.get(target.sessionId)
    if (session === null) fail('not_found', 'Not found')
    return { ...(await allow(ctx, action, { householdId: session.householdId, ...(target.uses === undefined ? {} : { uses: target.uses }) })), session }
  }
  if ('membershipId' in target) {
    await principalFromAuth(ctx.auth)
    const removed = await ctx.db.get(target.membershipId)
    if (removed === null) fail('not_found', 'Not found')
    const access = await allow(ctx, action, { householdId: removed.householdId, subjects: [removed.principalKey] })
    if (removed.role === 'owner') {
      const owners = (await ctx.db.query('memberships').withIndex('by_household', (q) => q.eq('householdId', removed.householdId)).collect())
        .filter((membership) => membership.role === 'owner')
      if (owners.length === 1) fail('conflict', 'The last owner cannot leave the household')
    }
    return { ...access, target: removed }
  }
  return allow(ctx, action, target)
}

/** Private garments leave closet lists; sessions retain all pieces and mask identity in their responses. */
export async function visible<T extends Doc<'textiles'> | Doc<'wearers'> | Doc<'sessions'>>(ctx: ReadCtx, actor: AuthenticatedPrincipal, rows: T[]): Promise<T[]> {
  const shown = await Promise.all(rows.map(async (row) => !('collectionId' in row) || !await hidesTextile(ctx, actor.key, row)))
  return rows.filter((_row, index) => shown[index])
}
