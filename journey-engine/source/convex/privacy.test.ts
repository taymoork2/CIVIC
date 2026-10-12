import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from './_generated/api'
import { authorize, rules, visible } from './access'
import { finishSteps, intakeHousehold, joinHousehold, keyOf, newBackend, planFor, signedIn, startLoad } from './harness.testing'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

async function privateHome() {
  const t = newBackend()
  const owner = signedIn(t, 'privacy-owner')
  const home = await intakeHousehold(owner)
  const member = await joinHousehold(t, owner, home.householdId, 'privacy-member', 'Sam')
  const memberKey = await keyOf(member)
  const wearerId = await member.mutation(api.inventory.createWearer, { householdId: home.householdId, name: 'Sam', kind: 'adult', self: true })
  // The creator differs from the linked closet owner; ownership must follow the person.
  await owner.mutation(api.inventory.updateTextile, { textileId: home.shirt, wearerId, name: 'Secret garment', identity: { brand: 'Secret brand' } })
  return { t, owner, member, memberKey, wearerId, ...home }
}

test('only the linked closet owner changes privacy; owners manage people without accounts', async () => {
  const h = await privateHome()
  const { t, owner, member, householdId, shirt, towel } = h
  expect(rules['textile.privacy']).toBe('closetOwner')
  await expect(owner.mutation(api.inventory.setPrivacy, { textileIds: [shirt], private: true })).rejects.toThrow('Forbidden')
  await member.mutation(api.inventory.setPrivacy, { textileIds: [shirt], private: true })
  await expect(owner.mutation(api.inventory.setPrivacy, { textileIds: [shirt], private: false })).rejects.toThrow('Forbidden')
  await member.mutation(api.inventory.setPrivacy, { textileIds: [shirt], private: false })
  const childId = await owner.mutation(api.inventory.createWearer, { householdId, name: 'Child', kind: 'child' })
  await owner.mutation(api.inventory.updateTextile, { textileId: towel, wearerId: childId })
  await expect(member.mutation(api.inventory.setPrivacy, { textileIds: [towel], private: true })).rejects.toThrow('Forbidden')
  await owner.mutation(api.inventory.setPrivacy, { textileIds: [towel], private: true })
  await expect(owner.run((ctx) => authorize(ctx, 'textile.privacy', { householdId }))).rejects.toThrow('Forbidden')
  await expect(member.mutation(api.inventory.setPrivacy, { textileIds: [shirt, towel], private: true })).rejects.toThrow('Forbidden')
  expect((await t.run((ctx) => ctx.db.get(shirt)))!.private).toBe(false)
  const outsider = signedIn(t, 'privacy-outsider')
  await expect(outsider.mutation(api.inventory.setPrivacy, { textileIds: [shirt], private: true })).rejects.toThrow('Forbidden')
})

test('private garments leave every closet list and cannot be read or changed by ID', async () => {
  const h = await privateHome()
  const { owner, member, householdId, shirt, t } = h
  await member.mutation(api.inventory.setPrivacy, { textileIds: [shirt], private: true })
  const inventory = await owner.query(api.inventory.list, { householdId })
  expect(inventory.textiles.map((piece) => piece.textileId)).not.toContain(shirt)
  expect((await member.query(api.inventory.list, { householdId })).textiles.find((piece) => piece.textileId === shirt)).toMatchObject({ name: 'Secret garment', private: true, canChangePrivacy: true })
  expect(JSON.stringify(await owner.query(api.closet.today, { householdId }))).not.toContain('Secret garment')
  expect(JSON.stringify(await owner.query(api.closet.attention, { householdId, now: Date.now() }))).not.toContain('Secret garment')
  await owner.run(async (ctx) => {
    const { actor } = await authorize(ctx, 'textile.read', { householdId })
    const rows = await ctx.db.query('textiles').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect()
    expect((await visible(ctx, actor, rows)).map((row) => row._id)).not.toContain(shirt)
  })
  await expect(owner.query(api.sessions.garmentRecord, { textileId: shirt })).rejects.toThrow('Forbidden')
  await expect(owner.mutation(api.inventory.updateTextile, { textileId: shirt, name: 'Changed' })).rejects.toThrow('Forbidden')
  await expect(owner.mutation(api.inventory.setTextileStatus, { textileIds: [shirt], status: 'clean' })).rejects.toThrow('Forbidden')
  await expect(owner.mutation(api.closet.unflag, { textileIds: [shirt] })).rejects.toThrow('Forbidden')
  await expect(owner.mutation(api.catalog.unmatch, { holding: { kind: 'garment', id: shirt } })).rejects.toThrow('Forbidden')
  await t.run((ctx) => ctx.db.patch(shirt, { trashedAt: Date.now() }))
  expect(await owner.query(api.inventory.listTrash, { householdId })).toEqual([])
  expect(await member.query(api.inventory.listTrash, { householdId })).toHaveLength(1)
  await expect(owner.mutation(api.inventory.restoreTextiles, { textileIds: [shirt] })).rejects.toThrow('Forbidden')
})

