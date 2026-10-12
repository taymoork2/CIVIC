import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { startLoad, addDryer, intakeHousehold, joinHousehold, keyOf, newBackend, planFor, signedIn, washLoad, type Backend, type Caller } from './harness.testing'

const start = Date.UTC(2026, 8, 1, 12)
const hour = 3_600_000
const day = 24 * hour

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(start)
})
afterEach(() => { vi.useRealTimers() })

/** The intake household (a dirty tee, towel and sweater, a detergent, a washer) with Sam as a second member. */
async function closetHome(t: Backend) {
  const owner = signedIn(t, 'closet-owner')
  const home = await intakeHousehold(owner)
  const sam = await joinHousehold(t, owner, home.householdId, 'closet-sam', 'Sam')
  return { owner, sam, ownerKey: await keyOf(owner), samKey: await keyOf(sam), ...home }
}

/** One garment saved as Ready from Add clothes. */
async function readyGarment(as: Caller, householdId: Id<'households'>, name: string, extra: Record<string, unknown> = {}): Promise<Id<'textiles'>> {
  return (await as.mutation(api.inventory.createTextiles, { householdId, name, quantity: 1, status: 'clean', ...extra }))[0]!
}

const garment = (t: Backend, textileId: Id<'textiles'>) => t.run((ctx) => ctx.db.get(textileId))
const events = (t: Backend, textileId: Id<'textiles'>) => t.run(async (ctx) =>
  (await ctx.db.query('history').withIndex('by_textile', (q) => q.eq('textileId', textileId)).collect()).map((row) => [row.event, row.details ?? null]))
const reminders = (t: Backend) => t.run((ctx) => ctx.db.query('reminders').collect())
const attention = (as: Caller, householdId: Id<'households'>) => as.query(api.closet.attention, { householdId, now: Date.now() })

test('stain inspection preserves current hamper metadata and does not send another heads-up', async () => {
  const t = newBackend()
  const { owner, sam, shirt, towel } = await closetHome(t)
  await owner.mutation(api.closet.flagDirty, { textileIds: [shirt], reasons: ['food', 'worn'], soilLevel: 'heavy', neededBy: start + day, stainReport: { kind: 'protein', priorTreatmentAttempts: [] } })
  const before = (await garment(t, shirt))!
  // Another device changed the deadline and soil while the inspection form was open.
  await t.run((ctx) => ctx.db.patch(shirt, { soilLevel: 'light', flag: { ...before.flag!, neededBy: start + 5 * day } }))
  const args = { textileIds: [shirt], reasons: ['food'] as const, soilLevel: 'heavy' as const, neededBy: start + day, stainOnly: true as const, stainNote: 'Collar', stainReport: { kind: 'tannin' as const, priorTreatmentAttempts: [] } }
  await expect(sam.mutation(api.closet.flagDirty, { ...args, reasons: [...args.reasons] })).resolves.toEqual({ changed: 1, skipped: 0, toDryClean: [], alerted: false })
  expect(await garment(t, shirt)).toMatchObject({ status: 'dirty', statusSince: before.statusSince, soilLevel: 'light', flag: {
    reasons: before.flag!.reasons, neededBy: start + 5 * day, flaggedBy: before.flag!.flaggedBy, flaggedAt: before.flag!.flaggedAt,
    stainNote: 'Collar', stainReport: { kind: 'tannin', priorTreatmentAttempts: [] },
  } })
  await owner.mutation(api.closet.unflag, { textileIds: [shirt] })
  await expect(owner.mutation(api.closet.flagDirty, { ...args, reasons: [...args.reasons] })).resolves.toMatchObject({ changed: 0, skipped: 1 })
  expect((await garment(t, shirt))!.status).toBe('clean')
  await expect(owner.mutation(api.closet.flagDirty, { ...args, reasons: [...args.reasons], textileIds: [towel] })).rejects.toThrow('no longer has a stain')
  const outsider = signedIn(t, 'inspection-outsider')
  await intakeHousehold(outsider)
  await expect(outsider.mutation(api.closet.flagDirty, { ...args, reasons: [...args.reasons] })).rejects.toThrow('Forbidden')
})

