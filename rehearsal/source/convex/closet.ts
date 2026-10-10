import { v, type Infer } from 'convex/values'
import { routineWashMethod } from './personalRoutineValues'
import { completeGuidance } from './households'

import { clothingTags, occasions, flagReasons, stainReasons, isDryerPhase, stainWashLimit, type GarmentKind, type Occasion, type StainReason } from '@washcloset/planner'

import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { mutation, query, type MutationCtx } from './_generated/server'
import { authorize, visible, type ReadCtx } from './access'
import { fail } from './errors'
import { careInstructionRevision } from './careInstructions'
import { estimatedWashFinish } from './execution'
import { tagAnswers, tagCare, tagEvidence, wardrobeFor, writeCare } from './inventory'
import { busyTextiles, currentPlanner, invalidatePlans, planResult, stainWords } from './plans'
import type { AuthenticatedPrincipal } from './principal'
import { colorGroup, flagReason, garmentKind, occasion, soilLevel, stainReport, laundryObservation, type TextileFlag, type TextileStatus } from './validators'

const hour = 3_600_000
const day = 24 * hour

/** Household closet preferences when unset. */
const closetDefaults = { hamperDays: 7, wetDays: 1, cleanerDays: 7, notWornDays: 90 } as const

/** "Needed by tomorrow or sooner": exact because `neededBy` is a local end of day. */
export function neededSoon(neededBy: number, now: number): boolean {
  return neededBy - now < 48 * hour
}

/** Who gets urgent-flag heads-ups: the household's choice, else whoever created it. */
export function laundryPersonKey(household: Doc<'households'>): string {
  return household.closet?.laundryPersonKey ?? household.createdBy
}

function closetPreferences(household: Doc<'households'> | null) {
  const closet = household?.closet ?? {}
  return {
    hamperDays: closet.hamperDays ?? closetDefaults.hamperDays,
    wetDays: closet.wetDays ?? closetDefaults.wetDays,
    cleanerDays: closet.cleanerDays ?? closetDefaults.cleanerDays,
    notWornDays: closet.notWornDays ?? closetDefaults.notWornDays,
  }
}

/** When a garment's state last changed; older rows read their creation time. */
function since(textile: Doc<'textiles'>): number {
  return textile.statusSince ?? textile.createdAt
}

/** Legacy occasion queries read explicit tags, independently of clothing type. */
function effectiveOccasions(textile: Doc<'textiles'>): readonly Occasion[] {
  const tags = clothingTags(textile).map((tag) => tag.toLowerCase())
  return occasions.filter((occasion) => tags.includes(occasion))
}

async function careOf(ctx: ReadCtx, textileId: Id<'textiles'>): Promise<Doc<'care'> | null> {
  return ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textileId)).unique()
}

/**
 * The machine hamper: dirty garments not in a running load and not hand-wash-only, guests included.
 * Hand-wash-only garments are counted apart.
 */
async function machineHamper(ctx: ReadCtx, actor: AuthenticatedPrincipal, householdId: Id<'households'>, busy: ReadonlyMap<Id<'textiles'>, Id<'sessions'>>) {
  const dirty = await visible(ctx, actor, await ctx.db.query('textiles').withIndex('by_household_status', (q) => q.eq('householdId', householdId).eq('status', 'dirty')).collect())
  const waiting = dirty.filter((textile) => textile.trashedAt === undefined && !busy.has(textile._id))
  const handWash = new Set<Id<'textiles'>>()
  for (const textile of waiting) if (routineWashMethod(textile, await careOf(ctx, textile._id)) === 'hand_wash') handWash.add(textile._id)
  return { hamper: waiting.filter((textile) => !handWash.has(textile._id)), handWash: waiting.filter((textile) => handWash.has(textile._id) && textile.guest !== true).length }
}

/**
 * The number of loads the newest current normal plan makes of exactly the machine hamper, or null
 * when no such plan exists. The Closet and Laundry both read it from here.
 */
async function hamperLoads(ctx: ReadCtx, householdId: Id<'households'>, hamper: readonly Doc<'textiles'>[]): Promise<number | null> {
  if (hamper.length === 0) return null
  const key = hamper.map((textile) => textile._id as string).sort().join(',')
  const plans = (await Promise.all((['ready', 'needs_confirmation', 'used'] as const).map((status) => ctx.db
    .query('plans')
    .withIndex('by_household_status', (q) => q.eq('householdId', householdId).eq('status', status))
    .collect())))
    .flat()
    .filter((stored) => currentPlanner(stored) && (stored.mode ?? 'normal') === 'normal' && stored.textileIds !== undefined && [...stored.textileIds].sort().join(',') === key)
    .sort((left, right) => right.createdAt - left.createdAt || right._creationTime - left._creationTime)
  return plans.length === 0 ? null : planResult(plans[0]!).loads.length
}

/**
 * The facts the web's `sessionStage` reads, the same way `execution.householdSessions` gathers them.
 */
async function stageFacts(ctx: ReadCtx, session: Doc<'sessions'>) {
  const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
  const actions = timeline?.actions ?? []
  const washer = timeline?.machineId === undefined ? null : await ctx.db.get(timeline.machineId)
  return {
    status: session.status,
    machineStartedAt: session.machineStartedAt ?? null,
    washFinishAt: await estimatedWashFinish(ctx, session, washer),
    washFinishedAt: session.washFinishedAt ?? null,
    dryerStartedAt: session.dryerStartedAt ?? null,
    dryMinutes: timeline?.drying?.status === 'ready' ? timeline.drying.minutes ?? null : null,
    hasDrying: actions.some((action) => action.phase === 'dryer_start' && action.status !== 'skipped'),
    dryerStepRecorded: actions.some((action) => isDryerPhase(action.phase) && action.status === 'confirmed'),
    dryerUnloaded: actions.some((action) => action.phase === 'dryer_unload' && action.status !== 'pending'),
  }
}

// ---- Read ------------------------------------------------------------------

/**
 * What is ready to wear, for a wearer and an occasion when given, and what is not ready. Guests'
 * clothes never appear. Garments in a running load count as in the wash.
 */