test('another member cannot expose a private closet by unlinking or removing its person', async () => {
  const { owner, member, t, householdId, shirt, wearerId, memberKey } = await privateHome()
  await member.mutation(api.inventory.setPrivacy, { textileIds: [shirt], private: true })
  const membership = await t.run((ctx) => ctx.db.query('memberships').withIndex('by_household_principal', (q) => q.eq('householdId', householdId).eq('principalKey', memberKey)).unique())
  await expect(owner.mutation(api.inventory.updateWearer, { wearerId, principalKey: null })).rejects.toThrow('Forbidden')
  await expect(owner.mutation(api.inventory.updateWearer, { wearerId, principalKey: await keyOf(owner) })).rejects.toThrow('Forbidden')
  await expect(owner.mutation(api.inventory.removeWearer, { wearerId })).rejects.toThrow('Forbidden')
  await expect(owner.mutation(api.households.removeMember, { membershipId: membership!._id })).rejects.toThrow('Forbidden')
  expect((await t.run((ctx) => ctx.db.get(wearerId)))!.principalKey).toBe(memberKey)
  expect((await member.query(api.inventory.list, { householdId })).textiles.map((piece) => piece.textileId)).toContain(shirt)
})

test('already delivered urgent alerts stop showing a garment made private afterwards', async () => {
  const { owner, member, t, householdId, shirt, towel, wearerId } = await privateHome()
  await member.mutation(api.closet.flagDirty, { textileIds: [shirt, towel], reasons: ['food'], soilLevel: 'heavy', neededBy: Date.now() + 3_600_000 })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect((await owner.query(api.notifications.flagAlerts, { householdId }))[0]!.count).toBe(2)
  await member.mutation(api.inventory.setPrivacy, { textileIds: [shirt], private: true })
  const alerts = await owner.query(api.notifications.flagAlerts, { householdId })
  expect(alerts).toHaveLength(1)
  expect(alerts[0]!.count).toBe(1)
  expect(JSON.stringify(alerts)).not.toContain('Secret')
  await t.run((ctx) => ctx.db.patch(towel, { wearerId }))
  await member.mutation(api.inventory.setPrivacy, { textileIds: [towel], private: true })
  expect(await owner.query(api.notifications.flagAlerts, { householdId })).toEqual([])
})

test('a mixed load retains private care and the exact planner result, through steps, drying and history', async () => {
  const h = await privateHome()
  const { t, owner, member, householdId, shirt, towel } = h
  await member.mutation(api.inventory.setCare, { textileId: shirt, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, dryMethod: 'do_not_tumble_dry', restrictions: ['Do not tumble dry'], provenance: { source: 'checked label', confidence: 'verified' } })
  await member.mutation(api.inventory.answerTagQuestions, { textileIds: [shirt], washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, dryMethod: 'do_not_tumble_dry', bleach: 'none' })
  const before = await planFor(owner, householdId, [shirt, towel])
  await member.mutation(api.inventory.setPrivacy, { textileIds: [shirt], private: true })
  const theirs = (await owner.query(api.plans.get, { planId: before.planId }))!
  const own = (await member.query(api.plans.get, { planId: before.planId }))!
  expect(theirs.result).toEqual(before.result)
  expect(JSON.stringify(theirs)).not.toContain('Secret')
  expect(theirs.privatePieces).toEqual([expect.objectContaining({ textileId: shirt, private: true, name: null, color: null, privateCare: expect.objectContaining({ maxTemperatureC: 30, dryMethod: 'do_not_tumble_dry', bleach: 'none' }) })])
  expect(own.privatePieces).toBeUndefined()
  expect(theirs.result.loads.flatMap((load) => load.textileIds)).toContain(shirt)
  expect(theirs.result.loads.find((load) => load.textileIds.includes(shirt))!.temperatureC).toBeLessThanOrEqual(30)
  const load = theirs.result.loads.find((load) => load.textileIds.includes(shirt))!
  await t.run((ctx) => ctx.db.patch(before.planId, { textileIds: undefined }))
  expect((await owner.query(api.plans.get, { planId: before.planId }))!.privatePieces?.map((piece) => piece.textileId)).toContain(shirt)
  await t.run((ctx) => ctx.db.patch(before.planId, { textileIds: [shirt, towel] }))
  const started = await startLoad(owner, { planId: before.planId, loadId: load.id, idempotencyKey: 'private-wash', loadName: 'Secret garment load' })
  const detail = await owner.query(api.execution.sessionDetail, { sessionId: started.sessionId })
  expect(detail.textiles.find((piece) => piece.textileId === shirt)).toMatchObject({ private: true, name: null, privateCare: { maxTemperatureC: 30 } })
  expect(JSON.stringify(detail)).not.toContain('Secret')
  expect((await member.query(api.execution.sessionDetail, { sessionId: started.sessionId })).textiles.find((piece) => piece.textileId === shirt)!.name).toBe('Secret garment')
  await finishSteps(owner, started.sessionId)
  await owner.mutation(api.dryingQueue.queueFromWasher, { sessionId: started.sessionId })
  const queue = await owner.query(api.dryingQueue.queue, { householdId })
  expect(queue.pieces.find((piece) => piece.textileId === shirt)).toMatchObject({ private: true, name: null, kind: null, label: 'do_not_tumble_dry' })
  expect(JSON.stringify(queue)).not.toContain('Secret')
  const record = await owner.query(api.sessions.loadRecord, { sessionId: started.sessionId })
  expect(record!.pieces.find((piece) => piece.textileId === shirt)).toMatchObject({ private: true, name: null })
  expect(JSON.stringify(record)).not.toContain('Secret')
  expect(JSON.stringify(await owner.query(api.execution.householdSessions, { householdId }))).not.toContain('Secret')
})