test('every closet transition changes only the states it names, stamps statusSince, and writes one history row', async () => {
  const t = newBackend()
  const { owner, sam, ownerKey, householdId } = await closetHome(t)
  const jeans = await readyGarment(owner, householdId, 'Jeans', { kind: 'pants' })
  const blazer = await readyGarment(owner, householdId, 'Blazer', { kind: 'suit', tag: { washMethod: 'dry_clean_only' } })
  const at = (hours: number) => vi.setSystemTime(start + hours * hour)

  at(1)
  await expect(owner.mutation(api.closet.markWorn, { textileIds: [jeans] })).resolves.toEqual({ changed: 1, skipped: 0 })
  await owner.mutation(api.closet.markWorn, { textileIds: [jeans] })
  expect(await garment(t, jeans)).toMatchObject({ status: 'clean', wearsSinceClean: 2, lastWornAt: start + hour, statusSince: start })

  at(2)
  await expect(owner.mutation(api.closet.flagDirty, { textileIds: [jeans], reasons: ['mud_grass', 'food', 'food'], soilLevel: 'heavy', stainNote: ' Left knee ' }))
    .resolves.toEqual({ changed: 1, skipped: 0, toDryClean: [], alerted: false })
  expect(await garment(t, jeans)).toMatchObject({
    status: 'dirty',
    soilLevel: 'heavy',
    statusSince: start + 2 * hour,
    flag: { reasons: ['food', 'mud_grass'], stainNote: 'Left knee', flaggedBy: ownerKey, flaggedAt: start + 2 * hour },
  })
  // Only a clean garment is worn; the rest of a batch is skipped, not refused.
  await expect(owner.mutation(api.closet.markWorn, { textileIds: [jeans] })).resolves.toEqual({ changed: 0, skipped: 1 })

  // Changing how dirty keeps who flagged it and when, and the time it went in the hamper.
  at(3)
  await sam.mutation(api.closet.flagDirty, { textileIds: [jeans], reasons: ['sweat'], soilLevel: 'normal' })
  expect(await garment(t, jeans)).toMatchObject({ soilLevel: 'normal', statusSince: start + 2 * hour, flag: { reasons: ['sweat'], flaggedBy: ownerKey, flaggedAt: start + 2 * hour } })
  expect((await garment(t, jeans))!.flag!.stainNote).toBeUndefined()

  await expect(owner.mutation(api.closet.unflag, { textileIds: [jeans] })).resolves.toEqual({ changed: 1, skipped: 0 })
  expect(await garment(t, jeans)).toMatchObject({ status: 'clean', statusSince: start + 3 * hour })
  expect(await garment(t, jeans)).not.toHaveProperty('flag')
  expect(await garment(t, jeans)).not.toHaveProperty('soilLevel')
  expect(await garment(t, jeans)).not.toHaveProperty('lastCleanedAt')

  at(4)
  await owner.mutation(api.closet.flagDirty, { textileIds: [jeans], reasons: ['worn'], soilLevel: 'light' })
  expect(await garment(t, jeans)).toMatchObject({ wearsSinceClean: 3, lastWornAt: start + 4 * hour })
  await expect(owner.mutation(api.closet.washedElsewhere, { textileIds: [jeans], method: 'hand' })).resolves.toEqual({ changed: 1, skipped: 0 })
  const washed = (await garment(t, jeans))!
  expect(washed).toMatchObject({ status: 'clean', washCount: 1, firstWash: false, lastCleanedAt: start + 4 * hour })
  expect(washed.flag).toBeUndefined()
  expect(washed.wearsSinceClean).toBeUndefined()

  await owner.mutation(api.closet.moveToDryCleaning, { textileIds: [jeans] })
  expect(await garment(t, jeans)).toMatchObject({ status: 'needs_dry_clean' })
  await expect(owner.mutation(api.closet.pickedUp, { textileIds: [jeans] })).resolves.toEqual({ changed: 0, skipped: 1 })
  await owner.mutation(api.closet.droppedAtCleaner, { textileIds: [jeans], note: 'Tell them about the stain', pickupBy: start + 3 * day })
  expect(await garment(t, jeans)).toMatchObject({ status: 'at_cleaner', cleanerNote: 'Tell them about the stain', cleanerPickupBy: start + 3 * day })
  at(5)
  await owner.mutation(api.closet.pickedUp, { textileIds: [jeans] })
  const back = (await garment(t, jeans))!
  expect(back).toMatchObject({ status: 'clean', wearsSinceClean: 0, lastCleanedAt: start + 5 * hour })
  expect(back.cleanerNote).toBeUndefined()
  expect(back.cleanerPickupBy).toBeUndefined()

  await owner.mutation(api.closet.setRefresh, { textileIds: [jeans], reason: 'wrinkles' })
  expect(await garment(t, jeans)).toMatchObject({ status: 'needs_refresh' })
  await owner.mutation(api.closet.refreshed, { textileIds: [jeans], method: 'air_out' })
  expect(await garment(t, jeans)).toMatchObject({ status: 'clean', wearsSinceClean: 0 })
  // "Wash it instead" flags a garment that needs a refresh.
  await owner.mutation(api.closet.setRefresh, { textileIds: [jeans] })
  await owner.mutation(api.closet.flagDirty, { textileIds: [jeans], reasons: [], soilLevel: 'normal' })
  expect(await garment(t, jeans)).toMatchObject({ status: 'dirty', soilLevel: 'normal' })

  expect(await events(t, jeans)).toEqual([
    ['worn', null], ['worn', null],
    ['flagged', { reasons: 'food,mud_grass', soilLevel: 'heavy' }], ['flagged', { reasons: 'sweat', soilLevel: 'normal' }], ['flagged', { unflagged: true }],
    ['flagged', { reasons: 'worn', soilLevel: 'light', worn: true }], ['washed', { method: 'hand' }],
    ['flagged', { route: 'dry_clean' }], ['dropped_at_cleaner', null], ['picked_up', null],
    ['flagged', { route: 'refresh', reason: 'wrinkles' }], ['refreshed', { method: 'air_out', reason: 'wrinkles' }],
    ['flagged', { route: 'refresh' }], ['flagged', { reasons: '', soilLevel: 'normal' }],
  ])

  // A dry-clean-only garment goes on the dry cleaning list, with no soil or flag.
  await expect(owner.mutation(api.closet.flagDirty, { textileIds: [blazer], reasons: ['food'], soilLevel: 'heavy' }))
    .resolves.toMatchObject({ changed: 1, toDryClean: [blazer] })
  const routed = (await garment(t, blazer))!
  expect(routed.status).toBe('needs_dry_clean')
  expect(routed.flag).toBeUndefined()
  expect(routed.soilLevel).toBeUndefined()
  expect(await events(t, blazer)).toEqual([['flagged', { route: 'dry_clean', reasons: 'food' }]])
})