export const today = query({
  args: { householdId: v.id('households'), wearerId: v.optional(v.id('wearers')), occasion: v.optional(occasion) },
  handler: async (ctx, args) => {
    const { actor } = await authorize(ctx, 'textile.read', { householdId: args.householdId })
    if (args.wearerId !== undefined) {
      const wearer = await ctx.db.get(args.wearerId)
      if (wearer === null || wearer.householdId !== args.householdId) fail('forbidden', 'Forbidden')
    }
    const [household, textiles, busy] = await Promise.all([
      ctx.db.get(args.householdId),
      ctx.db.query('textiles').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect().then((rows) => visible(ctx, actor, rows)),
      busyTextiles(ctx, args.householdId),
    ])
    const shown = textiles.filter((textile) =>
      textile.guest !== true
      && textile.trashedAt === undefined
      && (args.wearerId === undefined || textile.wearerId === args.wearerId)
      && (args.occasion === undefined || effectiveOccasions(textile).includes(args.occasion)))
    const state = (textile: Doc<'textiles'>): TextileStatus | 'in_wash' => (busy.has(textile._id) ? 'in_wash' : textile.status)
    const ready = shown.filter((textile) => state(textile) === 'clean')
    const notReady = shown.filter((textile) => state(textile) !== 'clean')
    const counts = { dirty: 0, in_wash: 0, hanging: 0, needs_dry_clean: 0, at_cleaner: 0, needs_refresh: 0 }
    for (const textile of notReady) counts[state(textile) as keyof typeof counts] += 1
    return {
      ready: ready.map((textile) => ({
        _id: textile._id,
        name: textile.name,
        kind: textile.kind,
        colorGroup: textile.colorGroup,
        color: textile.color,
        wearerId: textile.wearerId,
        occasions: effectiveOccasions(textile),
        wearsSinceClean: textile.wearsSinceClean ?? 0,
        lastWornAt: textile.lastWornAt,
        lastCleanedAt: textile.lastCleanedAt,
        createdAt: textile.createdAt,
      })),
      readyCount: ready.length,
      notReadyForOccasion: args.occasion === undefined ? [] : notReady.map((textile) => ({
        textileId: textile._id,
        name: textile.name,
        status: state(textile),
        neededBy: textile.flag?.neededBy,
        cleanerPickupBy: textile.cleanerPickupBy,
        sessionId: busy.get(textile._id),
      })),
      notReady: counts,
      notWornDays: closetPreferences(household).notWornDays,
    }
  },
})

/**
 * What needs the household: the hamper with its load count, the single top slot, and at most three
 * Needs-you cards. Thresholds come from the household's closet preferences. `now` comes from the
 * device, rounded to the minute, so time-based cards update; a clock more than a day off is ignored.
 */
export const attention = query({
  args: { householdId: v.id('households'), now: v.number() },
  handler: async (ctx, args) => {
    const { actor } = await authorize(ctx, 'household.read', { householdId: args.householdId })
    const serverNow = Date.now()
    const now = Number.isFinite(args.now) && Math.abs(args.now - serverNow) <= day ? args.now : serverNow
    const [household, busy, running, hanging, atCleaner] = await Promise.all([
      ctx.db.get(args.householdId),
      busyTextiles(ctx, args.householdId),
      ctx.db.query('sessions').withIndex('by_household_status', (q) => q.eq('householdId', args.householdId).eq('status', 'running')).collect().then((rows) => visible(ctx, actor, rows)),
      ctx.db.query('textiles').withIndex('by_household_status', (q) => q.eq('householdId', args.householdId).eq('status', 'hanging')).collect().then((rows) => visible(ctx, actor, rows)),
      ctx.db.query('textiles').withIndex('by_household_status', (q) => q.eq('householdId', args.householdId).eq('status', 'at_cleaner')).collect().then((rows) => visible(ctx, actor, rows)),
    ])
    const preferences = closetPreferences(household)
    const { hamper, handWash } = await machineHamper(ctx, actor, args.householdId, busy)
    const hamperSummary = { count: hamper.length, loads: await hamperLoads(ctx, args.householdId, hamper), handWash }
    const closetHamper = hamper.filter((textile) => textile.guest !== true)
    const oldest = (textiles: readonly Doc<'textiles'>[]) => Math.min(...textiles.map(since))
    const wet = closetHamper.filter((textile) => textile.flag?.reasons.includes('wet') === true)

    type TopSlot =
      | { kind: 'running'; sessionId: Id<'sessions'>; facts: Awaited<ReturnType<typeof stageFacts>> }
      | { kind: 'needed'; textileId: Id<'textiles'>; name: string; neededBy: number }
      | { kind: 'wet'; count: number; name?: string; since: number }
      | { kind: 'hamper'; count: number; loads: number | null }
    let top: TopSlot | null = null
    const latestRun = [...running].sort((left, right) => (right.startedAt ?? right._creationTime) - (left.startedAt ?? left._creationTime))[0]
    const needed = closetHamper
      .filter((textile) => textile.flag?.neededBy !== undefined && neededSoon(textile.flag.neededBy, now))
      .sort((left, right) => left.flag!.neededBy! - right.flag!.neededBy!)[0]
    if (latestRun !== undefined) top = { kind: 'running', sessionId: latestRun._id, facts: await stageFacts(ctx, latestRun) }
    else if (needed !== undefined) top = { kind: 'needed', textileId: needed._id, name: needed.name, neededBy: needed.flag!.neededBy! }
    else if (wet.length > 0) top = { kind: 'wet', count: wet.length, ...(wet.length === 1 ? { name: wet[0]!.name } : {}), since: oldest(wet) }
    else if (hamperSummary.count > 0) top = { kind: 'hamper', count: hamperSummary.count, loads: hamperSummary.loads }

    type Card =
      | { kind: 'hanging'; sessionId: Id<'sessions'>; since: number }
      | { kind: 'wet'; textileIds: Id<'textiles'>[]; since: number }
      | { kind: 'hamper'; count: number; since: number }
      | { kind: 'cleaner'; textileIds: Id<'textiles'>[]; since: number; pickupBy?: number }
    const cards: Card[] = []
    // A hanging garment belongs to the load that hung it, found from its latest `hung` history row.
    const hungBy = new Map<Id<'sessions'>, number>()
    for (const textile of hanging) {
      if (textile.guest === true) continue
      const events = await ctx.db.query('history').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).order('desc').collect()
      const hung = events.find((event) => event.event === 'hung' && event.sessionId !== undefined)
      if (hung === undefined) continue
      const session = await ctx.db.get(hung.sessionId!)
      if (session === null || session.status !== 'completed') continue
      hungBy.set(session._id, session.completedAt ?? hung.occurredAt)
    }
    for (const [sessionId, completedAt] of [...hungBy].sort((left, right) => left[1] - right[1])) cards.push({ kind: 'hanging', sessionId, since: completedAt })
    const wetTooLong = wet.filter((textile) => now - since(textile) >= preferences.wetDays * day)
    if (wetTooLong.length > 0) cards.push({ kind: 'wet', textileIds: wetTooLong.map((textile) => textile._id), since: oldest(wetTooLong) })
    const hamperTooLong = closetHamper.filter((textile) => now - since(textile) >= preferences.hamperDays * day)
    if (hamperTooLong.length > 0) cards.push({ kind: 'hamper', count: hamperTooLong.length, since: oldest(hamperTooLong) })
    const late = atCleaner.filter((textile) => textile.guest !== true && (textile.cleanerPickupBy === undefined
      ? now - since(textile) >= preferences.cleanerDays * day
      : now > textile.cleanerPickupBy))
    if (late.length > 0) {
      const pickups = late.flatMap((textile) => (textile.cleanerPickupBy === undefined ? [] : [textile.cleanerPickupBy]))
      cards.push({ kind: 'cleaner', textileIds: late.map((textile) => textile._id), since: oldest(late), ...(pickups.length === 0 ? {} : { pickupBy: Math.min(...pickups) }) })
    }
    return { hamper: hamperSummary, top, cards: cards.slice(0, 3) }
  },
})