test('a saved outfit cannot expose an old name after a garment is renamed and made private', async () => {
  const { owner, member, householdId, shirt, wearerId } = await privateHome()
  const date = new Date().toISOString().slice(0, 10)
  await member.mutation(api.inventory.setTextileStatus, { textileIds: [shirt], status: 'clean' })
  await owner.mutation(api.outfits.save, { householdId, wearerId, date, items: [{ textileId: shirt, quantity: 1 }] })
  expect(JSON.stringify(await owner.query(api.outfits.today, { householdId, wearerId, date }))).toContain('Secret garment')
  await member.mutation(api.inventory.updateTextile, { textileId: shirt, name: 'Renamed secret' })
  await member.mutation(api.inventory.setPrivacy, { textileIds: [shirt], private: true })
  expect((await owner.query(api.outfits.today, { householdId, wearerId, date }))[0]!.items).toEqual([])
  await expect(owner.mutation(api.outfits.save, { householdId, wearerId, date, items: [{ textileId: shirt, quantity: 1 }] })).rejects.toThrow('Forbidden')
})

test('privacy does not make unknown care safe or exclude it from planning', async () => {
  const { owner, member, householdId, shirt, sweater } = await privateHome()
  await owner.mutation(api.inventory.updateTextile, { textileId: sweater, wearerId: (await member.query(api.inventory.list, { householdId })).wearers.find((person) => person.name === 'Sam')!.wearerId })
  const before = await planFor(owner, householdId, [shirt, sweater])
  await member.mutation(api.inventory.setPrivacy, { textileIds: [sweater], private: true })
  const after = await planFor(owner, householdId, [shirt, sweater])
  expect(after.result).toEqual(before.result)
  expect(after.privatePieces).toEqual([expect.objectContaining({ textileId: sweater, privateCare: null })])
})

test('a photo link issued before privacy was set is denied on delivery afterwards', async () => {
  vi.stubEnv('WASHCLOSET_PHOTO_URL_SECRET', 'privacy-photo-secret-with-at-least-thirty-characters')
  try {
    const { t, owner, member, householdId, shirt } = await privateHome()
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(['photo'])))
    const photoId = await t.mutation(internal.photos.insertPhoto, { householdId, textileId: shirt, storageId, contentType: 'image/jpeg', size: 5, uploadedBy: await keyOf(member) })
    await owner.mutation(api.photos.issueViewUrl, { photoId })
    await member.mutation(api.inventory.setPrivacy, { textileIds: [shirt], private: true })
    expect(await t.query(internal.photos.deliverable, { photoId, principalKey: await keyOf(owner) })).toBeNull()
    expect(await t.query(internal.photos.deliverable, { photoId, principalKey: await keyOf(member) })).toMatchObject({ storageId })
    await expect(owner.query(api.photos.list, { textileId: shirt })).rejects.toThrow('Forbidden')
    await expect(owner.mutation(api.photos.issueViewUrl, { photoId })).rejects.toThrow('Forbidden')
    await expect(owner.mutation(api.photos.remove, { photoId })).rejects.toThrow('Forbidden')
  } finally { vi.unstubAllEnvs() }
})