test('a worn care need records one wear and can be removed before care begins', async () => {
  const t = newBackend()
  const { owner, householdId } = await closetHome(t)
  const shirt = await readyGarment(owner, householdId, 'Shirt', { kind: 'shirt' })

  await owner.mutation(api.closet.flagDirty, { textileIds: [shirt], reasons: ['worn'], soilLevel: 'light' })
  expect(await garment(t, shirt)).toMatchObject({ status: 'dirty', wearsSinceClean: 1, flag: { reasons: ['worn'] } })
  await owner.mutation(api.closet.flagDirty, { textileIds: [shirt], reasons: ['worn', 'food'], soilLevel: 'heavy' })
  expect(await garment(t, shirt)).toMatchObject({ wearsSinceClean: 1, flag: { reasons: ['worn', 'food'] } })
  await owner.mutation(api.closet.unflag, { textileIds: [shirt] })
  expect(await garment(t, shirt)).toMatchObject({ status: 'clean', wearsSinceClean: 1 })

  await owner.mutation(api.closet.setRefresh, { textileIds: [shirt], reason: 'wrinkles' })
  await owner.mutation(api.closet.unflag, { textileIds: [shirt] })
  expect(await garment(t, shirt)).toMatchObject({ status: 'clean' })

  await owner.mutation(api.closet.moveToDryCleaning, { textileIds: [shirt] })
  await owner.mutation(api.closet.unflag, { textileIds: [shirt] })
  expect(await garment(t, shirt)).toMatchObject({ status: 'clean' })
})

test('closet changes skip garments in a running load, and guests where the change is not theirs', async () => {
  const t = newBackend()
  const { owner, householdId, shirt, towel } = await closetHome(t)
  const planned = await planFor(owner, householdId, [shirt])
  await startLoad(owner, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'busy' })
  const { selection } = await owner.mutation(api.closet.washNow, { householdId, textileIds: [], soilLevel: 'normal', guests: [{ name: "Alex's shirt", kind: 'shirt', colorGroup: 'light', machineOk: true }] })
  const guest = selection[0]!

  await expect(owner.mutation(api.closet.unflag, { textileIds: [shirt, towel, guest] })).resolves.toEqual({ changed: 1, skipped: 2 })
  expect((await garment(t, shirt))!.status).toBe('dirty')
  expect((await garment(t, guest))!.status).toBe('dirty')
  await expect(owner.mutation(api.closet.washedElsewhere, { textileIds: [guest], method: 'elsewhere' })).resolves.toEqual({ changed: 0, skipped: 1 })
  await expect(owner.mutation(api.closet.moveToDryCleaning, { textileIds: [guest, shirt] })).resolves.toEqual({ changed: 0, skipped: 2 })
  await expect(owner.mutation(api.closet.flagDirty, { textileIds: [shirt], reasons: ['wet'], soilLevel: 'heavy' })).resolves.toMatchObject({ changed: 0, skipped: 1 })
  expect(await events(t, guest)).toEqual([])

  await expect(owner.mutation(api.closet.markWorn, { textileIds: [] })).rejects.toThrow('between 1 and 200')
  const other = signedIn(t, 'closet-outsider')
  await intakeHousehold(other)
  await expect(other.mutation(api.closet.markWorn, { textileIds: [towel] })).rejects.toThrow('Forbidden')
  await expect(other.query(api.closet.today, { householdId })).rejects.toThrow('Forbidden')
})