// ---- Garment state changes -------------------------------------------------

type Batch = {
  readonly actor: AuthenticatedPrincipal
  readonly householdId: Id<'households'>
  readonly textiles: readonly Doc<'textiles'>[]
  readonly busy: ReadonlyMap<Id<'textiles'>, Id<'sessions'>>
}

/** The garments a closet change names: 1 to 200, all of one household the caller belongs to. */
async function closetBatch(ctx: MutationCtx, textileIds: readonly Id<'textiles'>[]): Promise<Batch> {
  const unique = [...new Set(textileIds)]
  if (unique.length === 0 || unique.length > 200) fail('invalid', 'Change between 1 and 200 garments at a time')
  const textiles = await Promise.all(unique.map(async (textileId) => {
    const textile = await ctx.db.get(textileId)
    if (textile === null || textile.trashedAt !== undefined) fail('not_found', 'Not found')
    return textile
  }))
  const householdId = textiles[0]!.householdId
  const actor = (await authorize(ctx, 'textile.edit', { householdId: householdId, uses: { textileIds: unique } })).actor
  if (textiles.some((textile) => textile.householdId !== householdId)) fail('forbidden', 'Forbidden')
  return { actor, householdId, textiles, busy: await busyTextiles(ctx, householdId) }
}

/** Whether a change applies: never to a garment in a running load, only from the given states, and to guests only when allowed. */
function applies(batch: Batch, textile: Doc<'textiles'>, from: readonly TextileStatus[], guests = true): boolean {
  return !batch.busy.has(textile._id) && from.includes(textile.status) && (guests || textile.guest !== true)
}

type TextilePatch = Partial<Omit<Doc<'textiles'>, '_id' | '_creationTime' | 'householdId'>>
type HistoryDetails = NonNullable<Doc<'history'>['details']>

/**
 * Writes one garment's change: `statusSince` whenever its state changes, and exactly one history
 * row unless it is a guest's.
 */
async function change(
  ctx: MutationCtx,
  actor: AuthenticatedPrincipal,
  textile: Doc<'textiles'>,
  patch: TextilePatch,
  event: Doc<'history'>['event'],
  now: number,
  extra: { details?: HistoryDetails; sessionId?: Id<'sessions'> } = {},
): Promise<void> {
  const moved = patch.status !== undefined && patch.status !== textile.status
  await ctx.db.patch(textile._id, { ...patch, ...(moved ? { statusSince: now } : {}) })
  if (textile.guest === true) return
  await ctx.db.insert('history', {
    householdId: textile.householdId,
    ...(extra.sessionId === undefined ? {} : { sessionId: extra.sessionId }),
    textileId: textile._id,
    ownerPrincipalKey: textile.ownerPrincipalKey,
    event,
    occurredAt: now,
    actorPrincipalKey: actor.key,
    ...(extra.details === undefined ? {} : { details: extra.details }),
  })
}

const changedSkipped = v.object({ changed: v.number(), skipped: v.number() })

/** Runs one change over the garments it applies to; the rest are skipped, never refused. */
async function eachGarment(
  batch: Batch,
  from: readonly TextileStatus[],
  guests: boolean,
  apply: (textile: Doc<'textiles'>) => Promise<void>,
): Promise<{ changed: number; skipped: number }> {
  let changed = 0
  for (const textile of batch.textiles) {
    if (!applies(batch, textile, from, guests)) continue
    await apply(textile)
    changed += 1
  }
  return { changed, skipped: batch.textiles.length - changed }
}

function flagKey(flag: Pick<TextileFlag, 'flaggedBy' | 'flaggedAt'>): string {
  return `${flag.flaggedBy}:${flag.flaggedAt}`
}

/**
 * One heads-up to the laundry person for one flag (7.5): only when something is needed by tomorrow or
 * sooner, the laundry person is a current member other than the caller, and that flag has not had one.
 * It names the call's qualifying garments; delivery marks it sent while the flag still stands.
 */
async function headsUp(ctx: MutationCtx, batch: Batch, flagged: readonly { textileId: Id<'textiles'>; flag: TextileFlag }[], now: number): Promise<boolean> {
  const soon = flagged.filter(({ flag }) => flag.neededBy !== undefined && neededSoon(flag.neededBy, now))
  if (soon.length === 0) return false
  const household = await ctx.db.get(batch.householdId)
  if (household === null) return false
  const recipient = laundryPersonKey(household)
  if (recipient === batch.actor.key) return false
  const membership = await ctx.db
    .query('memberships')
    .withIndex('by_household_principal', (q) => q.eq('householdId', batch.householdId).eq('principalKey', recipient))
    .unique()
  if (membership === null) return false
  const fresh: typeof soon = []
  for (const entry of soon) {
    const existing = await ctx.db.query('reminders').withIndex('by_flag_key', (q) => q.eq('householdId', batch.householdId).eq('flagKey', flagKey(entry.flag))).first()
    if (existing === null) fresh.push(entry)
  }
  const first = fresh[0]
  if (first === undefined) return false
  const reminderId = await ctx.db.insert('reminders', {
    householdId: batch.householdId,
    kind: 'urgent_flag',
    recipientPrincipalKey: recipient,
    textileIds: fresh.map((entry) => entry.textileId),
    flaggedBy: first.flag.flaggedBy,
    flagKey: flagKey(first.flag),
    neededBy: first.flag.neededBy!,
    status: 'scheduled',
    dueAt: now,
  })
  const scheduledFunctionId = await ctx.scheduler.runAfter(0, internal.reminders.deliver, { reminderId })
  await ctx.db.patch(reminderId, { scheduledFunctionId })
  return true
}

type StainCheck = NonNullable<Doc<'textiles'>['stainCheck']>
const stainGotWorse = 'This stain got worse. Take it to a cleaner, keep it as a known mark, or retire it'
const stainHadTries = 'This stain has had its tries. Take it to a cleaner, keep it as a known mark, or retire it'

/** Why a stain that stayed gets no home try: it got worse, or the fabric's tries are used up (stainWashLimit has the sources). */
async function noHomeTry(ctx: MutationCtx, textile: Doc<'textiles'>, check: StainCheck): Promise<string | null> {
  if (check.answer === 'worse') return stainGotWorse
  const care = await careOf(ctx, textile._id)
  return check.washes >= stainWashLimit(care?.material, routineWashMethod(textile, care)) ? stainHadTries : null
}

/** The cleaner's note for a stain that stayed: the stain and what was tried, within the note's 120 characters. */
export function cleanerStainNote(check: Pick<StainCheck, 'reason' | 'tried' | 'washes'>): string {
  const stain = stainWords[check.reason as StainReason] ?? stainWords.stain_other
  const names = [...new Set(check.tried.map((entry) => typeof entry === 'string' ? entry : entry.name))]
  const note = `${stain[0]!.toUpperCase()}${stain.slice(1)} stain after ${check.washes === 1 ? '1 wash' : `${check.washes} washes`}.${names.length === 0 ? '' : ` Tried ${names.join(', ')}.`}`
  return note.length <= 120 ? note : `${note.slice(0, 119)}…`
}

/** A stain flagged again keeps what the app already tried on it, as its own records beside anything the person typed. */
function withTried(report: Infer<typeof stainReport> | undefined, check: StainCheck | undefined): Infer<typeof stainReport> | undefined {
  // "Not sure" stays unknown: the app's own records are not every try, so a retry still needs confirming.
  if (report === undefined || check === undefined || check.tried.length === 0 || report.priorTreatmentAttempts === 'unknown') return report
  const all = new Map([...check.tried, ...report.priorTreatmentAttempts].map((entry) => [typeof entry === 'string' ? entry : `${entry.supplyId}:${entry.chemistry ?? ''}:${entry.name}`, entry]))
  return { ...report, priorTreatmentAttempts: [...all.values()] }
}

function stainNoteFrom(value: string | undefined): string | undefined {
  const note = value?.trim()
  if (note === undefined || note.length === 0) return undefined
  if (note.length > 80) fail('invalid', 'The stain note is too long')
  return note
}

/** A date as the web sends it: a local end of day in ms. */
function dateMs(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) fail('invalid', `${field} must be a date`)
  return value
}

/** Legacy wear action: a clean garment stays ready and counts one more wear. */
export const markWorn = mutation({
  args: { textileIds: v.array(v.id('textiles')) },
  returns: changedSkipped,
  handler: async (ctx, args) => {
    const batch = await closetBatch(ctx, args.textileIds)
    const now = Date.now()
    return eachGarment(batch, ['clean'], true, (textile) =>
      change(ctx, batch.actor, textile, { lastWornAt: now, wearsSinceClean: (textile.wearsSinceClean ?? 0) + 1 }, 'worn', now))
  },
})

/**
 * "It's dirty": into the hamper with why, how dirty and when it is needed. Editing an item already in
 * the hamper keeps who flagged it and when. A dry-clean-only garment goes on the dry cleaning list instead.
 */