test('a refresh need is always recorded, while steam requires explicit tag permission', async () => {
  const t = newBackend()
  const { owner, householdId } = await closetHome(t)
  const noSteam = await readyGarment(owner, householdId, 'Silk top', { tag: { washMethod: 'hand_wash', ironSteam: 'not_allowed' } })
  const legacy = await readyGarment(owner, householdId, 'Old shirt')
  await owner.mutation(api.inventory.setCare, { textileId: legacy, washMethod: 'machine', cycle: 'normal', restrictions: ['Do not iron'], provenance: { source: 'care label', confidence: 'verified' } })
  const unknown = await readyGarment(owner, householdId, 'Tee', { tag: { washMethod: 'machine', cycle: 'normal' } })
  const ironOnly = await readyGarment(owner, householdId, 'Iron only', { tag: { washMethod: 'machine', cycle: 'normal', ironSteam: 'allowed', ironHeat: 'low' } })
  const steam = await readyGarment(owner, householdId, 'Steam allowed', { tag: { washMethod: 'machine', cycle: 'normal', steamPermission: 'allowed' } })
  await owner.mutation(api.closet.setRefresh, { textileIds: [ironOnly, steam] })
  await expect(owner.mutation(api.closet.refreshed, { textileIds: [ironOnly], method: 'steam' })).rejects.toThrow('explicitly allow steam')
  await expect(owner.mutation(api.closet.refreshed, { textileIds: [steam], method: 'steam' })).resolves.toEqual({ changed: 1, skipped: 0 })

  await expect(owner.mutation(api.closet.setRefresh, { textileIds: [noSteam, unknown, legacy], reason: 'odor' })).resolves.toEqual({ changed: 3, skipped: 0 })
  await expect(owner.mutation(api.closet.refreshed, { textileIds: [noSteam], method: 'steam' })).rejects.toThrow('explicitly allow steam')
  await expect(owner.mutation(api.closet.refreshed, { textileIds: [unknown], method: 'steam' })).rejects.toThrow('explicitly allow steam')
  await expect(owner.mutation(api.closet.refreshed, { textileIds: [legacy], method: 'steam' })).rejects.toThrow('explicitly allow steam')
  await expect(owner.mutation(api.closet.refreshed, { textileIds: [noSteam], method: 'air_out' })).resolves.toEqual({ changed: 1, skipped: 0 })
})

test('explicit steam permission cannot cancel negative wording on a protected surface', async () => {
  const t = newBackend()
  const { owner, householdId } = await closetHome(t)
  for (const restriction of ['Do not steam', 'Never steam the decoration', 'Do not iron print', 'No steam', 'Must not steam', 'Don’t steam']) {
    const shirt = await readyGarment(owner, householdId, restriction, { tag: { washMethod: 'machine', cycle: 'normal', steamPermission: 'allowed' } })
    await owner.mutation(api.inventory.setCare, { textileId: shirt, washMethod: 'machine', cycle: 'normal', restrictions: [restriction], provenance: { source: 'Synthetic label', confidence: 'verified' } })
    await owner.mutation(api.closet.setRefresh, { textileIds: [shirt] })
    await expect(owner.mutation(api.closet.refreshed, { textileIds: [shirt], method: 'steam' })).rejects.toThrow('explicitly allow steam')
    expect((await garment(t, shirt))?.status).toBe('needs_refresh')
    await owner.mutation(api.closet.refreshed, { textileIds: [shirt], method: 'air_out' })
  }
})

test('professional prohibition guards shortcut routing and drop-off; handoffs retain exact independent facts', async () => {
  const t = newBackend()
  const { owner, householdId } = await closetHome(t)
  const blazer = await readyGarment(owner, householdId, 'Synthetic blazer', { tag: { washMethod: 'dry_clean_only' } })
  const instructions = { source: 'Synthetic sewn label', symbolSystem: 'Test symbol system', preparation: [], washing: [], beforeDrying: [], drying: [], afterDrying: [], ironing: [],
    professionalDry: { permission: 'allowed' as const, wording: 'Professional dry clean, mild process; recorded solvent restriction' },
    professionalWet: { permission: 'not_allowed' as const, wording: 'Do not professionally wet clean' },
  }
  const prohibited = { ...instructions, professionalDry: { permission: 'not_allowed' as const, wording: 'Do not professionally dry clean' } }
  await owner.mutation(api.inventory.setCareInstructions, { textileId: blazer, instructions: prohibited, expectedInstructions: null })
  await expect(owner.mutation(api.closet.flagDirty, { textileIds: [blazer], reasons: ['food'], soilLevel: 'normal' })).rejects.toThrow('prohibits professional dry cleaning')
  expect((await garment(t, blazer))?.status).toBe('clean')
  await owner.mutation(api.inventory.setCareInstructions, { textileId: blazer, instructions, expectedInstructions: prohibited })
  await owner.mutation(api.closet.flagDirty, { textileIds: [blazer], reasons: ['food'], soilLevel: 'normal' })
  const routed = await events(t, blazer)
  expect(routed[0]![1]).toMatchObject({ professionalCareSource: instructions.source, professionalCareWording: instructions.professionalDry.wording, professionalCarePermission: 'allowed', professionalCareSymbolSystem: instructions.symbolSystem })
  await owner.mutation(api.inventory.setCareInstructions, { textileId: blazer, instructions: prohibited, expectedInstructions: instructions })
  await expect(owner.mutation(api.closet.droppedAtCleaner, { textileIds: [blazer] })).rejects.toThrow('prohibits professional dry cleaning')
  expect((await garment(t, blazer))?.status).toBe('needs_dry_clean')
  expect(await events(t, blazer)).toEqual(routed)
  await owner.mutation(api.inventory.setCareInstructions, { textileId: blazer, instructions, expectedInstructions: prohibited })
  await owner.mutation(api.closet.droppedAtCleaner, { textileIds: [blazer] })
  const delivered = await events(t, blazer)
  expect(delivered[1]![1]).toMatchObject({ professionalCareSource: instructions.source, professionalCareWording: instructions.professionalDry.wording, professionalCarePermission: 'allowed' })
  await owner.mutation(api.inventory.setCareInstructions, { textileId: blazer, instructions: null, expectedInstructions: instructions })
  expect(await events(t, blazer)).toEqual(delivered)
})