export const flagDirty = mutation({
  args: {
    textileIds: v.array(v.id('textiles')),
    reasons: v.array(flagReason),
    soilLevel,
    neededBy: v.optional(v.number()),
    stainNote: v.optional(v.string()),
    stainReport: v.optional(stainReport),
    observation: v.optional(laundryObservation),
    clearObservation: v.optional(v.literal(true)),
    /** Reviewing a stain already in the hamper preserves its current scheduling and status. */
    stainOnly: v.optional(v.literal(true)),
  },
  returns: v.object({ changed: v.number(), skipped: v.number(), toDryClean: v.array(v.id('textiles')), alerted: v.boolean() }),
  handler: async (ctx, args) => {
    const batch = await closetBatch(ctx, args.textileIds)
    const now = Date.now()
    const reasons = flagReasons.filter((reason) => args.reasons.includes(reason))
    const stainNote = stainNoteFrom(args.stainNote)
    if (args.stainOnly !== true && args.stainReport !== undefined && !reasons.some((reason) => (stainReasons as readonly string[]).includes(reason))) fail('invalid', 'A stain report needs a stain reason')
    const report = args.stainReport
    if (args.clearObservation && args.observation !== undefined) fail('invalid', 'Choose an observation or clear it, not both')
    const observation = args.observation
    if (observation?.previousWash !== undefined && observation.previousWash.length > 300) fail('invalid', 'Describe the previous wash in 300 characters or fewer')
    const attempts = Array.isArray(report?.priorTreatmentAttempts) ? report.priorTreatmentAttempts : []
    if (attempts.length > 10 || attempts.some((entry) => typeof entry === 'string' && (entry.trim().length === 0 || entry.length > 120))) fail('invalid', 'Describe each prior treatment in 120 characters or fewer')
    // A washed-out treatment is the app's own record: a person can keep one the piece's flag already has, never add one.
    const recorded = attempts.filter((entry) => typeof entry !== 'string')
    const attemptKey = (entry: (typeof attempts)[number]) => typeof entry === 'string' ? entry : `${entry.supplyId}:${entry.chemistry ?? ''}:${entry.name}`
    const keepsRecord = (current: TextileFlag | undefined) => {
      const kept = Array.isArray(current?.stainReport?.priorTreatmentAttempts) ? current.stainReport.priorTreatmentAttempts.map(attemptKey) : []
      if (recorded.some((entry) => !kept.includes(attemptKey(entry)))) fail('invalid', 'Describe earlier treatments in words')
    }
    const neededBy = args.neededBy === undefined ? undefined : dateMs(args.neededBy, 'Needed by')
    const toDryClean: Id<'textiles'>[] = []
    const flagged: { textileId: Id<'textiles'>; flag: TextileFlag }[] = []
    let invalidate = false
    const counts = await eachGarment(batch, args.stainOnly ? ['dirty'] : ['clean', 'dirty', 'needs_refresh'], true, async (textile) => {
      if (args.stainOnly) {
        const current = textile.flag
        if (current === undefined || !current.reasons.some((reason) => (stainReasons as readonly string[]).includes(reason))) fail('invalid', 'This piece no longer has a stain to review')
        keepsRecord(current)
        const { stainNote: _oldNote, stainReport: _oldReport, ...rest } = current
        const reviewed = withTried(report, textile.stainCheck)
        const flag: TextileFlag = { ...rest, ...(args.clearObservation ? { observation: undefined } : observation === undefined ? {} : { observation }), ...(stainNote === undefined ? {} : { stainNote }), ...(reviewed === undefined ? {} : { stainReport: reviewed }) }
        await change(ctx, batch.actor, textile, { flag }, 'flagged', now, { details: { stainReviewed: true } })
        invalidate ||= current.stainNote !== stainNote || JSON.stringify(current.stainReport) !== JSON.stringify(reviewed)
        return
      }
      const wornNow = textile.status === 'clean' && reasons.includes('worn')
      const wear = wornNow ? { lastWornAt: now, wearsSinceClean: (textile.wearsSinceClean ?? 0) + 1 } : {}
      if (routineWashMethod(textile, await careOf(ctx, textile._id)) === 'dry_clean_only') {
        const professional = await professionalDryDetails(ctx, textile._id)
        await change(ctx, batch.actor, textile, { status: 'needs_dry_clean', soilLevel: undefined, flag: undefined, cleanerNote: undefined, ...wear }, 'flagged', now, { details: { route: 'dry_clean', ...professional, reasons: reasons.join(','), ...(wornNow ? { worn: true } : {}) } })
        toDryClean.push(textile._id)
        invalidate ||= textile.soilLevel !== undefined
        return
      }
      const kept = textile.status === 'dirty' ? textile.flag : undefined
      keepsRecord(kept)
      // A stain that stayed after a wash is the same stain: the fabric's home tries and a worse answer still apply.
      const check = reasons.some((reason) => (stainReasons as readonly string[]).includes(reason)) ? textile.stainCheck : undefined
      const refusal = check === undefined ? null : await noHomeTry(ctx, textile, check)
      if (refusal !== null) fail('conflict', `${refusal} from “What next?” on its record`)
      const stained = withTried(report, check)
      const flag: TextileFlag = {
        reasons,
        ...(observation === undefined ? {} : { observation }),
        ...(stainNote === undefined ? {} : { stainNote }),
        ...(stained === undefined ? {} : { stainReport: stained }),
        ...(neededBy === undefined ? {} : { neededBy }),
        flaggedBy: kept?.flaggedBy ?? batch.actor.key,
        flaggedAt: kept?.flaggedAt ?? now,
      }
      await change(ctx, batch.actor, textile, { status: 'dirty', soilLevel: args.soilLevel, flag, ...wear }, 'flagged', now, { details: { reasons: reasons.join(','), soilLevel: args.soilLevel, ...(wornNow ? { worn: true } : {}) } })
      flagged.push({ textileId: textile._id, flag })
      // Soil doses the load, and a stain note holds a garment out of the dryer.
      invalidate ||= textile.soilLevel !== args.soilLevel || textile.flag?.stainNote !== stainNote || JSON.stringify(textile.flag?.stainReport) !== JSON.stringify(stained) || JSON.stringify(textile.flag?.reasons) !== JSON.stringify(reasons)
    })
    if (invalidate) await invalidatePlans(ctx, batch.householdId)
    return { ...counts, toDryClean, alerted: args.stainOnly ? false : await headsUp(ctx, batch, flagged, now) }
  },
})

/**
 * "Try treating it at the next wash": each piece's known mark becomes the stain flag intake would have
 * saved, on the same path as flagDirty (dry-clean routine pieces go to dry cleaning without a flag).
 * Pieces in a running load, in other states, or without a mark are skipped.
 */
export const treatKnownStain = mutation({
  args: { textileIds: v.array(v.id('textiles')) },
  returns: v.object({ changed: v.number(), skipped: v.number(), toDryClean: v.array(v.id('textiles')), alerted: v.boolean() }),
  handler: async (ctx, args) => {
    const batch = await closetBatch(ctx, args.textileIds)
    const now = Date.now()
    const toDryClean: Id<'textiles'>[] = []
    const flagged: { textileId: Id<'textiles'>; flag: TextileFlag }[] = []
    const marked = { ...batch, textiles: batch.textiles.filter((textile) => textile.knownStain !== undefined) }
    const { changed } = await eachGarment(marked, ['clean', 'dirty', 'needs_refresh'], true, async (textile) => {
      const mark = textile.knownStain!
      if (routineWashMethod(textile, await careOf(ctx, textile._id)) === 'dry_clean_only') {
        const professional = await professionalDryDetails(ctx, textile._id)
        await change(ctx, batch.actor, textile, { status: 'needs_dry_clean', soilLevel: undefined, flag: undefined, cleanerNote: undefined, knownStain: undefined }, 'flagged', now, { details: { route: 'dry_clean', ...professional, reasons: mark.reason } })
        toDryClean.push(textile._id)
        return
      }
      const kept = textile.status === 'dirty' ? textile.flag : undefined
      const reasons = flagReasons.filter((reason) => reason === mark.reason || kept?.reasons.includes(reason))
      const soil = textile.soilLevel ?? 'normal'
      const flag: TextileFlag = { ...kept, reasons, stainReport: { kind: mark.kind, priorTreatmentAttempts: 'unknown' }, flaggedBy: kept?.flaggedBy ?? batch.actor.key, flaggedAt: kept?.flaggedAt ?? now }
      await change(ctx, batch.actor, textile, { status: 'dirty', soilLevel: soil, flag, knownStain: undefined }, 'flagged', now, { details: { reasons: reasons.join(','), soilLevel: soil } })
      flagged.push({ textileId: textile._id, flag })
    })
    if (changed > 0) await invalidatePlans(ctx, batch.householdId)
    return { changed, skipped: batch.textiles.length - changed, toDryClean, alerted: await headsUp(ctx, batch, flagged, now) }
  },
})

/** "Remove mark": the known mark is gone from each piece; nothing the planner reads changes. */
export const removeKnownStain = mutation({
  args: { textileIds: v.array(v.id('textiles')) },
  returns: v.object({ changed: v.number() }),
  handler: async (ctx, args) => {
    const { textiles } = await closetBatch(ctx, args.textileIds)
    const marked = textiles.filter((textile) => textile.knownStain !== undefined)
    for (const textile of marked) await ctx.db.patch(textile._id, { knownStain: undefined })
    return { changed: marked.length }
  },
})

/**
 * "Stain gone?" after a wash. Gone ends the check and lets the pieces back into dryer heat, a guest's piece
 * too (it has no check); lighter or still there is kept, so the garment's record offers what to do next once
 * it is dry. `changed` counts the pieces whose check or dryer hold changed.
 */
export const answerStainCheck = mutation({
  args: { textileIds: v.array(v.id('textiles')), answer: v.union(v.literal('gone'), v.literal('lighter'), v.literal('still_there')) },
  returns: v.object({ changed: v.number() }),
  handler: async (ctx, args) => {
    const { householdId, textiles } = await closetBatch(ctx, args.textileIds)
    const checked = textiles.filter((textile) => textile.stainCheck !== undefined)
    const changed = new Set<string>(checked.map((textile) => textile._id))
    for (const textile of checked) {
      // The person's own answer: a check an outcome assessment opened is now theirs.
      const { answer: _answer, openedBy: _openedBy, ...check } = textile.stainCheck!
      await ctx.db.patch(textile._id, args.answer === 'gone' ? { stainCheck: undefined, stainCleared: check } : { stainCheck: { ...check, answer: args.answer } })
    }
    if (args.answer === 'gone') {
      const ids = new Set<string>(textiles.map((textile) => textile._id))
      const held = await ctx.db.query('dryingPieces').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect()
      for (const piece of held) if (piece.stained === true && ids.has(piece.textileId)) {
        await ctx.db.patch(piece._id, { stained: undefined })
        changed.add(piece.textileId)
      }
      // An open check holds the piece out of dryer heat in a plan too.
      if (checked.length > 0) await invalidatePlans(ctx, householdId)
    }
    return { changed: changed.size }
  },
})

/**
 * When a stain stayed: one more sourced try (back to the hamper with what was already tried), the
 * cleaner (with the stain and what was tried kept as its note), or keep it as a known mark. Retiring
 * the garment is the closet's own remove. Pieces still drying or in a running load are skipped.
 */
export const resolveStain = mutation({
  args: { textileIds: v.array(v.id('textiles')), choice: v.union(v.literal('try_again'), v.literal('cleaner'), v.literal('keep')) },
  returns: changedSkipped,
  handler: async (ctx, args) => {
    const batch = await closetBatch(ctx, args.textileIds)
    const now = Date.now()
    const open = { ...batch, textiles: batch.textiles.filter((textile) => textile.stainCheck?.answer !== undefined) }
    // The fabric sets how many home tries a stain gets (stainWashLimit has the sources); one that got worse gets none.
    if (args.choice === 'try_again') for (const textile of open.textiles) {
      const refusal = await noHomeTry(ctx, textile, textile.stainCheck!)
      if (refusal !== null) fail('conflict', refusal)
    }
    const flagged: { textileId: Id<'textiles'>; flag: TextileFlag }[] = []
    const counts = await eachGarment(open, ['clean', 'dirty', 'needs_refresh'], true, async (textile) => {
      const check = textile.stainCheck!
      if (args.choice === 'keep') {
        await ctx.db.patch(textile._id, { stainCheck: undefined, knownStain: { reason: check.reason, kind: check.kind, recordedAt: now } })
        return
      }
      if (args.choice === 'cleaner') {
        await change(ctx, batch.actor, textile, { status: 'needs_dry_clean', soilLevel: undefined, flag: undefined, cleanerNote: cleanerStainNote(check), stainCheck: (({ openedBy: _openedBy, ...owned }) => owned)(check) }, 'flagged', now, { details: { route: 'dry_clean', reasons: check.reason } })
        return
      }
      const flag: TextileFlag = { reasons: [check.reason], stainReport: { kind: check.kind, priorTreatmentAttempts: check.tried.length > 0 ? check.tried : 'unknown' }, flaggedBy: batch.actor.key, flaggedAt: now }
      const { answer: _answer, openedBy: _openedBy, ...retried } = check
      await change(ctx, batch.actor, textile, { status: 'dirty', soilLevel: textile.soilLevel ?? 'normal', flag, stainCheck: retried }, 'flagged', now, { details: { reasons: check.reason, soilLevel: textile.soilLevel ?? 'normal' } })
      flagged.push({ textileId: textile._id, flag })
    })
    if (counts.changed > 0) await invalidatePlans(ctx, batch.householdId)
    if (flagged.length > 0) await headsUp(ctx, batch, flagged, now)
    return counts
  },
})

/** "Need it {day}" on something in the hamper, or clearing it with `null`. */
export const setNeededBy = mutation({
  args: { textileIds: v.array(v.id('textiles')), neededBy: v.union(v.number(), v.null()) },
  returns: v.object({ changed: v.number(), skipped: v.number(), alerted: v.boolean() }),
  handler: async (ctx, args) => {
    const batch = await closetBatch(ctx, args.textileIds)
    const now = Date.now()
    const neededBy = args.neededBy === null ? null : dateMs(args.neededBy, 'Needed by')
    const flagged: { textileId: Id<'textiles'>; flag: TextileFlag }[] = []
    const counts = await eachGarment(batch, ['dirty'], true, async (textile) => {
      const { neededBy: _previous, ...current } = textile.flag ?? { reasons: [], flaggedBy: batch.actor.key, flaggedAt: now }
      const flag: TextileFlag = { ...current, ...(neededBy === null ? {} : { neededBy }) }
      // A cleared date is recorded as `false`: history details hold no nulls.
      await change(ctx, batch.actor, textile, { flag }, 'flagged', now, { details: { neededBy: neededBy ?? false } })
      flagged.push({ textileId: textile._id, flag })
    })
    return { ...counts, alerted: await headsUp(ctx, batch, flagged, now) }
  },
})