test('urgent flags give the laundry person exactly one heads-up, and nothing else does', async () => {
  const t = newBackend()
  const { owner, sam, ownerKey, samKey, householdId, shirt, towel, sweater } = await closetHome(t)
  const tomorrow = start + 30 * hour
  const deliver = () => t.finishAllScheduledFunctions(vi.runAllTimers)

  await expect(sam.mutation(api.closet.flagDirty, { textileIds: [shirt, towel], reasons: ['mud_grass'], soilLevel: 'heavy', neededBy: tomorrow })).resolves.toMatchObject({ changed: 2, alerted: true })
  await deliver()
  const [headsUp] = await reminders(t)
  expect(await reminders(t)).toHaveLength(1)
  expect(headsUp).toMatchObject({ kind: 'urgent_flag', status: 'sent', recipientPrincipalKey: ownerKey, flaggedBy: samKey, flagKey: `${samKey}:${start}`, neededBy: tomorrow, textileIds: [shirt, towel] })

  // The same flag, edited, does not alert again; neither does the laundry person's own flag, nor a later day.
  await expect(sam.mutation(api.closet.flagDirty, { textileIds: [shirt], reasons: ['food'], soilLevel: 'heavy', neededBy: tomorrow })).resolves.toMatchObject({ alerted: false })
  await expect(owner.mutation(api.closet.flagDirty, { textileIds: [sweater], reasons: [], soilLevel: 'normal', neededBy: tomorrow })).resolves.toMatchObject({ alerted: false })
  const jeans = await readyGarment(owner, householdId, 'Jeans')
  vi.setSystemTime(start + 1)
  await expect(sam.mutation(api.closet.flagDirty, { textileIds: [jeans], reasons: ['worn'], soilLevel: 'light', neededBy: start + 5 * day })).resolves.toMatchObject({ alerted: false })
  const tee = await readyGarment(owner, householdId, 'Tee', { tag: { washMethod: 'machine', cycle: 'normal' } })
  vi.setSystemTime(start + 2)
  await sam.mutation(api.closet.washNow, { householdId, textileIds: [tee], soilLevel: 'normal', guests: [] })
  expect(await reminders(t)).toHaveLength(1)

  // "Need it tomorrow" on something already in the hamper is a flag of its own.
  vi.setSystemTime(start + hour)
  await expect(sam.mutation(api.closet.setNeededBy, { textileIds: [jeans], neededBy: tomorrow })).resolves.toEqual({ changed: 1, skipped: 0, alerted: true })
  expect((await garment(t, jeans))!.flag).toMatchObject({ reasons: ['worn'], neededBy: tomorrow })
  await expect(sam.mutation(api.closet.setNeededBy, { textileIds: [tee], neededBy: tomorrow })).resolves.toMatchObject({ alerted: true })
  expect((await garment(t, tee))!.flag).toMatchObject({ reasons: [], flaggedBy: samKey, neededBy: tomorrow })

  // A heads-up whose flag was withdrawn before delivery is cancelled.
  await owner.mutation(api.closet.unflag, { textileIds: [tee] })
  await deliver()
  const byTextile = (id: Id<'textiles'>) => reminders(t).then((rows) => rows.find((row) => row.textileIds?.[0] === id))
  expect((await byTextile(jeans))?.status).toBe('sent')
  expect((await byTextile(tee))?.status).toBe('cancelled')

  await sam.mutation(api.closet.setNeededBy, { textileIds: [jeans], neededBy: null })
  expect((await garment(t, jeans))!.flag!.neededBy).toBeUndefined()
  expect((await events(t, jeans)).at(-1)).toEqual(['flagged', { neededBy: false }])
})