/** Remove a pending care need and return the garment to Ready without counting a wash. */
export const unflag = mutation({
  args: { textileIds: v.array(v.id('textiles')) },
  returns: changedSkipped,
  handler: async (ctx, args) => {
    const batch = await closetBatch(ctx, args.textileIds)
    const now = Date.now()
    let soilCleared = false
    const counts = await eachGarment(batch, ['dirty', 'needs_refresh', 'needs_dry_clean'], false, async (textile) => {
      await change(ctx, batch.actor, textile, { status: 'clean', soilLevel: undefined, flag: undefined, cleanerNote: undefined }, 'flagged', now, { details: { unflagged: true } })
      soilCleared ||= textile.soilLevel !== undefined
    })
    if (soilCleared) await invalidatePlans(ctx, batch.householdId)
    return counts
  },
})

/** "Washed it another way": by hand or somewhere else. It counts as a wash. */
export const washedElsewhere = mutation({
  args: { textileIds: v.array(v.id('textiles')), method: v.union(v.literal('hand'), v.literal('elsewhere')) },
  returns: changedSkipped,
  handler: async (ctx, args) => {
    const batch = await closetBatch(ctx, args.textileIds)
    const now = Date.now()
    const counts = await eachGarment(batch, ['dirty'], false, (textile) => change(ctx, batch.actor, textile, {
      status: 'clean',
      soilLevel: undefined,
      flag: undefined,
      wearsSinceClean: undefined,
      lastCleanedAt: now,
      washCount: textile.washCount + 1,
      firstWash: false,
      ...(textile.dyeRun === 'new' ? { dyeRun: 'unknown' as const } : {}),
    }, 'washed', now, { details: { method: args.method } }))
    // A garment that is no longer a first wash changes colour planning.
    if (counts.changed > 0) await invalidatePlans(ctx, batch.householdId)
    return counts
  },
})

/** A handoff preserves specialist wording without prescribing a solvent or home process. */
async function professionalDryDetails(ctx: MutationCtx, textileId: Id<'textiles'>) {
  const care = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textileId)).unique()
  const instructions = care?.instructions
  const professional = instructions?.professionalDry
  if (professional?.permission === 'not_allowed') fail('invalid', 'The recorded label prohibits professional dry cleaning')
  if (instructions === undefined || professional === undefined) return {}
  return { professionalCareRoute: 'professional_dry', professionalCareSource: instructions.source,
    professionalCareRevision: careInstructionRevision(instructions), professionalCarePermission: professional.permission, professionalCareWording: professional.wording,
    ...(instructions.symbolSystem === undefined ? {} : { professionalCareSymbolSystem: instructions.symbolSystem }),
  }
}

/** "Move to dry cleaning". */
export const moveToDryCleaning = mutation({
  args: { textileIds: v.array(v.id('textiles')) },
  returns: changedSkipped,
  handler: async (ctx, args) => {
    const batch = await closetBatch(ctx, args.textileIds)
    const now = Date.now()
    let soilCleared = false
    const counts = await eachGarment(batch, ['clean', 'dirty'], false, async (textile) => {
      const professional = await professionalDryDetails(ctx, textile._id)
      await change(ctx, batch.actor, textile, { status: 'needs_dry_clean', soilLevel: undefined, flag: undefined, cleanerNote: undefined }, 'flagged', now, { details: { route: 'dry_clean', ...professional } })
      soilCleared ||= textile.soilLevel !== undefined
    })
    if (soilCleared) await invalidatePlans(ctx, batch.householdId)
    return counts
  },
})

// Negative wording can veto a recorded permission; prose never grants one.
const noSteamPattern = /\b(?:do not|must not|never|don't|don’t)\s+(?:iron|steam)\b|\bno\s+(?:steam|ironing)\b/i

/** A need can be recorded regardless of which refresh methods the tag allows. */
export const setRefresh = mutation({
  args: { textileIds: v.array(v.id('textiles')), reason: v.optional(v.union(v.literal('wrinkles'), v.literal('odor'), v.literal('stored_long'))) },
  returns: changedSkipped,
  handler: async (ctx, args) => {
    const batch = await closetBatch(ctx, args.textileIds)
    const now = Date.now()
    return eachGarment(batch, ['clean'], true, (textile) =>
      change(ctx, batch.actor, textile, { status: 'needs_refresh' }, 'flagged', now, { details: { route: 'refresh', ...(args.reason === undefined ? {} : { reason: args.reason }) } }))
  },
})

/** Record how the garment was refreshed before returning it to ready. */
export const refreshed = mutation({
  args: { textileIds: v.array(v.id('textiles')), method: v.union(v.literal('air_out'), v.literal('steam')) },
  returns: changedSkipped,
  handler: async (ctx, args) => {
    const batch = await closetBatch(ctx, args.textileIds)
    const now = Date.now()
    if (args.method === 'steam') for (const textile of batch.textiles) {
      if (!applies(batch, textile, ['needs_refresh'])) continue
      const care = await careOf(ctx, textile._id)
      if (care?.steamPermission !== 'allowed' || care.ironSteam === 'not_allowed' || care.restrictions.some((restriction) => noSteamPattern.test(restriction))) fail('invalid', 'The tag must explicitly allow steam')
      if ((care.instructions?.ironing.length ?? 0) > 0) fail('invalid', 'Review the additional ironing and surface instructions before steam refresh; this route does not establish their compatibility')
    }
    return eachGarment(batch, ['needs_refresh'], true, async (textile) => {
      const latestRefresh = await ctx.db.query('history').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).order('desc').collect()
      const reason = latestRefresh.find((event) => event.occurredAt >= since(textile) && event.event === 'flagged' && event.details?.route === 'refresh')?.details?.reason
      await change(ctx, batch.actor, textile, { status: 'clean' }, 'refreshed', now, { details: { method: args.method, ...(typeof reason === 'string' ? { reason } : {}) } })
    })
  },
})

/** "Dropped off" at the cleaner, with an optional note and pick-up date. Without a note, the one it has (a stain's) is kept; an empty note clears it. */
export const droppedAtCleaner = mutation({
  args: { textileIds: v.array(v.id('textiles')), note: v.optional(v.string()), pickupBy: v.optional(v.number()) },
  returns: changedSkipped,
  handler: async (ctx, args) => {
    const batch = await closetBatch(ctx, args.textileIds)
    const now = Date.now()
    const note = args.note?.trim()
    if (note !== undefined && note.length > 120) fail('invalid', 'The note is too long')
    const pickupBy = args.pickupBy === undefined ? undefined : dateMs(args.pickupBy, 'Pick up by')
    return eachGarment(batch, ['needs_dry_clean'], true, async (textile) => {
      const professional = await professionalDryDetails(ctx, textile._id)
      await change(ctx, batch.actor, textile, {
        status: 'at_cleaner',
        cleanerNote: note === undefined ? textile.cleanerNote : note.length === 0 ? undefined : note,
        cleanerPickupBy: pickupBy,
      }, 'dropped_at_cleaner', now, { details: Object.keys(professional).length === 0 ? undefined : professional })
    })
  },
})