test('a heads-up goes to the chosen laundry person, never to someone who left', async () => {
  const t = newBackend()
  const { owner, sam, samKey, householdId, shirt, towel } = await closetHome(t)
  await owner.mutation(api.inventory.setClosetPreferences, { householdId, laundryPersonKey: samKey })
  await expect(sam.mutation(api.closet.flagDirty, { textileIds: [shirt], reasons: [], soilLevel: 'normal', neededBy: start })).resolves.toMatchObject({ alerted: false })
  await expect(owner.mutation(api.closet.flagDirty, { textileIds: [towel], reasons: [], soilLevel: 'normal', neededBy: start })).resolves.toMatchObject({ alerted: true })

  const membership = (await owner.query(api.households.members, { householdId })).find((entry) => !entry.isYou)!
  await sam.mutation(api.households.removeMember, { membershipId: membership.membershipId })
  const jeans = await readyGarment(owner, householdId, 'Jeans')
  await expect(owner.mutation(api.closet.flagDirty, { textileIds: [jeans], reasons: [], soilLevel: 'normal', neededBy: start })).resolves.toMatchObject({ alerted: false })
})

test('All dry clears only its own load, and only a person clears it', async () => {
  const t = newBackend()
  const { owner, householdId, shirt, towel } = await closetHome(t)
  await addDryer(owner, householdId)
  // Neither garment's drying is on record, so both loads end hanging to dry.
  const first = await washLoad(owner, householdId, [shirt], 'first')
  const second = await washLoad(owner, householdId, [towel], 'second')
  expect(first.completed).toMatchObject({ ready: 0, hanging: 1 })
  vi.advanceTimersByTime(30 * day)
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect((await garment(t, shirt))!.status).toBe('hanging')

  await expect(owner.mutation(api.closet.allDry, { sessionId: first.sessionId })).resolves.toEqual({ changed: 1 })
  expect((await garment(t, shirt))!.status).toBe('clean')
  expect((await garment(t, towel))!.status).toBe('hanging')
  expect((await events(t, shirt)).map(([event]) => event).filter((event) => !String(event).startsWith('action_'))).toEqual(['washed', 'hung', 'dried'])
  await expect(owner.mutation(api.closet.allDry, { sessionId: first.sessionId })).resolves.toEqual({ changed: 0 })
  await expect(signedIn(t, 'closet-outsider').mutation(api.closet.allDry, { sessionId: second.sessionId })).rejects.toThrow()
})

test('attention: the hamper and its load count, one top slot by priority, hand wash and guests apart', async () => {
  const t = newBackend()
  const { owner, sam, householdId, shirt, towel, sweater } = await closetHome(t)
  await owner.mutation(api.inventory.createTextiles, { householdId, name: 'Wool sweater', quantity: 1, status: 'dirty', tag: { washMethod: 'hand_wash' } })

  const empty = await attention(owner, householdId)
  expect(empty.hamper).toEqual({ count: 3, loads: null, handWash: 1 })
  expect(empty.top).toEqual({ kind: 'hamper', count: 3, loads: null })

  // Only a normal plan of exactly the machine hamper gives the load count.
  await planFor(owner, householdId, [shirt, towel])
  expect((await attention(owner, householdId)).hamper.loads).toBeNull()
  const whole = await planFor(owner, householdId, [shirt, towel, sweater])
  const counted = await attention(owner, householdId)
  expect(counted.hamper.loads).toBe(whole.result.loads.length)
  expect(counted.top).toEqual({ kind: 'hamper', count: 3, loads: counted.hamper.loads })

  // A guest's shirt counts toward the hamper, never toward the closet's own slots.
  await owner.mutation(api.closet.washNow, { householdId, textileIds: [], soilLevel: 'normal', guests: [{ kind: 'shirt', colorGroup: 'light', machineOk: true }] })
  expect((await attention(owner, householdId)).hamper).toEqual({ count: 4, loads: null, handWash: 1 })

  await sam.mutation(api.closet.flagDirty, { textileIds: [shirt], reasons: ['wet'], soilLevel: 'normal' })
  expect((await attention(owner, householdId)).top).toEqual({ kind: 'wet', count: 1, name: 'White tee', since: start })
  await sam.mutation(api.closet.flagDirty, { textileIds: [towel], reasons: ['wet'], soilLevel: 'normal' })
  expect((await attention(owner, householdId)).top).toEqual({ kind: 'wet', count: 2, since: start })

  await sam.mutation(api.closet.setNeededBy, { textileIds: [sweater], neededBy: start + 20 * hour })
  expect((await attention(owner, householdId)).top).toEqual({ kind: 'needed', textileId: sweater, name: 'Mystery sweater', neededBy: start + 20 * hour })

  const planned = await planFor(owner, householdId, [towel])
  const { sessionId } = await startLoad(owner, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'running' })
  expect((await attention(owner, householdId)).top).toMatchObject({ kind: 'running', sessionId, facts: { status: 'running', machineStartedAt: null, hasDrying: false } })
  // The garment in the running load has left the hamper.
  expect((await attention(owner, householdId)).hamper.count).toBe(3)
})

test('attention: Needs-you cards in order, from the household\'s thresholds or their defaults', async () => {
  const t = newBackend()
  const { owner, householdId, shirt, towel } = await closetHome(t)
  await addDryer(owner, householdId)
  await owner.mutation(api.closet.flagDirty, { textileIds: [towel], reasons: ['wet'], soilLevel: 'normal' })
  const blazer = await readyGarment(owner, householdId, 'Navy blazer', { tag: { washMethod: 'dry_clean_only' } })
  const coat = await readyGarment(owner, householdId, 'Coat', { tag: { washMethod: 'dry_clean_only' } })
  await owner.mutation(api.closet.moveToDryCleaning, { textileIds: [blazer, coat] })
  await owner.mutation(api.closet.droppedAtCleaner, { textileIds: [blazer], pickupBy: start + 2 * day })
  await owner.mutation(api.closet.droppedAtCleaner, { textileIds: [coat] })
  const cards = async () => (await attention(owner, householdId)).cards

  expect(await cards()).toEqual([])
  vi.setSystemTime(start + day)
  expect(await cards()).toEqual([{ kind: 'wet', textileIds: [towel], since: start }])
  vi.setSystemTime(start + 2 * day + 1)
  expect(await cards()).toEqual([{ kind: 'wet', textileIds: [towel], since: start }, { kind: 'cleaner', textileIds: [blazer], since: start, pickupBy: start + 2 * day }])
  await owner.mutation(api.inventory.setClosetPreferences, { householdId, hamperDays: 2, wetDays: 3 })
  expect(await cards()).toEqual([
    { kind: 'hamper', count: 3, since: start },
    { kind: 'cleaner', textileIds: [blazer], since: start, pickupBy: start + 2 * day },
  ])

  // A load still hanging comes first, and there are never more than three cards.
  const washed = await washLoad(owner, householdId, [shirt], 'hang')
  await owner.mutation(api.inventory.setClosetPreferences, { householdId, hamperDays: 7, wetDays: 1 })
  vi.setSystemTime(start + 7 * day)
  expect(await cards()).toEqual([
    { kind: 'hanging', sessionId: washed.sessionId, since: start + 2 * day + 1 },
    { kind: 'wet', textileIds: [towel], since: start },
    { kind: 'hamper', count: 2, since: start },
  ])
  // A clock far off is ignored in favour of the server's.
  await expect(owner.query(api.closet.attention, { householdId, now: 0 })).resolves.toMatchObject({ cards: [{ kind: 'hanging' }, { kind: 'wet' }, { kind: 'hamper' }] })
})

test('today: ready clothes by wearer and explicitly assigned tags, independently of type', async () => {
  const t = newBackend()
  const { owner, householdId, towel } = await closetHome(t)
  const sam = await owner.mutation(api.inventory.createWearer, { householdId, name: 'Sam', kind: 'child' })
  const pajamas = await readyGarment(owner, householdId, "Sam's pajamas", { kind: 'pajamas', wearerId: sam })
  const gym = await readyGarment(owner, householdId, "Sam's gym top", { kind: 'workout', wearerId: sam, tags: ['Sport', 'Lounge'] })
  const suit = await readyGarment(owner, householdId, 'Grey suit', { kind: 'suit', tags: ['Work'] })
  const shirt = await readyGarment(owner, householdId, 'Work shirt', { kind: 't_shirt', occasions: ['work'], tag: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40 } })
  const blazer = await readyGarment(owner, householdId, 'Navy blazer', { kind: 'suit', tags: ['Work'], tag: { washMethod: 'dry_clean_only' } })
  await owner.mutation(api.closet.washNow, { householdId, textileIds: [], soilLevel: 'normal', guests: [{ kind: 'suit', colorGroup: 'dark', machineOk: true }] })

  const forSam = await owner.query(api.closet.today, { householdId, wearerId: sam })
  expect(forSam.ready.map((entry) => entry._id).sort()).toEqual([pajamas, gym].sort())
  expect(forSam.ready.find((entry) => entry._id === gym)).toMatchObject({ occasions: ['sport', 'lounge'], wearsSinceClean: 0, createdAt: start, wearerId: sam })
  expect(forSam.notWornDays).toBe(90)

  await owner.mutation(api.closet.flagDirty, { textileIds: [suit], reasons: ['food'], soilLevel: 'heavy', neededBy: start + 3 * day })
  await owner.mutation(api.closet.moveToDryCleaning, { textileIds: [blazer] })
  await owner.mutation(api.closet.droppedAtCleaner, { textileIds: [blazer], pickupBy: start + 2 * day })
  await owner.mutation(api.closet.flagDirty, { textileIds: [shirt], reasons: ['worn'], soilLevel: 'light' })
  const planned = await planFor(owner, householdId, [shirt])
  const { sessionId } = await startLoad(owner, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'work' })

  const work = await owner.query(api.closet.today, { householdId, occasion: 'work' })
  expect(work.ready).toEqual([])
  expect(work.notReadyForOccasion).toEqual(expect.arrayContaining([
    { textileId: suit, name: 'Grey suit', status: 'dirty', neededBy: start + 3 * day },
    { textileId: shirt, name: 'Work shirt', status: 'in_wash', sessionId },
    { textileId: blazer, name: 'Navy blazer', status: 'at_cleaner', cleanerPickupBy: start + 2 * day },
  ]))
  expect(work.notReadyForOccasion).toHaveLength(3)
  expect(work.notReady).toEqual({ dirty: 1, in_wash: 1, hanging: 0, needs_dry_clean: 0, at_cleaner: 1, needs_refresh: 0 })

  // Without an occasion, nothing is listed as not ready for it; guests never appear.
  const everyone = await owner.query(api.closet.today, { householdId })
  expect(everyone.notReadyForOccasion).toEqual([])
  expect(everyone.readyCount).toBe(2)
  expect(everyone.notReady).toMatchObject({ dirty: 4, in_wash: 1, at_cleaner: 1 })
  expect(everyone.ready.map((entry) => entry.name)).not.toContain("Guest's suit or blazer")
  await expect(owner.query(api.closet.today, { householdId, wearerId: towel as unknown as Id<'wearers'> })).rejects.toThrow()
})