/** "Picked up" from the cleaner: ready, and cleaned. A stain the cleaner treated is asked about again ("Stain gone?"). */
export const pickedUp = mutation({
  args: { textileIds: v.array(v.id('textiles')) },
  returns: changedSkipped,
  handler: async (ctx, args) => {
    const batch = await closetBatch(ctx, args.textileIds)
    const now = Date.now()
    return eachGarment(batch, ['at_cleaner'], true, (textile) => change(ctx, batch.actor, textile, {
      status: 'clean',
      ...(textile.stainCheck === undefined ? {} : { stainCheck: (({ answer: _answer, openedBy: _openedBy, ...check }) => check)(textile.stainCheck) }),
      cleanerNote: undefined,
      cleanerPickupBy: undefined,
      wearsSinceClean: 0,
      lastCleanedAt: now,
    }, 'picked_up', now))
  },
})

/** "All dry": one tap for a finished load. Only a person clears hanging; nothing is ever scheduled. */
export const allDry = mutation({
  args: { sessionId: v.id('sessions') },
  returns: v.object({ changed: v.number() }),
  handler: async (ctx, args) => {
    const { session, actor } = await authorize(ctx, 'session.run', { sessionId: args.sessionId })
    if (session.status !== 'completed') return { changed: 0 }
    const now = Date.now()
    let changed = 0
    for (const textileId of session.textileIds) {
      const textile = await ctx.db.get(textileId)
      if (textile === null || textile.householdId !== session.householdId || textile.status !== 'hanging') continue
      await change(ctx, actor, textile, { status: 'clean' }, 'dried', now, { sessionId: session._id })
      changed += 1
    }
    if (changed > 0) await completeGuidance(ctx, session.householdId, actor.key, now)
    return { changed }
  },
})

/** A guest's garment named by its kind when no name was typed: the Add clothes grid's words. */
const kindWords: Record<GarmentKind, string> = {
  t_shirt: 't-shirt', shirt: 'shirt or blouse', sweater: 'sweater', pants: 'jeans or pants', shorts: 'shorts', skirt: 'skirt',
  dress: 'dress', outerwear: 'jacket or coat', suit: 'suit or blazer', pajamas: 'pajamas', underwear: 'underwear', socks: 'socks',
  workout: 'workout clothes', baby_bodysuit: 'baby bodysuit', towel: 'towel', sheets: 'sheets', other: 'other',
}

/**
 * Wash now: the picked garments go in the hamper as they are, and a guest's clothes are added for this
 * load only. Whoever taps this is washing now, so it never sends a heads-up. Returns the selection
 * for `plans.recompute` in rush mode.
 */
export const washNow = mutation({
  args: {
    householdId: v.id('households'),
    textileIds: v.array(v.id('textiles')),
    soilLevel,
    guests: v.array(v.object({
      name: v.optional(v.string()),
      kind: garmentKind,
      colorGroup,
      tag: v.optional(tagAnswers),
      machineOk: v.optional(v.literal(true)),
    })),
  },
  returns: v.object({ selection: v.array(v.id('textiles')) }),
  handler: async (ctx, args) => {
    const actor = (await authorize(ctx, 'session.run', { householdId: args.householdId })).actor
    const picked = [...new Set(args.textileIds)]
    if (args.guests.length > 20) fail('invalid', 'Add at most 20 guest items at a time')
    if (picked.length + args.guests.length === 0 || picked.length > 200) fail('invalid', 'Pick between 1 and 200 laundry items to wash')
    const guestCare = args.guests.map((guest) => {
      if ((guest.tag === undefined) === (guest.machineOk === undefined)) fail('invalid', 'Answer the tag, or whether it is OK in the washing machine')
      if (guest.tag !== undefined && guest.tag.washMethod !== 'machine') fail('invalid', 'A guest\'s item that can\'t be machine washed is not added')
      const name = guest.name?.trim()
      if (name !== undefined && name.length > 60) fail('invalid', 'The name is too long')
      return { guest, name: name === undefined || name.length === 0 ? `Guest's ${kindWords[guest.kind]}` : name }
    })
    const now = Date.now()
    const selection: Id<'textiles'>[] = []
    if (picked.length > 0) {
      const batch = await closetBatch(ctx, picked)
      if (batch.householdId !== args.householdId) fail('forbidden', 'Forbidden')
      for (const textile of batch.textiles) {
        if (batch.busy.has(textile._id)) fail('invalid', `${textile.name} is already in the wash`)
        if (textile.status === 'dirty') continue
        if (textile.status !== 'clean' && textile.status !== 'needs_refresh') fail('invalid', `${textile.name} can't be washed now`)
        const flag: TextileFlag = { reasons: [], flaggedBy: actor.key, flaggedAt: now }
        await change(ctx, actor, textile, { status: 'dirty', soilLevel: args.soilLevel, flag }, 'flagged', now, { details: { washNow: true } })
      }
      selection.push(...batch.textiles.map((textile) => textile._id).sort())
    }
    if (guestCare.length > 0) {
      const collectionId = await wardrobeFor(ctx, args.householdId, actor.key)
      for (const { guest, name } of guestCare) {
        const textileId = await ctx.db.insert('textiles', {
          householdId: args.householdId,
          collectionId,
          ownerPrincipalKey: actor.key,
          name,
          kind: guest.kind,
          colorGroup: guest.colorGroup,
          status: 'dirty',
          soilLevel: args.soilLevel,
          washCount: 0,
          guest: true,
          statusSince: now,
          createdAt: now,
        })
        const textile = (await ctx.db.get(textileId))!
        if (guest.tag !== undefined) await writeCare(ctx, textile, tagCare(guest.tag), tagEvidence)
        else await writeCare(ctx, textile, { washMethod: 'machine', cycle: 'delicate', maxTemperatureC: 30, dryMethod: 'line_dry', restrictions: [] }, { source: 'guest_answer', confidence: 'observed' })
        selection.push(textileId)
      }
    }
    await invalidatePlans(ctx, args.householdId)
    return { selection }
  },
})