test('Wash now puts picked clothes in the hamper and adds a guest\'s clothes for this load only', async () => {
  const t = newBackend()
  const { owner, sam, samKey, householdId, shirt } = await closetHome(t)
  const jeans = await readyGarment(owner, householdId, "Leo's jeans")
  const { selection } = await sam.mutation(api.closet.washNow, {
    householdId,
    textileIds: [shirt, jeans],
    soilLevel: 'heavy',
    guests: [
      { name: "Alex's shirt", kind: 'shirt', colorGroup: 'light', machineOk: true },
      { kind: 't_shirt', colorGroup: 'dark', tag: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, dryMethod: 'tumble_dry', dryHeat: 'low' } },
    ],
  })
  expect(selection).toHaveLength(4)
  expect(selection.slice(0, 2)).toEqual([shirt, jeans].sort())
  const [alex, other] = selection.slice(2) as [Id<'textiles'>, Id<'textiles'>]

  expect(await garment(t, jeans)).toMatchObject({ status: 'dirty', soilLevel: 'heavy', flag: { reasons: [], flaggedBy: samKey, flaggedAt: start } })
  expect(await events(t, jeans)).toEqual([['flagged', { washNow: true }]])
  // Already in the hamper: kept as it was.
  expect((await garment(t, shirt))!.soilLevel).toBeUndefined()
  expect(await garment(t, alex)).toMatchObject({ name: "Alex's shirt", guest: true, status: 'dirty', soilLevel: 'heavy', kind: 'shirt' })
  expect((await garment(t, alex))!.wearerId).toBeUndefined()
  expect((await garment(t, other))!.name).toBe("Guest's t-shirt")
  const care = await t.run(async (ctx) => (await ctx.db.query('care').collect()).filter((row) => row.textileId === alex || row.textileId === other))
  expect(care.find((row) => row.textileId === alex)).toMatchObject({ washMethod: 'machine', cycle: 'delicate', maxTemperatureC: 30, dryMethod: 'line_dry', restrictions: [], status: 'confirmed', provenance: { source: 'guest_answer', confidence: 'observed' } })
  expect(care.find((row) => row.textileId === other)).toMatchObject({ dryHeat: 'low', provenance: { source: 'tag_taps', confidence: 'observed' } })
  expect(await events(t, alex)).toEqual([])
  expect(await reminders(t)).toEqual([])

  const guest = (entry: Record<string, unknown>) => sam.mutation(api.closet.washNow, { householdId, textileIds: [], soilLevel: 'normal', guests: [{ kind: 'shirt', colorGroup: 'light', ...entry }] })
  await expect(guest({ tag: { washMethod: 'hand_wash' } })).rejects.toThrow("can't be machine washed")
  await expect(guest({})).rejects.toThrow('OK in the washing machine')
  await expect(guest({ machineOk: true, tag: { washMethod: 'machine', cycle: 'normal' } })).rejects.toThrow('OK in the washing machine')
  await expect(sam.mutation(api.closet.washNow, { householdId, textileIds: [], soilLevel: 'normal', guests: [] })).rejects.toThrow('between 1 and 200')

  const blazer = await readyGarment(owner, householdId, 'Blazer', { tag: { washMethod: 'dry_clean_only' } })
  await owner.mutation(api.closet.moveToDryCleaning, { textileIds: [blazer] })
  await expect(sam.mutation(api.closet.washNow, { householdId, textileIds: [blazer], soilLevel: 'normal', guests: [] })).rejects.toThrow("can't be washed now")
  const planned = await planFor(owner, householdId, [shirt])
  await startLoad(owner, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'busy' })
  await expect(sam.mutation(api.closet.washNow, { householdId, textileIds: [shirt], soilLevel: 'normal', guests: [] })).rejects.toThrow('already in the wash')
})
