import { expect, onTestFinished, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { startLoad, addDryer, dryingCare, finishSteps, intakeHousehold, joinHousehold, keyOf, label, newBackend, planFor, signedIn } from './harness.testing'

test('laundry-day preferences work before a plan, retain equipment settings and validate shared access', async () => {
  const t = newBackend(), owner = signedIn(t, 'laundry-day-owner')
  const home = await intakeHousehold(owner)
  await owner.mutation(api.inventory.setLaundryDay, { householdId: home.householdId, rackLoads: 3, loadsPerDay: 1 })
  await owner.mutation(api.inventory.setLaundryDay, { householdId: home.householdId, pace: 'spread', finishBy: '18:30' })
  const before = await owner.query(api.inventory.list, { householdId: home.householdId })
  expect(before.planning.day).toEqual({ rackLoads: 3, loadsPerDay: 1, pace: 'spread', finishBy: '18:30' })
  for (const finishBy of ['24:00', '12:99', '1:30', 'not a time']) await expect(owner.mutation(api.inventory.setLaundryDay, { householdId: home.householdId, finishBy })).rejects.toThrow('valid finish time')
  await expect(signedIn(t, 'laundry-day-outsider').mutation(api.inventory.setLaundryDay, { householdId: home.householdId, pace: 'all' })).rejects.toThrow('Forbidden')
  expect(await owner.query(api.inventory.list, { householdId: home.householdId })).toEqual(before)
  await owner.mutation(api.inventory.setLaundryDay, { householdId: home.householdId, finishBy: null, pace: 'all' })
  expect((await owner.query(api.inventory.list, { householdId: home.householdId })).planning.day).toEqual({ rackLoads: 3, loadsPerDay: 1, pace: 'all' })
})

test('bulk tags and profile changes are atomic, authorized and retain other tags and care', async () => {
  const t = newBackend(), owner = signedIn(t, 'bulk-qol')
  const home = await intakeHousehold(owner)
  await owner.mutation(api.inventory.updateTextile, { textileId: home.shirt, tags: ['Work'] })
  const before = await owner.query(api.inventory.list, { householdId: home.householdId })
  await owner.mutation(api.inventory.bulkUpdateTextiles, { textileIds: [home.shirt, home.towel], addTags: ['Travel'] })
  let saved = await owner.query(api.inventory.list, { householdId: home.householdId })
  expect(saved.textiles.find((piece) => piece.textileId === home.shirt)?.tags).toEqual(['Travel', 'Work'])
  expect(saved.textiles.find((piece) => piece.textileId === home.towel)?.tags).toEqual(['Travel'])
  expect(saved.textiles.find((piece) => piece.textileId === home.shirt)?.care).toEqual(before.textiles.find((piece) => piece.textileId === home.shirt)?.care)
  const wearer = await owner.mutation(api.inventory.createWearer, { householdId: home.householdId, name: 'Bulk profile', kind: 'adult' })
  await owner.mutation(api.inventory.bulkUpdateTextiles, { textileIds: [home.shirt, home.towel], wearerId: wearer })
  saved = await owner.query(api.inventory.list, { householdId: home.householdId })
  expect(saved.textiles.filter((piece) => [home.shirt, home.towel].includes(piece.textileId)).every((piece) => piece.wearerId === wearer)).toBe(true)
  await expect(signedIn(t, 'bulk-outsider').mutation(api.inventory.bulkUpdateTextiles, { textileIds: [home.shirt], addTags: ['Secret'] })).rejects.toThrow('Forbidden')
  const other = await intakeHousehold(signedIn(t, 'bulk-other'))
  await expect(owner.mutation(api.inventory.bulkUpdateTextiles, { textileIds: [home.shirt, other.shirt], addTags: ['Wrong'] })).rejects.toThrow()
  const foreignWearer = await signedIn(t, 'bulk-other').mutation(api.inventory.createWearer, { householdId: other.householdId, name: 'Other person', kind: 'adult' })
  await expect(owner.mutation(api.inventory.bulkUpdateTextiles, { textileIds: [home.shirt], wearerId: foreignWearer })).rejects.toThrow()
  expect(await owner.query(api.inventory.list, { householdId: home.householdId })).toEqual(saved)
})

test('brief Trash undo refuses a later removal and expired receipts', async () => {
  vi.useFakeTimers(); onTestFinished(() => { vi.useRealTimers() })
  const t = newBackend(), owner = signedIn(t, 'undo-qol')
  const home = await intakeHousehold(owner)
  const removed = await owner.mutation(api.inventory.trashTextiles, { textileIds: [home.shirt] })
  await owner.mutation(api.inventory.restoreTextiles, { textileIds: [home.shirt], expectedTrashedAt: removed.trashedAt, expectedRevisions: removed.revisions })
  await owner.mutation(api.inventory.trashTextiles, { textileIds: [home.shirt] })
  await owner.mutation(api.inventory.restoreTextiles, { textileIds: [home.shirt] })
  await owner.mutation(api.inventory.trashTextiles, { textileIds: [home.shirt] })
  await expect(owner.mutation(api.inventory.restoreTextiles, { textileIds: [home.shirt], expectedTrashedAt: removed.trashedAt, expectedRevisions: removed.revisions })).rejects.toThrow('changed')
  const [row] = await owner.query(api.inventory.listTrash, { householdId: home.householdId })
  vi.advanceTimersByTime(60_001)
  await expect(owner.mutation(api.inventory.restoreTextiles, { textileIds: [home.shirt], expectedTrashedAt: row!.deleteAt - 30 * 24 * 60 * 60 * 1000 })).rejects.toThrow('expired')
  await expect(signedIn(t, 'undo-outsider').mutation(api.inventory.restoreTextiles, { textileIds: [home.shirt] })).rejects.toThrow('Forbidden')
  await owner.mutation(api.inventory.restoreTextiles, { textileIds: [home.shirt] })
})

test('old Trash purge jobs remain compatible but cannot erase a newer removal', async () => {
  vi.useFakeTimers(); onTestFinished(() => { vi.useRealTimers() })
  const t = newBackend(), owner = signedIn(t, 'legacy-trash-qol')
  const home = await intakeHousehold(owner)
  const start = Date.now()
  await t.run(async ctx => { await ctx.db.patch(home.shirt, { trashedAt: start }) })
  await owner.mutation(api.inventory.restoreTextiles, { textileIds: [home.shirt] })
  await owner.mutation(api.inventory.trashTextiles, { textileIds: [home.shirt] })
  await t.run(async ctx => { await ctx.db.patch(home.towel, { trashedAt: start }) })
  vi.advanceTimersByTime(30 * 24 * 60 * 60 * 1000)
  await t.mutation(internal.inventory.purgeTrashed, { textileId: home.shirt, trashedAt: start })
  expect(await t.run(ctx => ctx.db.get(home.shirt))).not.toBeNull()
  await t.mutation(internal.inventory.purgeTrashed, { textileId: home.towel, trashedAt: start })
  expect(await t.run(ctx => ctx.db.get(home.towel))).toBeNull()
})

test('bulk profile changes reject running pieces without changing any selected piece', async () => {
  const t = newBackend(), owner = signedIn(t, 'busy-bulk-qol')
  const home = await intakeHousehold(owner)
  const planned = await planFor(owner, home.householdId, [home.shirt])
  await startLoad(owner, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'bulk-running' })
  const before = await owner.query(api.inventory.list, { householdId: home.householdId })
  await expect(owner.mutation(api.inventory.bulkUpdateTextiles, { textileIds: [home.shirt, home.towel], wearerId: null, addTags: ['Changed'] })).rejects.toThrow('running load')
  expect(await owner.query(api.inventory.list, { householdId: home.householdId })).toEqual(before)
})

test('an assortment saves atomically as individual color pieces, without copying dye history', async () => {
  const t = newBackend(), owner = signedIn(t, 'assortment-owner')
  const home = await intakeHousehold(owner)
  const args = { householdId: home.householdId, name: 'Boxer briefs', kind: 'underwear' as const, quantity: 3, status: 'clean' as const, sameCareInstructions: true, identity: { brand: 'Calvin Klein', size: 'M' }, material: 'polyester', tag: { washMethod: 'machine' as const, cycle: 'normal', maxTemperatureC: 30 }, colors: [{ name: 'Black boxer briefs', color: 'Black', colorGroup: 'dark' as const, quantity: 2, dyeRun: 'fast' as const }, { name: 'Navy boxer briefs', color: 'Navy', colorGroup: 'dark' as const, quantity: 1 }] }
  const ids = await owner.mutation(api.inventory.createTextiles, args)
  const all = async () => (await owner.query(api.inventory.list, { householdId: home.householdId })).textiles
  const saved = (await all()).filter((piece) => ids.includes(piece.textileId))
  expect(saved).toHaveLength(3)
  expect(saved.filter((piece) => piece.color === 'Black')).toHaveLength(2)
  expect(saved.find((piece) => piece.color === 'Navy')).toMatchObject({ name: 'Navy boxer briefs', dyeRun: 'unknown', washCount: 0 })
  for (const piece of saved) expect(piece).toMatchObject({ status: 'clean', washCount: 0, identity: args.identity, care: { material: 'polyester', maxTemperatureC: 30 } })
  const before = (await all()).length
  for (const invalid of [
    { ...args, quantity: 4 }, { ...args, sameCareInstructions: false },
    { ...args, colors: [args.colors[0]!, { ...args.colors[1]!, name: '' }] },
    { ...args, quantity: 2.5, colors: [{ ...args.colors[0]!, quantity: 1.5 }, args.colors[1]!] },
    { ...args, quantity: 21, colors: [{ ...args.colors[0]!, quantity: 20 }, args.colors[1]!] },
    { ...args, fabricDetails: { fibers: [{ fiber: 'wool', details: ['Merino'] }] } },
  ]) { await expect(owner.mutation(api.inventory.createTextiles, invalid)).rejects.toThrow(); expect((await all()).length).toBe(before) }
  await expect(signedIn(t, 'pack-outsider').mutation(api.inventory.createTextiles, args)).rejects.toThrow('Forbidden')
  expect((await all()).length).toBe(before)
  const preowned = await owner.mutation(api.inventory.createTextiles, { ...args, preOwned: {} })
  expect((await all()).filter((piece) => preowned.includes(piece.textileId)).every((piece) => piece.dyeRun === 'unknown')).toBe(true)
})

test('fabric metadata survives care edits and matching copies, prunes removed fibers and never supplies care permissions', async () => {
  const t = newBackend(), owner = signedIn(t, 'fabric-details-owner')
  const home = await intakeHousehold(owner)
  const fabricDetails = { fibers: [{ fiber: 'cotton', details: ['Supima'] }], construction: ['Jersey'], finishes: ['Pre-shrunk'] }
  const [id] = await owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Supima tee', quantity: 1, material: '95% cotton, 5% elastane', fabricDetails, tag: { washMethod: 'unknown' } })
  const care = async (textileId = id!) => (await owner.query(api.inventory.list, { householdId: home.householdId })).textiles.find((piece) => piece.textileId === textileId)!.care!
  expect(await care()).toMatchObject({ fabricDetails, status: 'needs_confirmation', washMethod: 'unknown' })
  await owner.mutation(api.inventory.answerTagQuestions, { textileIds: [id!], washMethod: 'hand_wash' })
  expect((await care()).fabricDetails).toEqual(fabricDetails)
  const [copy] = await owner.mutation(api.inventory.addMatchingTextiles, { textileId: id!, quantity: 1 })
  expect((await care(copy!)).fabricDetails).toEqual(fabricDetails)
  await owner.mutation(api.inventory.setMaterial, { textileIds: [id!], material: '80% cotton, 20% elastane' })
  expect((await care()).fabricDetails).toEqual(fabricDetails)
  await owner.mutation(api.inventory.setMaterial, { textileIds: [id!], material: 'wool' })
  expect((await care()).fabricDetails).toEqual({ construction: ['Jersey'], finishes: ['Pre-shrunk'] })
  await owner.mutation(api.inventory.setMaterial, { textileIds: [id!], material: 'wool', fabricDetails: { fibers: [{ fiber: 'wool', details: ['Merino'] }], finishes: ['Superwash / shrink-resist'] } })
  expect((await care()).washMethod).toBe('hand_wash')
  const before = await care()
  await expect(owner.mutation(api.inventory.setMaterial, { textileIds: [id!], material: 'wool', fabricDetails: { fibers: [{ fiber: 'cotton', details: ['Supima'] }] } })).rejects.toThrow()
  await expect(owner.mutation(api.inventory.setMaterial, { textileIds: [id!], material: 'wool', fabricDetails: { finishes: ['x'.repeat(61)] } })).rejects.toThrow()
  await expect(signedIn(t, 'details-outsider').mutation(api.inventory.setMaterial, { textileIds: [id!], material: 'cotton', fabricDetails })).rejects.toThrow('Forbidden')
  expect(await care()).toEqual(before)
  await owner.mutation(api.inventory.answerTagQuestions, { textileIds: [id!], washMethod: 'unknown', fabricDetails: {} })
  expect((await care()).fabricDetails).toBeUndefined()
})

test('incompatible material care stays recorded but requires correction, including legacy confirmed records', async () => {
  const t = newBackend(), owner = signedIn(t, 'material-care')
  const home = await intakeHousehold(owner)
  const [id] = await owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Wool sweater', quantity: 1, status: 'clean', material: '95% cotton, 5% cashmere', tag: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, bleach: 'none', dryMethod: 'tumble_dry', dryHeat: 'medium' } })
  const care = async () => (await owner.query(api.inventory.list, { householdId: home.householdId })).textiles.find((item) => item.textileId === id)!.care!
  expect(await care()).toMatchObject({ status: 'needs_confirmation', cycle: 'normal', dryHeat: 'medium' })
  await t.run(async (ctx) => { const row = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', id!)).unique(); await ctx.db.patch(row!._id, { status: 'confirmed' }) })
  expect((await care()).status).toBe('needs_confirmation')
  await owner.mutation(api.inventory.answerTagQuestions, { textileIds: [id!], washMethod: 'machine', cycle: 'delicate', maxTemperatureC: 30, bleach: 'none', dryMethod: 'tumble_dry', dryHeat: 'low' })
  expect(await care()).toMatchObject({ status: 'confirmed', material: '95% cotton, 5% cashmere', cycle: 'delicate', dryHeat: 'low' })
  await owner.mutation(api.inventory.setMaterial, { textileIds: [home.shirt], material: 'wool' })
  expect((await owner.query(api.inventory.list, { householdId: home.householdId })).textiles.find((item) => item.textileId === home.shirt)!.care?.status).toBe('needs_confirmation')
})

test('a fabric-only change keeps every recorded care answer, and a garment with no care record still gets its fabric', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'fabric-only')
  const home = await intakeHousehold(owner)
  const [shirt, scarf] = await owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Shirt', quantity: 2, status: 'clean' })
  await owner.mutation(api.inventory.setCare, { textileId: shirt!, washMethod: 'machine', cycle: 'Bulky', maxTemperatureC: 40, restrictions: ['Do not soak'], dryMethod: 'line_dry', provenance: label('care label') })
  const care = async (id: Id<'textiles'>) => (await owner.query(api.inventory.list, { householdId: home.householdId })).textiles.find((item) => item.textileId === id)!.care
  const recorded = await care(shirt!)
  await owner.mutation(api.inventory.setMaterial, { textileIds: [shirt!, scarf!], material: 'wool' })
  expect(await care(shirt!)).toEqual({ ...recorded, material: 'wool' })
  expect(await care(scarf!)).toMatchObject({ material: 'wool', washMethod: 'unknown', status: 'needs_confirmation' })
  await owner.mutation(api.inventory.setMaterial, { textileIds: [shirt!], material: null })
  expect(await care(shirt!)).toEqual({ ...recorded, material: null })
})

test('fabric from the label is saved at intake, kept by later tag answers, and changed or cleared only when sent', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'fabric-owner')
  const home = await intakeHousehold(owner)
  const [sweater] = await owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Wool sweater', quantity: 1, status: 'clean', tag: { washMethod: 'hand_wash' }, material: 'wool' })
  const fabric = async () => (await owner.query(api.inventory.list, { householdId: home.householdId })).textiles.find((item) => item.textileId === sweater)!.care?.material ?? null
  expect(await fabric()).toBe('wool')
  await owner.mutation(api.inventory.answerTagQuestions, { textileIds: [sweater!], washMethod: 'hand_wash', ironSteam: 'not_allowed' })
  expect(await fabric()).toBe('wool')
  await owner.mutation(api.inventory.answerTagQuestions, { textileIds: [sweater!], washMethod: 'hand_wash', material: 'silk' })
  expect(await fabric()).toBe('silk')
  await owner.mutation(api.inventory.answerTagQuestions, { textileIds: [sweater!], washMethod: 'hand_wash', material: null })
  expect(await fabric()).toBeNull()
})

test('blend composition and custom materials survive intake and edits without losing care, and stay bounded', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'blend-owner')
  const home = await intakeHousehold(owner)
  const composition = '80% cotton, 20% polyester'
  const [shirt] = await owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Blend tee', quantity: 1, status: 'clean', tag: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, bleach: 'none', dryMethod: 'line_dry' }, material: composition })
  const care = async () => (await owner.query(api.inventory.list, { householdId: home.householdId })).textiles.find((item) => item.textileId === shirt)!.care
  const original = await care()
  expect(original?.material).toBe(composition)
  const longBlend = '20% cotton, 20% polyester, 20% linen, 20% nylon, 15% rayon, 5% Elastane'
  expect(longBlend.length).toBeGreaterThan(60)
  await owner.mutation(api.inventory.setMaterial, { textileIds: [shirt!], material: longBlend })
  expect(await care()).toEqual({ ...original, material: longBlend })
  await owner.mutation(api.inventory.answerTagQuestions, { textileIds: [shirt!], washMethod: 'machine', cycle: 'normal', material: '95% cotton, 5% Cashmere' })
  expect((await care())?.material).toBe('95% cotton, 5% Cashmere')
  await expect(owner.mutation(api.inventory.setMaterial, { textileIds: [shirt!], material: 'x'.repeat(241) })).rejects.toThrow()
  await expect(signedIn(t, 'blend-outsider').mutation(api.inventory.setMaterial, { textileIds: [shirt!], material: 'cotton' })).rejects.toThrow('Forbidden')
  expect((await care())?.material).toBe('95% cotton, 5% Cashmere')
})

test('intake stores stain observations atomically for every matching piece and rejects Ready stains', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'stain-intake-owner')
  const home = await intakeHousehold(owner)
  const actorKey = await keyOf(owner)
  for (const [stain, reason, kind] of [
    ['food', 'food', 'unknown'],
    ['grease', 'stain_other', 'oil_grease'],
    ['ink', 'stain_other', 'dye_ink_transfer'],
    ['other', 'stain_other', 'unknown'],
  ] as const) {
    const ids = await owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: `${stain} tees`, quantity: 2, status: 'dirty', stain, soilLevel: 'normal' })
    const items = (await owner.query(api.inventory.list, { householdId: home.householdId })).textiles.filter((item) => ids.includes(item.textileId))
    expect(items).toHaveLength(2)
    for (const item of items) expect(item).toMatchObject({ status: 'dirty', flag: { reasons: [reason], stainReport: { kind, priorTreatmentAttempts: 'unknown' }, flaggedBy: actorKey } })
    expect(new Set(items.map((item) => item.flag?.flaggedAt)).size).toBe(1)
  }
  const before = (await owner.query(api.inventory.list, { householdId: home.householdId })).textiles.length
  await expect(owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Rejected stain', quantity: 2, status: 'clean', stain: 'ink' })).rejects.toThrow('Stained garments')
  expect((await owner.query(api.inventory.list, { householdId: home.householdId })).textiles).toHaveLength(before)
  await expect(signedIn(t, 'stain-outsider').mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Forbidden stain', quantity: 1, status: 'dirty', stain: 'food' })).rejects.toThrow('Forbidden')
  const [clean] = await owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'No stain', quantity: 1, status: 'clean', stain: 'none' })
  const [cleaner] = await owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Stained blazer', quantity: 1, status: 'dirty', stain: 'grease', tag: { washMethod: 'dry_clean_only' } })
  const inventory = (await owner.query(api.inventory.list, { householdId: home.householdId })).textiles
  expect(inventory.find((item) => item.textileId === clean)).toMatchObject({ status: 'clean', flag: null })
  expect(inventory.find((item) => item.textileId === cleaner)).toMatchObject({ status: 'needs_dry_clean', soilLevel: null, flag: { stainReport: { kind: 'oil_grease' } } })
})

test('an old, set-in stain is saved as a known mark; treating it flags the piece and removing it clears it', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'known-mark-owner')
  const home = await intakeHousehold(owner)
  const listed = async () => (await owner.query(api.inventory.list, { householdId: home.householdId })).textiles
  const ids = await owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Old shirts', quantity: 2, status: 'clean', stain: 'food', stainAge: 'set_in' })
  for (const item of (await listed()).filter((entry) => ids.includes(entry.textileId))) expect(item).toMatchObject({ status: 'clean', flag: null, knownStain: { reason: 'food', kind: 'unknown' } })
  // A new stain keeps today's rule; an old one needs a stain to be old.
  await expect(owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'New stain', quantity: 1, status: 'clean', stain: 'food', stainAge: 'new' })).rejects.toThrow('Stained garments')
  await expect(owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'No stain', quantity: 1, status: 'clean', stain: 'none', stainAge: 'set_in' })).rejects.toThrow('Choose the stain before')
  await expect(owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'No stain', quantity: 1, status: 'clean', stainAge: 'set_in' })).rejects.toThrow('Choose the stain before')
  await expect(signedIn(t, 'known-mark-outsider').mutation(api.closet.treatKnownStain, { textileIds: [ids[0]!] })).rejects.toThrow('Forbidden')

  expect(await owner.mutation(api.closet.treatKnownStain, { textileIds: [ids[0]!] })).toEqual({ changed: 1, skipped: 0, toDryClean: [], alerted: false })
  const treated = (await listed()).find((entry) => entry.textileId === ids[0])
  expect(treated).not.toHaveProperty('knownStain')
  expect(treated).toMatchObject({ status: 'dirty', soilLevel: 'normal', flag: { reasons: ['food'], stainReport: { kind: 'unknown', priorTreatmentAttempts: 'unknown' }, flaggedBy: await keyOf(owner) } })
  // Treating again finds no mark to treat.
  expect(await t.run(async (ctx) => (await ctx.db.query('history').withIndex('by_textile', (q) => q.eq('textileId', ids[0]!)).collect()).map((row) => row.event))).toContain('flagged')
  expect(await owner.mutation(api.closet.treatKnownStain, { textileIds: [ids[0]!] })).toMatchObject({ changed: 0, skipped: 1 })

  expect(await owner.mutation(api.closet.removeKnownStain, { textileIds: [ids[1]!] })).toEqual({ changed: 1 })
  const removed = (await listed()).find((entry) => entry.textileId === ids[1])
  expect(removed).toMatchObject({ status: 'clean', flag: null })
  expect(removed).not.toHaveProperty('knownStain')
})

test('treating a known mark follows the closet flag path: dry cleaning, running loads and away pieces', async () => {
  const t = newBackend()
  const as = signedIn(t, 'known-mark-paths')
  const home = await intakeHousehold(as)
  const mark = { reason: 'food' as const, kind: 'unknown' as const, recordedAt: 1 }
  // Dry-clean care goes to dry cleaning, with no flag and the mark cleared.
  const [blazer] = await as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Old blazer', quantity: 1, status: 'clean', stain: 'grease', stainAge: 'set_in', tag: { washMethod: 'dry_clean_only' } })
  expect(await as.mutation(api.closet.treatKnownStain, { textileIds: [blazer!] })).toEqual({ changed: 1, skipped: 0, toDryClean: [blazer], alerted: false })
  const sent = await t.run(async (ctx) => ctx.db.get(blazer!))
  expect(sent).toMatchObject({ status: 'needs_dry_clean' })
  expect(sent?.flag).toBeUndefined()
  expect(sent?.knownStain).toBeUndefined()
  // A piece in a running load, or one at the cleaner, is skipped and keeps its mark.
  const planned = await planFor(as, home.householdId, [home.shirt])
  await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'running' })
  await t.run(async (ctx) => { await ctx.db.patch(home.shirt, { knownStain: mark }); await ctx.db.patch(home.sweater, { knownStain: mark, status: 'at_cleaner' }) })
  expect(await as.mutation(api.closet.treatKnownStain, { textileIds: [home.shirt, home.sweater] })).toEqual({ changed: 0, skipped: 2, toDryClean: [], alerted: false })
  for (const id of [home.shirt, home.sweater]) expect(await t.run(async (ctx) => (await ctx.db.get(id))?.knownStain)).toEqual(mark)
})

test('tags persist separately from type, copy to matching packs, and enforce authorization and moderation', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'tag-owner')
  const outsider = signedIn(t, 'tag-outsider')
  const home = await intakeHousehold(owner)
  const ids = await owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'White undershirts', quantity: 5, kind: 't_shirt', status: 'clean', tags: [' Work ', 'work', 'Trip to Kyoto'] })
  const read = () => owner.query(api.inventory.list, { householdId: home.householdId })
  expect((await read()).textiles.filter((item) => ids.includes(item.textileId)).every((item) => JSON.stringify(item.tags) === JSON.stringify(['Trip to Kyoto', 'Work']))).toBe(true)
  await owner.mutation(api.inventory.updateTextile, { textileId: ids[0]!, tags: ['Weekend'] })
  const copies = await owner.mutation(api.inventory.addMatchingTextiles, { textileId: ids[0]!, quantity: 5 })
  expect((await read()).textiles.filter((item) => copies.includes(item.textileId)).every((item) => item.kind === 't_shirt' && item.tags?.[0] === 'Weekend')).toBe(true)
  await expect(outsider.mutation(api.inventory.updateTextile, { textileId: ids[0]!, tags: ['Mine'] })).rejects.toThrow('Forbidden')
  await expect(owner.mutation(api.inventory.updateTextile, { textileId: ids[0]!, tags: ['fuck'] })).rejects.toThrow('offensive language')
  await expect(owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Rejected', quantity: 1, tags: ['a'.repeat(33)] })).rejects.toThrow('Tags must')
  await owner.mutation(api.inventory.updateTextile, { textileId: ids[0]!, kind: 'underwear', tags: [] })
  expect((await read()).textiles.find((item) => item.textileId === ids[0]!)).toMatchObject({ kind: 'underwear', tags: [] })
})

test('a garment with unknown care becomes plannable once label evidence is recorded', async () => {
  const t = newBackend()
  const as = signedIn(t, 'intake-user')
  const home = await intakeHousehold(as)

  const before = await planFor(as, home.householdId, [home.sweater])
  expect(before.status).toBe('needs_confirmation')
  expect(before.result.exclusions[0]!.reasonCodes).toContain('needs_confirmation')

  const remembered = await as.mutation(api.inventory.setCare, { textileId: home.sweater, material: 'cotton', washMethod: 'machine', cycle: 'normal', restrictions: [], provenance: { source: 'from memory', confidence: 'user-supplied' } })
  expect(remembered.status).toBe('needs_confirmation')
  expect((await planFor(as, home.householdId, [home.sweater])).status).toBe('needs_confirmation')

  const read = await as.mutation(api.inventory.setCare, { textileId: home.sweater, material: 'cotton', washMethod: 'machine', cycle: 'normal', restrictions: [], provenance: label('care label read at intake') })
  expect(read.status).toBe('confirmed')
  const after = await planFor(as, home.householdId, [home.sweater])
  expect(after.status).toBe('ready')
  expect(after.result.loads[0]!.treatments[0]).toMatchObject({ dose: { amount: 30, unit: 'ml', measurementCue: 'fill to line 2' }, placement: 'detergent_compartment', confirmation: 'confirmed' })
})

test('editing a product or machine makes earlier plans stale; marking a garment clean does not', async () => {
  const t = newBackend()
  const as = signedIn(t, 'intake-user')
  const home = await intakeHousehold(as)
  const status = async (planId: Id<'plans'>) => (await as.query(api.plans.get, { planId }))?.status
  const first = await planFor(as, home.householdId, [home.shirt])
  expect(first.status).toBe('ready')

  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, formulation: { name: 'HE liquid', form: 'liquid', highEfficiencyCompatible: false } })
  expect(await status(first.planId)).toBe('stale')

  const second = await planFor(as, home.householdId, [home.shirt])
  expect(second.inputHash).not.toBe(first.inputHash)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, capacityUnits: 6 })
  expect(await status(second.planId)).toBe('stale')

  const third = await planFor(as, home.householdId, [home.shirt])
  await as.mutation(api.inventory.updateTextile, { textileId: home.shirt, status: 'clean' })
  expect(await status(third.planId)).toBe('ready')
})

test('an archived product no longer applies to new loads', async () => {
  const t = newBackend()
  const as = signedIn(t, 'intake-user')
  const home = await intakeHousehold(as)
  const unread = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Old softener', kind: 'chemical', provenance: { source: 'label worn off', confidence: 'unknown' } })
  expect((await planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [unread] })).status).toBe('needs_confirmation')
  await as.mutation(api.inventory.updateSupply, { supplyId: unread, archived: true })
  expect((await planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [unread] })).status).toBe('ready')
})

test('rejects cross-household access, invalid evidence, and fixture evidence claimed as verified', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'intake-user')
  const outsider = signedIn(t, 'outsider')
  const home = await intakeHousehold(owner)
  await intakeHousehold(outsider)

  await expect(outsider.query(api.inventory.list, { householdId: home.householdId })).rejects.toThrow('Forbidden')
  await expect(outsider.mutation(api.inventory.updateTextile, { textileId: home.shirt, name: 'Mine now' })).rejects.toThrow('Forbidden')
  await expect(outsider.mutation(api.inventory.updateMachine, { machineId: home.machine, capacityUnits: 50 })).rejects.toThrow('Forbidden')
  await expect(outsider.mutation(api.plans.recompute, { householdId: home.householdId, selectedTextileIds: [home.shirt], clientInputHash: 'x' })).rejects.toThrow('Forbidden')

  await expect(owner.mutation(api.inventory.setCare, { textileId: home.shirt, washMethod: 'machine', cycle: 'normal', restrictions: [], provenance: { source: 'sanitized-fixture:invoice-care-label', confidence: 'verified' } })).rejects.toThrow('Fixture evidence')
  await expect(owner.mutation(api.inventory.setCare, { textileId: home.shirt, washMethod: 'machine', cycle: 'normal', maxTemperatureC: 400, restrictions: [], provenance: label('label') })).rejects.toThrow('Maximum temperature')
  await expect(owner.mutation(api.inventory.setCare, { textileId: home.shirt, washMethod: 'machine', cycle: 'normal', restrictions: [], provenance: { source: '   ', confidence: 'verified' } })).rejects.toThrow('Evidence source')
  await expect(owner.mutation(api.inventory.updateMachine, { machineId: home.machine, capacityUnits: -1 })).rejects.toThrow('Capacity')

  const listed = await owner.query(api.inventory.list, { householdId: home.householdId })
  expect(listed.textiles).toHaveLength(3)
  expect(listed.textiles.find((textile) => textile.textileId === home.sweater)!.care).toBeNull()
  expect(listed.supplies[0]!.rules[0]).toMatchObject({ placement: 'detergent_compartment', dose: { amount: 30 } })
})

test('a garment in a running load cannot be deleted; otherwise it goes with its care record', async () => {
  const t = newBackend()
  const as = signedIn(t, 'intake-user')
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt])
  await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'running' })
  await expect(as.mutation(api.inventory.deleteTextile, { textileId: home.shirt })).rejects.toThrow('running load')
  await as.mutation(api.inventory.deleteTextile, { textileId: home.towel })
  expect(await t.run(async (ctx) => ({ towel: await ctx.db.get(home.towel), care: (await ctx.db.query('care').collect()).filter((care) => care.textileId === home.towel) }))).toEqual({ towel: null, care: [] })
})

test('identical garments are added together, each its own row', async () => {
  const t = newBackend()
  const as = signedIn(t, 'intake-user')
  const home = await intakeHousehold(as)
  const tees = await as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Raglan tee', quantity: 4, color: 'White', colorGroup: 'light', soilLevel: 'normal' })
  expect(new Set(tees).size).toBe(4)
  const listed = (await as.query(api.inventory.list, { householdId: home.householdId })).textiles.filter((textile) => tees.includes(textile.textileId))
  expect(listed.map((textile) => [textile.name, textile.color, textile.status, textile.soilLevel])).toEqual(Array.from({ length: 4 }, () => ['Raglan tee', 'White', 'dirty', 'normal']))
  await expect(as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Tee', quantity: 21 })).rejects.toThrow('between 1 and 20')
  await expect(as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Tee', quantity: 1.5 })).rejects.toThrow('between 1 and 20')
  await expect(signedIn(t, 'outsider').mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Tee', quantity: 2 })).rejects.toThrow('Forbidden')
})

test('an unanswered first wash reads as unknown, distinct from a checked yes or no', async () => {
  const t = newBackend()
  const as = signedIn(t, 'first-wash-user')
  const home = await intakeHousehold(as)
  const [unknown] = await as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Gray tee', quantity: 1 })
  const [fresh] = await as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'New jeans', quantity: 1, firstWash: true })
  const [washed] = await as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Old jeans', quantity: 1, firstWash: false })
  const listed = (await as.query(api.inventory.list, { householdId: home.householdId })).textiles
  const read = (id: string | undefined) => listed.find((textile) => textile.textileId === id)?.firstWash
  expect([read(unknown), read(fresh), read(washed)]).toEqual([null, true, false])
})

test('more matching garments inherit care but start ready with their own history', async () => {
  const t = newBackend()
  const as = signedIn(t, 'intake-user')
  const home = await intakeHousehold(as)
  const added = await as.mutation(api.inventory.addMatchingTextiles, { textileId: home.shirt, quantity: 2 })
  const listed = (await as.query(api.inventory.list, { householdId: home.householdId })).textiles
  const original = listed.find((textile) => textile.textileId === home.shirt)!
  const copies = listed.filter((textile) => added.includes(textile.textileId))
  expect(copies).toHaveLength(2)
  for (const copy of copies) {
    expect(copy).toMatchObject({ name: original.name, color: original.color, kind: original.kind, status: 'clean', washCount: 0, firstWash: true })
    expect(copy.care).toMatchObject({ washMethod: original.care?.washMethod, provenance: original.care?.provenance })
  }
  await expect(as.mutation(api.inventory.addMatchingTextiles, { textileId: home.shirt, quantity: 0 })).rejects.toThrow('between 1 and 20')
  await expect(signedIn(t, 'outsider').mutation(api.inventory.addMatchingTextiles, { textileId: home.shirt, quantity: 1 })).rejects.toThrow('Forbidden')
})

test('a removed garment stays recoverable for 30 days, then loses its records', async () => {
  vi.useFakeTimers()
  const start = Date.UTC(2026, 8, 29)
  vi.setSystemTime(start)
  try {
    const t = newBackend()
    const as = signedIn(t, 'intake-user')
    const home = await intakeHousehold(as)
    await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['worn'], soilLevel: 'normal' })
    await as.mutation(api.inventory.trashTextiles, { textileIds: [home.shirt] })
    expect((await as.query(api.inventory.list, { householdId: home.householdId })).textiles.some((row) => row.textileId === home.shirt)).toBe(false)
    expect(await as.query(api.inventory.listTrash, { householdId: home.householdId })).toMatchObject([{ textileId: home.shirt, deleteAt: start + 30 * 24 * 60 * 60 * 1000 }])
    await expect(planFor(as, home.householdId, [home.shirt])).rejects.toThrow('Forbidden')
    expect(await t.run(async (ctx) => ctx.db.query('history').withIndex('by_textile', (q) => q.eq('textileId', home.shirt)).collect())).not.toHaveLength(0)
    await as.mutation(api.inventory.restoreTextiles, { textileIds: [home.shirt] })
    expect((await as.query(api.inventory.list, { householdId: home.householdId })).textiles.some((row) => row.textileId === home.shirt)).toBe(true)

    vi.setSystemTime(start + 24 * 60 * 60 * 1000)
    await as.mutation(api.inventory.trashTextiles, { textileIds: [home.shirt] })
    vi.setSystemTime(start + 30 * 24 * 60 * 60 * 1000)
    await t.mutation(internal.inventory.purgeTrashed, { textileId: home.shirt, trashedAt: start, revision: 1 })
    expect(await t.run(async (ctx) => ctx.db.get(home.shirt))).not.toBeNull()
    vi.setSystemTime(start + 31 * 24 * 60 * 60 * 1000)
    await t.mutation(internal.inventory.purgeTrashed, { textileId: home.shirt, trashedAt: start + 24 * 60 * 60 * 1000, revision: 2 })
    expect(await t.run(async (ctx) => ({ textile: await ctx.db.get(home.shirt), history: await ctx.db.query('history').withIndex('by_textile', (q) => q.eq('textileId', home.shirt)).collect() }))).toEqual({ textile: null, history: [] })
  } finally {
    vi.useRealTimers()
  }
})

test('garments in a running load are not waiting for a wash, and a batch status change leaves them as they are', async () => {
  const t = newBackend()
  const as = signedIn(t, 'intake-user')
  const home = await intakeHousehold(as)
  const planned = await planFor(as, home.householdId, [home.shirt])
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'running' })
  const other = await planFor(as, home.householdId, [home.towel])
  const listed = async () => (await as.query(api.inventory.list, { householdId: home.householdId })).textiles
  const waiting = async () => (await listed()).filter((textile) => textile.status === 'dirty' && textile.inLoad === null).map((textile) => textile.textileId).sort()

  expect((await listed()).find((textile) => textile.textileId === home.shirt)!.inLoad).toBe(sessionId)
  expect(await waiting()).toEqual([home.towel, home.sweater].sort())

  // Clean or dirty is selection state: it neither touches the running load nor stales a plan.
  await expect(as.mutation(api.inventory.setTextileStatus, { textileIds: [home.shirt, home.towel, home.sweater], status: 'clean' })).resolves.toEqual({ changed: 2 })
  expect((await listed()).find((textile) => textile.textileId === home.shirt)!.status).toBe('dirty')
  expect((await as.query(api.plans.get, { planId: other.planId }))?.status).toBe('ready')
  expect(await waiting()).toEqual([])

  // How dirty a garment is doses its load, so recording it does stale plans.
  await expect(as.mutation(api.inventory.setTextileStatus, { textileIds: [home.towel], status: 'dirty', soilLevel: 'heavy' })).resolves.toEqual({ changed: 1 })
  expect((await listed()).find((textile) => textile.textileId === home.towel)!.soilLevel).toBe('heavy')
  expect((await as.query(api.plans.get, { planId: other.planId }))?.status).toBe('stale')
  await expect(as.mutation(api.inventory.setTextileStatus, { textileIds: [home.towel], status: 'clean', soilLevel: 'light' })).rejects.toThrow('needs a wash')
  await as.mutation(api.inventory.updateTextile, { textileId: home.towel, status: 'clean' })
  expect((await listed()).find((textile) => textile.textileId === home.towel)!.soilLevel).toBeNull()

  await as.mutation(api.execution.cancel, { sessionId })
  expect((await listed()).every((textile) => textile.inLoad === null)).toBe(true)
  await expect(signedIn(t, 'outsider').mutation(api.inventory.setTextileStatus, { textileIds: [home.towel], status: 'dirty' })).rejects.toThrow('Forbidden')
})

test('drying care is kept when a caller leaves it out, heat goes only with tumble drying, and an old restriction reads as its method', async () => {
  const t = newBackend()
  const as = signedIn(t, 'intake-user')
  const home = await intakeHousehold(as)
  const care = async () => (await as.query(api.inventory.list, { householdId: home.householdId })).textiles.find((textile) => textile.textileId === home.shirt)!.care!

  await dryingCare(as, home.shirt, 'tumble_dry', 'low')
  expect(await care()).toMatchObject({ dryMethod: 'tumble_dry', dryHeat: 'low', dryMethodInferred: false })
  // An older client that knows nothing of drying cannot erase it.
  await as.mutation(api.inventory.setCare, { textileId: home.shirt, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, restrictions: [], provenance: label('care label') })
  expect(await care()).toMatchObject({ dryMethod: 'tumble_dry', dryHeat: 'low' })
  await dryingCare(as, home.shirt, 'line_dry')
  expect(await care()).toMatchObject({ dryMethod: 'line_dry', dryHeat: null })
  await expect(dryingCare(as, home.shirt, 'line_dry', 'low')).rejects.toThrow('tumble-dry label')

  await as.mutation(api.inventory.setCare, { textileId: home.towel, washMethod: 'machine', cycle: 'normal', restrictions: ['Do not tumble dry'], provenance: label('care label') })
  const towel = (await as.query(api.inventory.list, { householdId: home.householdId })).textiles.find((textile) => textile.textileId === home.towel)!.care!
  expect(towel).toMatchObject({ dryMethod: 'do_not_tumble_dry', dryMethodInferred: true, restrictions: ['Do not tumble dry'] })
})

test('washers record HE, dryers record heat buttons, and neither turns into the other', async () => {
  const t = newBackend()
  const as = signedIn(t, 'intake-user')
  const home = await intakeHousehold(as)
  const dryer = await addDryer(as, home.householdId)
  const machines = async () => (await as.query(api.inventory.list, { householdId: home.householdId })).machines

  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, highEfficiency: false })
  expect((await machines()).find((machine) => machine.machineId === home.machine)!.highEfficiency).toBe(false)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, highEfficiency: null })
  expect((await machines()).find((machine) => machine.machineId === home.machine)!.highEfficiency).toBeNull()
  expect((await machines()).find((machine) => machine.machineId === dryer)).toMatchObject({
    applianceType: 'tumble_dryer',
    heatSettings: [{ heat: 'low', label: 'Low temp' }, { heat: 'medium', label: 'Medium temp' }, { heat: 'high', label: 'High temp' }],
    cycleMinutes: { timed: { durationMinutes: 64, confidence: 'verified' } },
    placements: [],
  })

  await expect(as.mutation(api.inventory.updateMachine, { machineId: home.machine, heatSettings: [{ heat: 'low', label: 'Low' }] })).rejects.toThrow('dryers only')
  await as.mutation(api.inventory.updateMachine, { machineId: dryer, heatSettings: [{ heat: 'delicate', label: 'Delicates', tempF: 115 }, { heat: 'low', label: 'Low' }] })
  // A button's temperature comes from the model's spec sheet, never from the user: a sent tempF is not stored.
  expect((await machines()).find((machine) => machine.machineId === dryer)!.heatSettings).toEqual([{ heat: 'delicate', label: 'Delicates' }, { heat: 'low', label: 'Low' }])
  await as.mutation(api.inventory.updateMachine, { machineId: dryer, heatSettings: [{ heat: 'low', label: 'Low', tempF: 14 }] })
  expect((await machines()).find((machine) => machine.machineId === dryer)!.heatSettings).toEqual([{ heat: 'low', label: 'Low' }])
  await expect(as.mutation(api.inventory.updateMachine, { machineId: dryer, highEfficiency: true })).rejects.toThrow('washers only')
  await expect(as.mutation(api.inventory.updateMachine, { machineId: dryer, heatSettings: [{ heat: 'low', label: 'Low' }, { heat: 'low', label: 'Delicate' }] })).rejects.toThrow('once')
  await expect(as.mutation(api.inventory.updateMachine, { machineId: dryer, cycleMinutes: { normal: 45 } })).rejects.toThrow('minutes one start buys')
  await expect(as.mutation(api.inventory.updateMachine, { machineId: dryer, applianceType: 'front_load_washer' })).rejects.toThrow('add it as a new machine')
  await expect(as.mutation(api.inventory.updateMachine, { machineId: home.machine, applianceType: 'tumble_dryer' })).rejects.toThrow('add it as a new machine')

  await expect(as.mutation(api.inventory.setPlanning, { householdId: home.householdId, preferredMachineId: dryer })).rejects.toThrow('preferred washer must be a washer')
  await expect(as.mutation(api.inventory.setPlanning, { householdId: home.householdId, preferredDryerId: home.machine })).rejects.toThrow('preferred dryer must be a dryer')
  await expect(as.mutation(api.inventory.setPlanning, { householdId: home.householdId, dryerPricePerStart: 0 })).rejects.toThrow('Dryer price')
  await as.mutation(api.inventory.setPlanning, { householdId: home.householdId, preferredMachineId: home.machine, preferredDryerId: dryer, dryerPricePerStart: 1.5 })
  expect((await as.query(api.inventory.list, { householdId: home.householdId })).planning).toMatchObject({ preferredMachineId: home.machine, preferredDryerId: dryer, dryerPricePerStart: 1.5 })
})

test('a rule stored before label directions still lists and keeps its conditions when edited, but no longer doses a load', async () => {
  const t = newBackend()
  const as = signedIn(t, 'intake-user')
  const home = await intakeHousehold(as)
  const legacy = await t.run(async (ctx) => {
    await ctx.db.delete(home.rule)
    return ctx.db.insert('rules', { householdId: home.householdId, supplyId: home.detergent, conditions: { minBulkUnits: 1, maxBulkUnits: 6 }, dose: { amount: 30, unit: 'ml', measurementCue: 'fill to line 2' }, stage: 'wash', placement: 'detergent_compartment', timing: 'before cycle start', provenance: label('Tide bottle label'), createdAt: 1 })
  })
  const rules = async () => (await as.query(api.inventory.list, { householdId: home.householdId })).supplies[0]!.rules
  expect(await rules()).toEqual([expect.objectContaining({ ruleId: legacy, row: null, rowText: null, conditions: { minBulkUnits: 1, maxBulkUnits: 6 } })])

  // A row keyed on load units is never chosen: the load asks for the label's line instead.
  const planned = await planFor(as, home.householdId, [home.shirt])
  expect(planned.status).toBe('needs_confirmation')
  expect(planned.result.reasons.some((reason) => reason.code === 'needs_confirmation' && reason.details.cause === 'label_row_needed')).toBe(true)
  expect(planned.result.loads[0]!.treatments.some((step) => step.ruleId === legacy)).toBe(false)

  await as.mutation(api.inventory.saveRule, { supplyId: home.detergent, ruleId: legacy, dose: { amount: 32, unit: 'ml' }, stage: 'wash', placement: 'detergent_compartment', timing: 'before cycle start', provenance: label('Tide bottle label') })
  expect(await rules()).toEqual([expect.objectContaining({ dose: { amount: 32, unit: 'ml' }, conditions: { minBulkUnits: 1, maxBulkUnits: 6 } })])
})

test('wearers are name tags: linked to a member only by that member or an owner, once, and removed without their clothes', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'wearer-owner')
  const home = await intakeHousehold(owner)
  const sam = await joinHousehold(t, owner, home.householdId, 'wearer-sam', 'Sam')
  const [ownerKey, samKey] = [await keyOf(owner), await keyOf(sam)]
  const samTag = await sam.mutation(api.inventory.createWearer, { householdId: home.householdId, name: ' Sam ', kind: 'child' })
  const baby = await owner.mutation(api.inventory.createWearer, { householdId: home.householdId, name: 'Baby', kind: 'baby' })
  const me = await owner.mutation(api.inventory.createWearer, { householdId: home.householdId, name: 'Me', kind: 'adult' })
  await expect(owner.mutation(api.inventory.createWearer, { householdId: home.householdId, name: '  ', kind: 'adult' })).rejects.toThrow('Name')
  await expect(signedIn(t, 'wearer-outsider').mutation(api.inventory.createWearer, { householdId: home.householdId, name: 'X', kind: 'adult' })).rejects.toThrow('Forbidden')

  await sam.mutation(api.inventory.updateWearer, { wearerId: samTag, principalKey: samKey })
  await expect(sam.mutation(api.inventory.updateWearer, { wearerId: me, principalKey: ownerKey })).rejects.toThrow('Only that person or an owner')
  await expect(sam.mutation(api.inventory.updateWearer, { wearerId: samTag, principalKey: null })).resolves.toBeNull()
  await owner.mutation(api.inventory.updateWearer, { wearerId: samTag, principalKey: samKey })
  await expect(owner.mutation(api.inventory.updateWearer, { wearerId: baby, principalKey: samKey })).rejects.toThrow('already linked')
  await expect(owner.mutation(api.inventory.updateWearer, { wearerId: me, principalKey: 'principal:v1:not-a-member' })).rejects.toThrow('member of this household')
  // An owner may link anyone; a member cannot take a link away from someone else.
  await owner.mutation(api.inventory.updateWearer, { wearerId: me, principalKey: ownerKey })
  await expect(sam.mutation(api.inventory.updateWearer, { wearerId: me, principalKey: null })).rejects.toThrow('Only that person or an owner')
  await owner.mutation(api.inventory.updateWearer, { wearerId: baby, name: 'Leo', kind: 'child' })

  const [jeans] = await owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: "Sam's jeans", quantity: 1, status: 'clean', kind: 'pants', wearerId: samTag })
  const listed = await owner.query(api.inventory.list, { householdId: home.householdId })
  expect(listed.wearers).toEqual([
    { wearerId: samTag, name: 'Sam', kind: 'child', principalKey: samKey },
    { wearerId: baby, name: 'Leo', kind: 'child', principalKey: null },
    { wearerId: me, name: 'Me', kind: 'adult', principalKey: ownerKey },
  ])
  expect(listed.textiles.find((textile) => textile.textileId === jeans)).toMatchObject({ kind: 'pants', wearerId: samTag, occasions: null, wearsSinceClean: 0, guest: false, flag: null })

  const planned = await planFor(owner, home.householdId, [home.shirt])
  await expect(owner.mutation(api.inventory.removeWearer, { wearerId: samTag })).rejects.toThrow('Remove household access')
  const membership = (await owner.query(api.households.members, { householdId: home.householdId })).find((member) => !member.isYou)!
  await owner.mutation(api.households.removeMember, { membershipId: membership.membershipId })
  await owner.mutation(api.inventory.removeWearer, { wearerId: samTag })
  expect((await t.run((ctx) => ctx.db.get(jeans!)))!.wearerId).toBeUndefined()
  expect((await owner.query(api.inventory.list, { householdId: home.householdId })).wearers).toHaveLength(2)
  expect((await owner.query(api.plans.get, { planId: planned.planId }))?.status).toBe('stale')
  await expect(owner.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Tee', quantity: 1, wearerId: samTag })).rejects.toThrow('Forbidden')
})

test('personal profile creation links the caller once and requires household membership', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'personal-owner')
  const home = await intakeHousehold(owner)
  const member = await joinHousehold(t, owner, home.householdId, 'personal-member', 'Sam')
  const profile = await member.mutation(api.inventory.createWearer, { householdId: home.householdId, name: 'Sam', kind: 'adult', self: true })
  expect((await member.query(api.inventory.list, { householdId: home.householdId })).wearers).toEqual([
    { wearerId: profile, name: 'Sam', kind: 'adult', principalKey: await keyOf(member) },
  ])
  await expect(member.mutation(api.inventory.createWearer, { householdId: home.householdId, name: 'Duplicate', kind: 'adult', self: true })).rejects.toThrow('already has a clothing profile')
  await expect(signedIn(t, 'personal-outsider').mutation(api.inventory.createWearer, { householdId: home.householdId, name: 'Outsider', kind: 'adult', self: true })).rejects.toThrow('Forbidden')
  expect((await member.query(api.inventory.list, { householdId: home.householdId })).wearers).toHaveLength(1)
})

test('Add clothes saves garments ready or in the hamper, with the tag answers as observed care in the same call', async () => {
  const t = newBackend()
  const as = signedIn(t, 'intake-user')
  const home = await intakeHousehold(as)
  const tag = { washMethod: 'machine' as const, maxTemperatureC: 40, cycle: 'delicate', dryMethod: 'tumble_dry' as const, dryHeat: 'low' as const, ironSteam: 'not_allowed' as const }
  const ready = await as.mutation(api.inventory.createTextiles, {
    householdId: home.householdId, name: 'Work shirt', quantity: 2, status: 'clean', kind: 'shirt', colorGroup: 'white',
    occasions: ['work', 'everyday', 'work'], identity: { brand: ' Uniqlo ', size: '', rnNumber: '12345' }, tag,
  })
  const hamper = await as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Towel', quantity: 1, status: 'dirty', soilLevel: 'heavy', kind: 'towel' })
  const dryClean = await as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Blazer', quantity: 1, status: 'dirty', soilLevel: 'heavy', tag: { washMethod: 'dry_clean_only' } })
  const readyBlazer = await as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Ready blazer', quantity: 1, status: 'clean', tag: { washMethod: 'dry_clean_only' } })
  const listed = (await as.query(api.inventory.list, { householdId: home.householdId })).textiles
  const row = (id: string) => listed.find((textile) => textile.textileId === id)!
  expect(row(ready[0]!)).toMatchObject({
    status: 'clean', soilLevel: null, kind: 'shirt', occasions: ['everyday', 'work'], identity: { brand: 'Uniqlo', rnNumber: '12345' },
    care: { washMethod: 'machine', maxTemperatureC: 40, cycle: 'delicate', dryMethod: 'tumble_dry', dryHeat: 'low', ironSteam: 'not_allowed', status: 'confirmed', provenance: { source: 'tag_taps', confidence: 'observed' } },
  })
  expect(row(ready[1]!).care).toMatchObject({ status: 'confirmed' })
  expect(row(hamper[0]!)).toMatchObject({ status: 'dirty', soilLevel: 'heavy', care: null, statusSince: expect.any(Number) })
  expect(row(dryClean[0]!)).toMatchObject({ status: 'needs_dry_clean', soilLevel: null, care: { washMethod: 'dry_clean_only' } })
  expect(row(readyBlazer[0]!)).toMatchObject({ status: 'clean', care: { washMethod: 'dry_clean_only' } })
  // Older callers still add to the hamper by default.
  const legacy = await as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Sock', quantity: 1 })
  expect((await t.run((ctx) => ctx.db.get(legacy[0]!)))!.status).toBe('dirty')

  await expect(as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Tee', quantity: 1, status: 'clean', soilLevel: 'light' })).rejects.toThrow('needs a wash')
  await expect(as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Tee', quantity: 1, tag: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 96 } })).rejects.toThrow('Maximum temperature')
  expect((await as.query(api.inventory.list, { householdId: home.householdId })).textiles.filter((textile) => textile.name === 'Tee')).toEqual([])

  await as.mutation(api.inventory.updateTextile, { textileId: ready[0]!, kind: 't_shirt', occasions: [], identity: { brand: ' ' } })
  const updated = (await t.run((ctx) => ctx.db.get(ready[0]!)))!
  expect(updated).toMatchObject({ kind: 't_shirt', occasions: [] })
  expect(updated.identity).toBeUndefined()
})

test('tag answers map to care, replace what was recorded, and leave what the tag does not say unknown', async () => {
  const t = newBackend()
  const as = signedIn(t, 'intake-user')
  const home = await intakeHousehold(as)
  const care = async (textileId: string) => (await as.query(api.inventory.list, { householdId: home.householdId })).textiles.find((textile) => textile.textileId === textileId)!.care!
  const answer = (tag: Record<string, unknown>, textileIds = [home.shirt, home.towel]) => as.mutation(api.inventory.answerTagQuestions, { textileIds, washMethod: 'machine', ...tag })

  await dryingCare(as, home.shirt, 'tumble_dry', 'high')
  await answer({ maxTemperatureC: 50, cycle: 'normal', dryMethod: 'tumble_dry', ironSteam: 'allowed' })
  for (const textileId of [home.shirt, home.towel]) {
    expect(await care(textileId)).toMatchObject({ washMethod: 'machine', maxTemperatureC: 50, cycle: 'normal', dryMethod: 'tumble_dry', dryHeat: null, ironSteam: 'allowed', status: 'confirmed', provenance: { source: 'tag_taps', confidence: 'observed' } })
  }
  // "Tag doesn't say" for water, drying and iron: unknown, not kept from before.
  await answer({ cycle: 'delicate' }, [home.shirt])
  expect(await care(home.shirt)).toMatchObject({ maxTemperatureC: null, cycle: 'delicate', dryMethod: 'unknown', ironSteam: null, restrictions: [], status: 'confirmed' })
  await answer({ cycle: 'normal', dryMethod: 'line_dry' }, [home.shirt])
  expect((await care(home.shirt)).dryMethod).toBe('line_dry')
  await answer({ cycle: 'normal', maxTemperatureC: 30, dryMethod: 'tumble_dry', dryHeat: 'medium', ironSteam: 'not_allowed' }, [home.shirt])
  expect(await care(home.shirt)).toMatchObject({ maxTemperatureC: 30, dryHeat: 'medium', ironSteam: 'not_allowed' })

  await as.mutation(api.inventory.answerTagQuestions, { textileIds: [home.sweater], washMethod: 'hand_wash', ironSteam: 'not_allowed' })
  expect(await care(home.sweater)).toMatchObject({ washMethod: 'hand_wash', status: 'confirmed', ironSteam: 'not_allowed' })
  await as.mutation(api.inventory.answerTagQuestions, { textileIds: [home.sweater], washMethod: 'dry_clean_only' })
  expect(await care(home.sweater)).toMatchObject({ washMethod: 'dry_clean_only', status: 'confirmed', ironSteam: null })
  // "Can't find a tag": stored as unknown and left needing confirmation, even though the planner now
  // washes it fail-closed (cold, gentlest cycle, no bleach, hung to dry) rather than waiting forever.
  await as.mutation(api.inventory.answerTagQuestions, { textileIds: [home.sweater], washMethod: 'unknown' })
  expect(await care(home.sweater)).toMatchObject({ washMethod: 'unknown', status: 'needs_confirmation' })

  await answer({ cycle: 'normal', maxTemperatureC: 35 }, [home.shirt])
  expect((await care(home.shirt)).maxTemperatureC).toBe(35)
  await answer({ washMethod: 'hand_wash', maxTemperatureC: 25 }, [home.sweater])
  expect(await care(home.sweater)).toMatchObject({ washMethod: 'hand_wash', maxTemperatureC: 25 })
  await expect(answer({ cycle: 'normal', maxTemperatureC: 96 })).rejects.toThrow('Maximum temperature')
  await expect(answer({ cycle: 'normal', dryMethod: 'line_dry', dryHeat: 'low' })).rejects.toThrow('tumble-dry label')
  await expect(as.mutation(api.inventory.answerTagQuestions, { textileIds: [], washMethod: 'machine' })).rejects.toThrow('between 1 and 200')
  await expect(signedIn(t, 'outsider').mutation(api.inventory.answerTagQuestions, { textileIds: [home.shirt], washMethod: 'machine', cycle: 'normal' })).rejects.toThrow('Forbidden')
  // setCare keeps the drying, iron and bleach answers a caller leaves out.
  await answer({ cycle: 'normal', maxTemperatureC: 30, dryMethod: 'tumble_dry', dryHeat: 'medium', ironSteam: 'not_allowed', bleach: 'none' }, [home.shirt])
  await as.mutation(api.inventory.setCare, { textileId: home.shirt, washMethod: 'machine', cycle: 'normal', restrictions: [], provenance: label('care label') })
  expect(await care(home.shirt)).toMatchObject({ ironSteam: 'not_allowed', dryMethod: 'tumble_dry', dryHeat: 'medium', bleach: 'none' })
  await as.mutation(api.inventory.setCare, { textileId: home.shirt, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 35, restrictions: ['Do not soak', 'Wash with like colors'], provenance: label('care label') })
  await answer({ cycle: 'normal', maxTemperatureC: 35, bleach: 'none' }, [home.shirt])
  expect(await care(home.shirt)).toMatchObject({ material: 'cotton', maxTemperatureC: 35, restrictions: ['Do not soak', 'Wash with like colors'] })
})

test('like-color tag taps persist at intake and edits preserve unrelated restrictions and older callers', async () => {
  const t = newBackend()
  const as = signedIn(t, 'like-color-user')
  const home = await intakeHousehold(as)
  const tag = { washMethod: 'machine' as const, cycle: 'normal', maxTemperatureC: 30, washWithLikeColors: true }
  const [id] = await as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Cold color tee', quantity: 1, tag })
  const care = async () => (await as.query(api.inventory.list, { householdId: home.householdId })).textiles.find((piece) => piece.textileId === id)!.care!
  expect(await care()).toMatchObject({ maxTemperatureC: 30, restrictions: ['Wash with like colors'] })
  await as.mutation(api.inventory.setCare, { textileId: id!, washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, restrictions: ['Do not soak', 'Wash with like colors'], provenance: label('care label') })
  await as.mutation(api.inventory.answerTagQuestions, { textileIds: [id!], ...tag })
  expect((await care()).restrictions).toEqual(['Do not soak', 'Wash with like colors'])
  const { washWithLikeColors: _, ...legacy } = tag
  await as.mutation(api.inventory.answerTagQuestions, { textileIds: [id!], ...legacy, bleach: 'none' })
  expect((await care()).restrictions).toEqual(['Do not soak', 'Wash with like colors'])
  await as.mutation(api.inventory.answerTagQuestions, { textileIds: [id!], ...tag, washWithLikeColors: false })
  expect((await care()).restrictions).toEqual(['Do not soak'])
  expect((await care()).maxTemperatureC).toBe(30)
})

test('the bleach triangle is stored as tapped, and a tag that does not say leaves it unset', async () => {
  const t = newBackend()
  const as = signedIn(t, 'intake-user')
  const home = await intakeHousehold(as)
  const care = async (textileId: string) => (await as.query(api.inventory.list, { householdId: home.householdId })).textiles.find((textile) => textile.textileId === textileId)!.care!
  const stored = async (textileId: string) => t.run((ctx) => ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textileId as never)).unique())

  for (const bleach of ['any', 'non_chlorine', 'none'] as const) {
    await as.mutation(api.inventory.answerTagQuestions, { textileIds: [home.shirt], washMethod: 'machine', cycle: 'normal', bleach })
    expect(await care(home.shirt)).toMatchObject({ bleach, status: 'confirmed' })
  }
  await as.mutation(api.inventory.answerTagQuestions, { textileIds: [home.shirt], washMethod: 'machine', cycle: 'normal' })
  expect(await care(home.shirt)).not.toHaveProperty('bleach')
  expect(await stored(home.shirt)).not.toHaveProperty('bleach')
  await expect(as.mutation(api.inventory.answerTagQuestions, { textileIds: [home.shirt], washMethod: 'machine', cycle: 'normal', bleach: 'oxygen' as never })).rejects.toThrow()

  const [tee] = await as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Black tee', quantity: 1, tag: { washMethod: 'machine', cycle: 'normal', bleach: 'none' } })
  expect(await care(tee!)).toMatchObject({ bleach: 'none' })
})

test('closet preferences are bounded, the laundry person must be a member, and baby separation is a planning switch', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'intake-user')
  const home = await intakeHousehold(owner)
  const sam = await joinHousehold(t, owner, home.householdId, 'prefs-sam', 'Sam')
  const samKey = await keyOf(sam)
  const set = (prefs: Record<string, unknown>) => sam.mutation(api.inventory.setClosetPreferences, { householdId: home.householdId, ...prefs })
  const stored = async () => (await t.run((ctx) => ctx.db.get(home.householdId)))!

  await set({ hamperDays: 3, wetDays: 1, cleanerDays: 60, notWornDays: 30, laundryPersonKey: samKey })
  await set({ notWornDays: 365 })
  expect((await stored()).closet).toEqual({ hamperDays: 3, wetDays: 1, cleanerDays: 60, notWornDays: 365, laundryPersonKey: samKey })
  await expect(set({ hamperDays: 0 })).rejects.toThrow('between 1 and 60')
  await expect(set({ wetDays: 61 })).rejects.toThrow('between 1 and 60')
  await expect(set({ cleanerDays: 1.5 })).rejects.toThrow('between 1 and 60')
  await expect(set({ notWornDays: 29 })).rejects.toThrow('between 30 and 365')
  await expect(set({ laundryPersonKey: 'principal:v1:somebody-else' })).rejects.toThrow('member of this household')
  await expect(signedIn(t, 'outsider').mutation(api.inventory.setClosetPreferences, { householdId: home.householdId, hamperDays: 2 })).rejects.toThrow('Forbidden')

  await owner.mutation(api.inventory.setPlanning, { householdId: home.householdId, babySeparate: false })
  expect((await owner.query(api.inventory.list, { householdId: home.householdId })).planning).toMatchObject({ babySeparate: false })
})

test('a bottle or box is saved with what it is for, its kind, its measure and its formulation; a kind that does not fit is refused', async () => {
  const t = newBackend()
  const as = signedIn(t, 'intake-user')
  const home = await intakeHousehold(as)
  const taps = { source: 'label_taps', confidence: 'observed' as const }
  const pods = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Tide pods', use: 'pods', kind: 'single_use', measure: { kind: 'count', countUnit: 'pod' }, formulation: { name: 'Tide pods', form: 'pods', highEfficiencyCompatible: true }, provenance: taps })
  const listed = async (supplyId: string) => (await as.query(api.inventory.list, { householdId: home.householdId })).supplies.find((supply) => supply.supplyId === supplyId)!
  expect(await listed(pods)).toMatchObject({ use: 'pods', kind: 'single_use', measure: { kind: 'count', countUnit: 'pod' }, formulation: { name: 'Tide pods', form: 'pods', highEfficiencyCompatible: true }, provenance: taps, rules: [] })
  expect((await listed(home.detergent)).use).toBe('detergent')

  await expect(as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Bounce', use: 'dryer_sheets', kind: 'chemical', provenance: taps })).rejects.toThrow('does not match')
  await expect(as.mutation(api.inventory.updateSupply, { supplyId: pods, use: 'detergent' })).rejects.toThrow('does not match')
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, use: 'detergent' })
  expect((await listed(home.detergent)).use).toBe('detergent')
})

test('a new use moves every label line of the product to where and when that use goes, and stales plans', async () => {
  const t = newBackend()
  const as = signedIn(t, 'use-change-user')
  const home = await intakeHousehold(as)
  const frontLoader = await as.mutation(api.inventory.createMachine, { householdId: home.householdId, name: 'Front loader', applianceType: 'front_load_washer', capacityUnits: 12, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['detergent_compartment', 'softener_compartment', 'direct_to_drum'], cycleMinutes: { normal: 35 }, provenance: label('machine data plate') })
  await as.mutation(api.inventory.setPlanning, { householdId: home.householdId, preferredMachineId: frontLoader })
  const taps = { source: 'label_taps', confidence: 'observed' as const }
  const lysol = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Lysol Laundry Sanitizer', use: 'sanitizer', kind: 'chemical', provenance: taps })
  for (const amount of [1, 2]) {
    await as.mutation(api.inventory.saveRule, { supplyId: lysol, dose: { amount, unit: 'capful' }, stage: 'wash', placement: 'direct_to_drum', timing: 'with the clothes, before starting', ...(amount === 2 ? { conditions: { soilLevels: ['heavy'] } } : {}), provenance: label('Lysol label') })
  }
  const rulesOf = (supplyId: Id<'supplies'>) => t.run(async (ctx) => (await ctx.db.query('rules').collect()).filter((rule) => rule.supplyId === supplyId).map(({ stage, placement, timing }) => ({ stage, placement, timing })))
  const plan = await planFor(as, home.householdId, [home.shirt])

  await as.mutation(api.inventory.updateSupply, { supplyId: lysol, use: 'rinse_sanitizer' })
  expect(await rulesOf(lysol)).toEqual([1, 2].map(() => ({ stage: 'rinse', placement: 'softener_compartment', timing: 'at the start of the rinse' })))
  expect((await as.query(api.plans.get, { planId: plan.planId }))?.status).toBe('stale')

  // A use change on a product with no label lines touches no rules.
  const oxi = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'OxiClean', use: 'booster', kind: 'chemical', provenance: taps })
  const before = await t.run((ctx) => ctx.db.query('rules').collect())
  await as.mutation(api.inventory.updateSupply, { supplyId: oxi, use: 'stain_remover' })
  expect(await t.run((ctx) => ctx.db.query('rules').collect())).toEqual(before)
})

test('"How many like it?" adds n identical machines named 1…n with the same answers, and a group edit reaches every sibling', async () => {
  const t = newBackend()
  const as = signedIn(t, 'siblings-user')
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Home', displayName: 'Pat' })
  const taps = { source: 'machine_taps', confidence: 'observed' as const }
  const washers = await as.mutation(api.inventory.createMachines, {
    householdId, name: ' Speed Queen washer ', count: 4, location: 'shared', applianceType: 'front_load_washer', highEfficiency: true,
    placements: ['direct_to_drum'], supportedCycles: ['normal'], pricePerStart: 2.5, cycleMinutes: { normal: 34 }, provenance: taps,
  })
  const [dryer] = await as.mutation(api.inventory.createMachines, {
    householdId, name: 'Dryer', count: 1, location: 'shared', applianceType: 'tumble_dryer', heatSettings: [{ heat: 'low', label: 'Delicates' }], provenance: taps,
  })
  const listed = async () => (await as.query(api.inventory.list, { householdId })).machines
  expect(washers).toHaveLength(4)
  expect((await listed()).map((machine) => machine.name)).toEqual(['Speed Queen washer 1', 'Speed Queen washer 2', 'Speed Queen washer 3', 'Speed Queen washer 4', 'Dryer'])
  for (const machine of (await listed()).slice(0, 4)) {
    expect(machine).toMatchObject({ highEfficiency: true, pricePerStart: 2.5, location: 'shared', cycleMinutes: { normal: { durationMinutes: 34 } } })
  }

  // The HE answer changes on every sibling; a new name renames them in order.
  await as.mutation(api.inventory.updateMachineGroup, { machineIds: washers, name: 'SQ', highEfficiency: null, pricePerStart: 2.75 })
  const after = (await listed()).slice(0, 4)
  expect(after.map((machine) => machine.name)).toEqual(['SQ 1', 'SQ 2', 'SQ 3', 'SQ 4'])
  expect(after.every((machine) => machine.highEfficiency === null && machine.pricePerStart === 2.75)).toBe(true)

  await expect(as.mutation(api.inventory.createMachines, { householdId, name: 'W', count: 25, applianceType: 'top_load_washer', provenance: taps })).rejects.toThrow('between 1 and 24')
  await expect(as.mutation(api.inventory.createMachines, { householdId, name: 'W', count: 0, applianceType: 'top_load_washer', provenance: taps })).rejects.toThrow('between 1 and 24')
  await expect(as.mutation(api.inventory.updateMachineGroup, { machineIds: [], highEfficiency: true })).rejects.toThrow('between 1 and 24')
  // A washer group cannot take a dryer's answers, and nothing is half-written.
  await expect(as.mutation(api.inventory.updateMachineGroup, { machineIds: [washers[0]!, dryer!], highEfficiency: true })).rejects.toThrow('washers only')
  const other = signedIn(t, 'siblings-other')
  await expect(other.mutation(api.inventory.updateMachineGroup, { machineIds: washers, pricePerStart: 1 })).rejects.toThrow()
})

test('a washer or dryer added by taps: its slots, a delicate setting, an about-size from the sticker or none, minutes, and a price when shared', async () => {
  const t = newBackend()
  const as = signedIn(t, 'intake-user')
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Home', displayName: 'Pat' })
  const taps = { source: 'machine_taps', confidence: 'observed' as const }
  const washer = await as.mutation(api.inventory.createMachine, {
    householdId, name: 'Washer', location: 'home', applianceType: 'front_load_washer', highEfficiency: true,
    placements: ['detergent_compartment', 'softener_compartment', 'direct_to_drum'], supportedCycles: ['normal', 'delicate'],
    drumVolume: { amount: 4.5, unit: 'cu_ft' }, cycleMinutes: { normal: 55 }, provenance: taps,
  })
  const skipped = await as.mutation(api.inventory.createMachine, { householdId, name: 'Machine 12', location: 'shared', applianceType: 'top_load_washer', placements: ['direct_to_drum'], supportedCycles: ['normal'], pricePerStart: 3, provenance: taps })
  const dryer = await as.mutation(api.inventory.createMachine, { householdId, name: 'Dryer', location: 'shared', applianceType: 'tumble_dryer', cycleMinutes: { timed: 30 }, pricePerStart: 1.25, heatSettings: [{ heat: 'low', label: 'Low Temp' }], provenance: taps })
  const machine = async (machineId: string) => (await as.query(api.inventory.list, { householdId })).machines.find((entry) => entry.machineId === machineId)!

  expect(await machine(washer)).toMatchObject({
    location: 'home', pricePerStart: null, placements: ['detergent_compartment', 'softener_compartment', 'direct_to_drum'], supportedCycles: ['normal', 'delicate'],
    drumVolume: { amount: 4.5, unit: 'cu_ft' }, capacityUnits: 18, capacityConfidence: 'estimated', highEfficiency: true,
    cycleMinutes: { normal: { durationMinutes: 55, confidence: 'observed' } }, provenance: taps,
  })
  expect(await machine(skipped)).toMatchObject({ location: 'shared', pricePerStart: 3, drumVolume: null, capacityUnits: null, capacityConfidence: 'unknown', highEfficiency: null })
  expect(await machine(dryer)).toMatchObject({ location: 'shared', pricePerStart: 1.25, cycleMinutes: { timed: { durationMinutes: 30, confidence: 'observed' } } })

  // Litres convert too, to the nearest half; clearing the volume clears the about-size with it.
  await as.mutation(api.inventory.updateMachine, { machineId: skipped, drumVolume: { amount: 100, unit: 'l' } })
  expect(await machine(skipped)).toMatchObject({ drumVolume: { amount: 100, unit: 'l' }, capacityUnits: 14, capacityConfidence: 'estimated' })
  await as.mutation(api.inventory.updateMachine, { machineId: washer, drumVolume: null })
  expect(await machine(washer)).toMatchObject({ drumVolume: null, capacityUnits: null, capacityConfidence: 'unknown' })

  await expect(as.mutation(api.inventory.updateMachine, { machineId: washer, drumVolume: { amount: 0.4, unit: 'cu_ft' } })).rejects.toThrow('between 0.5 and 12 cu. ft.')
  await expect(as.mutation(api.inventory.updateMachine, { machineId: washer, drumVolume: { amount: 351, unit: 'l' } })).rejects.toThrow('between 15 and 350 litres')
  await expect(as.mutation(api.inventory.updateMachine, { machineId: washer, drumVolume: { amount: 4, unit: 'cu_ft' }, capacityUnits: 12 })).rejects.toThrow('not both')
  await expect(as.mutation(api.inventory.updateMachine, { machineId: skipped, pricePerStart: 0 })).rejects.toThrow('Price per start')
  await expect(as.mutation(api.inventory.updateMachine, { machineId: skipped, pricePerStart: 100.5 })).rejects.toThrow('Price per start')

  // A washer whose size was skipped still plans, by an about-size.
  const [tee] = await as.mutation(api.inventory.createTextiles, { householdId, name: 'Tee', quantity: 1, status: 'dirty', soilLevel: 'normal', kind: 't_shirt', tag: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, dryMethod: 'line_dry' } })
  await as.mutation(api.inventory.updateMachine, { machineId: skipped, archived: true })
  const planned = await planFor(as, householdId, [tee!])
  expect(planned.result.loads[0]).toMatchObject({ machineId: washer, loadSize: null })
})

test('an answer given at the machine keeps a plan under way; an edit that can change its loads does not', async () => {
  const t = newBackend()
  const as = signedIn(t, 'machine-answer-user')
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Home', displayName: 'Pat' })
  const washer = await as.mutation(api.inventory.createMachine, {
    householdId, name: 'Washer', location: 'home', applianceType: 'front_load_washer', placements: ['detergent_compartment', 'direct_to_drum'],
    supportedCycles: ['normal', 'delicate'], cycleMinutes: { normal: 50 }, provenance: { source: 'machine_taps', confidence: 'observed' },
  })
  const jerseys = await as.mutation(api.inventory.createTextiles, {
    householdId, name: 'Soccer jersey', quantity: 2, status: 'dirty', soilLevel: 'normal', kind: 'workout', colorGroup: 'light',
    tag: { washMethod: 'machine', maxTemperatureC: 40, cycle: 'normal', dryMethod: 'line_dry' },
  })
  const tide = await as.mutation(api.inventory.createSupply, {
    householdId, name: 'Tide Original', use: 'detergent', kind: 'chemical', measure: { kind: 'cap', marks: [{ label: '1' }, { label: '3' }, { label: '5' }] },
    safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] },
    formulation: { name: 'Tide Original', form: 'liquid' }, provenance: { source: 'label_taps', confidence: 'observed' },
  })
  // Two loads, each dosed at the machine by how full the drum is.
  const made = await as.mutation(api.plans.recompute, {
    householdId, selectedTextileIds: jerseys, clientInputHash: 'two-loads',
    loadPins: [{ textileId: jerseys[0]!, group: 1 }, { textileId: jerseys[1]!, group: 2 }],
    dismissedQuestions: [{ kind: 'label_row', subjectId: tide, context: { soilLevel: 'normal' }, answer: 'depends_on_size' }],
  })
  const planned = (await as.query(api.plans.get, { planId: made.planId }))!
  expect(planned.result.loads).toHaveLength(2)
  const [first, second] = planned.result.loads
  await startLoad(as, { planId: made.planId, loadId: first!.id, idempotencyKey: 'load-1' })
  const current = async () => (await as.query(api.plans.get, { planId: made.planId }))!

  // Load 1 of 2 at the machine: a line from the cap and the washer's HE logo leave the plan and load 2 as they were.
  await as.mutation(api.inventory.answerLabelRow, { supplyId: tide, context: { loadSize: 'large', soilLevel: 'normal' }, dose: { amount: 1, unit: 'cap', mark: '5' }, rowText: 'Large load' })
  await as.mutation(api.inventory.updateMachine, { machineId: washer, highEfficiency: true })
  const kept = await current()
  expect(kept.status).toBe('used')
  expect(kept.result.loads.map((load) => [load.id, load.textileIds])).toEqual([[first!.id, first!.textileIds], [second!.id, second!.textileIds]])
  expect(kept.loadStates.find((state) => state.loadId === second!.id)?.startable).toBe(true)
  // Load 2 reads the line now on record.
  const tideStep = kept.result.loads[1]!.treatments.find((step) => step.supplyId === tide)
  expect(tideStep?.atMachine?.candidates.map((candidate) => [candidate.size, candidate.dose.mark])).toEqual([['large', '5']])
  const next = await startLoad(as, { planId: made.planId, loadId: second!.id, idempotencyKey: 'load-2' })
  expect(next.status).toBe('running')

  // A drum of another size can change the loads, so the plan goes stale.
  await as.mutation(api.inventory.updateMachine, { machineId: washer, capacityUnits: 6 })
  expect((await current()).status).toBe('stale')
})

test('an answer at the machine that blocks a load already started leaves that load as it started', async () => {
  const t = newBackend()
  const as = signedIn(t, 'machine-answer-running-user')
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Home', displayName: 'Pat' })
  const washer = await as.mutation(api.inventory.createMachine, {
    householdId, name: 'Washer', location: 'home', applianceType: 'front_load_washer', placements: ['detergent_compartment', 'direct_to_drum'],
    supportedCycles: ['normal', 'delicate'], cycleMinutes: { normal: 50 }, provenance: { source: 'machine_taps', confidence: 'observed' },
  })
  await as.mutation(api.inventory.updateMachine, { machineId: washer, highEfficiency: true })
  const jerseys = await as.mutation(api.inventory.createTextiles, {
    householdId, name: 'Soccer jersey', quantity: 2, status: 'dirty', soilLevel: 'normal', kind: 'workout', colorGroup: 'light',
    tag: { washMethod: 'machine', maxTemperatureC: 40, cycle: 'normal', dryMethod: 'line_dry' },
  })
  const tide = await as.mutation(api.inventory.createSupply, {
    householdId, name: 'Tide Original', use: 'detergent', kind: 'chemical', measure: { kind: 'cap', marks: [{ label: '1' }, { label: '3' }, { label: '5' }] },
    safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] },
    formulation: { name: 'Tide Original', form: 'liquid' }, provenance: { source: 'label_taps', confidence: 'observed' },
  })
  // The cap's only line is for HE washers.
  await as.mutation(api.inventory.answerLabelRow, { supplyId: tide, context: { washerClass: 'he' }, sameForAll: true, dose: { amount: 1, unit: 'cap', mark: '3' } })
  const made = await as.mutation(api.plans.recompute, {
    householdId, selectedTextileIds: jerseys, clientInputHash: 'two-loads',
    loadPins: [{ textileId: jerseys[0]!, group: 1 }, { textileId: jerseys[1]!, group: 2 }],
  })
  const planned = (await as.query(api.plans.get, { planId: made.planId }))!
  expect(planned.result.loads.map((load) => load.status)).toEqual(['ready', 'ready'])
  const [first, second] = planned.result.loads
  const { sessionId } = await startLoad(as, { planId: made.planId, loadId: first!.id, idempotencyKey: 'load-1' })

  // At the machine the logo says it is not HE: the cap has no line for it, so a fresh plan would block load 1.
  await as.mutation(api.inventory.updateMachine, { machineId: washer, highEfficiency: false })
  const kept = (await as.query(api.plans.get, { planId: made.planId }))!
  expect(kept.status).toBe('used')
  expect(kept.result.loads[0]).toEqual(first)
  expect(kept.result.loads[1]!.id).toBe(second!.id)
  expect(kept.result.loads[1]!.status).toBe('needs_confirmation')

  // Load 1 carries on to the end with the steps it started with, and a Finish sent with the plan as
  // the phone last saw it (queued with no signal) still completes.
  expect(kept.inputHash).not.toBe(planned.inputHash)
  await finishSteps(as, sessionId)
  expect((await as.query(api.execution.sessionDetail, { sessionId })).machineStartedAt).not.toBeNull()
  await expect(as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'load-1' })).resolves.toMatchObject({ status: 'completed' })
})

test('a shared-room label entered at arrival becomes a machine like it, with its capacity unknown', async () => {
  const t = newBackend()
  const as = signedIn(t, 'label-at-arrival')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, location: 'shared', pricePerStart: 2.5 })
  const added = await as.mutation(api.inventory.addMachineLikeIt, { machineId: home.machine, name: '  Washer 7 ' })
  const machine = await t.run(async (ctx) => ctx.db.get(added))
  expect(machine).toMatchObject({ name: 'Washer 7', model: 'SWNNX2', applianceType: 'top_load_washer', location: 'shared', pricePerStart: 2.5, capacityConfidence: 'unknown', pool: 'available' })
  expect(machine?.capacityUnits, 'the fit is never assumed').toBeUndefined()
  expect(await as.mutation(api.inventory.addMachineLikeIt, { machineId: home.machine, name: 'washer 7' }), 'the same label twice is the same machine').toBe(added)
  await expect(as.mutation(api.inventory.addMachineLikeIt, { machineId: home.machine, name: '   ' })).rejects.toThrow()
  await expect(signedIn(t, 'label-stranger').mutation(api.inventory.addMachineLikeIt, { machineId: home.machine, name: 'Washer 8' })).rejects.toThrow()
})

test('water is saved by members only, keeps other planning settings, and re-plans', async () => {
  // EBMUD's 2025 report stops counting after 2026, so the clock is pinned.
  vi.useFakeTimers()
  vi.setSystemTime(Date.UTC(2026, 9, 6))
  onTestFinished(() => { vi.useRealTimers() })
  const t = newBackend()
  const as = signedIn(t, 'water-owner')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.setPlanning, { householdId: home.householdId, babySeparate: false })
  const planned = await planFor(as, home.householdId, [home.shirt])
  const water = { zip: '94596', utility: 'ebmud' as const, area: 'walnut_creek', source: 'lookup' as const }
  await expect(signedIn(t, 'water-outsider').mutation(api.inventory.setWater, { householdId: home.householdId, water })).rejects.toThrow('Forbidden')
  await expect(t.mutation(api.inventory.setWater, { householdId: home.householdId, water })).rejects.toThrow('Unauthenticated')
  await expect(as.mutation(api.inventory.setWater, { householdId: home.householdId, water: { ...water, zip: '9459' } })).rejects.toThrow('five digits')
  await expect(as.mutation(api.inventory.setWater, { householdId: home.householdId, water: { ...water, source: 'strip' } })).rejects.toThrow('reading')
  await expect(as.mutation(api.inventory.setWater, { householdId: home.householdId, water: { ...water, source: 'utility_report', reading: { value: 40, unit: 'mg_l' } } })).rejects.toThrow('year of the report')
  await expect(as.mutation(api.inventory.setWater, { householdId: home.householdId, water: { ...water, source: 'utility_report', reading: { value: 40, unit: 'mg_l', reportYear: 3000 } } })).rejects.toThrow('out of range')
  expect((await t.run((ctx) => ctx.db.get(planned.planId)))?.status).not.toBe('stale')

  await as.mutation(api.inventory.setWater, { householdId: home.householdId, water })
  expect((await as.query(api.inventory.list, { householdId: home.householdId })).planning).toMatchObject({ babySeparate: false, water: { ...water, band: 'soft', mgL: 27 } })
  expect((await t.run((ctx) => ctx.db.get(planned.planId)))?.status).toBe('stale')
  const soft = await planFor(as, home.householdId, [home.shirt])
  expect(soft.inputHash, 'qualifying soft water is planner input').not.toBe(planned.inputHash)
  const again = await planFor(as, home.householdId, [home.shirt])
  expect(again.inputHash, 'and it changes the input once, not on every plan').toBe(soft.inputHash)

  await as.mutation(api.inventory.setWater, { householdId: home.householdId, water: { ...water, source: 'strip', reading: { value: 9, unit: 'gpg' } } })
  expect((await as.query(api.inventory.list, { householdId: home.householdId })).planning.water).toMatchObject({ band: 'hard', mgL: 153 })
  expect((await t.run((ctx) => ctx.db.get(again.planId)))?.status).toBe('stale')
  expect((await planFor(as, home.householdId, [home.shirt])).inputHash, 'water that is not soft leaves the input as it was').toBe(planned.inputHash)
})

test('a soft-water window that ends re-plans once, unless newer water was saved', async () => {
  vi.useFakeTimers()
  const start = Date.UTC(2026, 9, 6)
  const day = 24 * 60 * 60 * 1000
  vi.setSystemTime(start)
  try {
    const t = newBackend()
    const as = signedIn(t, 'water-window')
    const home = await intakeHousehold(as)
    // EBMUD's harder plant can serve an unknown area, so only a strip makes it soft, for 30 days.
    const strip = { zip: '94596', utility: 'ebmud' as const, area: 'not_sure', source: 'strip' as const, reading: { value: 2, unit: 'gpg' as const } }
    await as.mutation(api.inventory.setWater, { householdId: home.householdId, water: strip })
    const scheduled = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect())
    expect(scheduled.filter((job) => job.name.includes('waterWindowEnded')).map((job) => [job.scheduledTime, job.args[0]])).toEqual([[start + 30 * day + 1, { householdId: home.householdId, setAt: start }]])
    const planned = await planFor(as, home.householdId, [home.shirt])
    await t.mutation(internal.inventory.waterWindowEnded, { householdId: home.householdId, setAt: start })
    expect((await t.run((ctx) => ctx.db.get(planned.planId)))?.status, 'an early run changes nothing').not.toBe('stale')

    vi.setSystemTime(start + 30 * day + 1)
    await t.mutation(internal.inventory.waterWindowEnded, { householdId: home.householdId, setAt: start })
    expect((await t.run((ctx) => ctx.db.get(planned.planId)))?.status, 'the window ended: the plan is re-read').toBe('stale')
    const lapsed = await planFor(as, home.householdId, [home.shirt])
    expect(lapsed.inputHash).not.toBe(planned.inputHash)

    // A job from water that was replaced since changes nothing.
    await as.mutation(api.inventory.setWater, { householdId: home.householdId, water: { ...strip, reading: { value: 9, unit: 'gpg' } } })
    const current = await planFor(as, home.householdId, [home.shirt])
    await t.mutation(internal.inventory.waterWindowEnded, { householdId: home.householdId, setAt: start })
    expect((await t.run((ctx) => ctx.db.get(current.planId)))?.status).not.toBe('stale')
  } finally {
    vi.useRealTimers()
  }
})

test('pre-owned intake keeps the chosen status with dye unknown, and heat treatment needs a tag that allows high heat', async () => {
  const t = newBackend()
  const as = signedIn(t, 'thrift-owner')
  const home = await intakeHousehold(as)
  const tag = { washMethod: 'machine' as const, cycle: 'normal', maxTemperatureC: 40, dryMethod: 'tumble_dry' as const, dryHeat: 'high' as const, bleach: 'non_chlorine' as const }
  const base = { householdId: home.householdId, name: 'Thrifted tee', quantity: 1, tag, colorGroup: 'dark' as const, material: 'cotton' }
  const [readyId] = await as.mutation(api.inventory.createTextiles, { ...base, status: 'clean', preOwned: {} })
  expect(await t.run((ctx) => ctx.db.get(readyId!))).toMatchObject({ status: 'clean', dyeRun: 'unknown', preOwned: {} })
  await expect(as.mutation(api.inventory.createTextiles, { ...base, status: 'dirty', tag: { ...tag, dryHeat: 'low' }, preOwned: { heatTreat: true } })).rejects.toThrow('allows high heat')
  // Whatever the client says about dye, a pre-owned piece is "not sure" until a wash proves it.
  const [id] = await as.mutation(api.inventory.createTextiles, { ...base, status: 'dirty', dyeRun: 'fast', firstWash: false, preOwned: { smell: 'musty', heatTreat: true } })
  const row = await t.run(async (ctx) => ctx.db.get(id!))
  expect(row).toMatchObject({ status: 'dirty', dyeRun: 'unknown', preOwned: { smell: 'musty', heatTreat: true } })
  expect(row?.firstWash).toBeUndefined()
  expect((await as.query(api.inventory.list, { householdId: home.householdId })).textiles.find((item) => item.textileId === id)?.preOwned).toEqual({ smell: 'musty', heatTreat: true })
  const planned = await planFor(as, home.householdId, [id!])
  const tips = planned.result.loads.flatMap((load) => load.garmentAdvice ?? []).map((tip) => tip.tipId).sort()
  expect(tips).toEqual(['pre_owned_heat', 'pre_owned_musty', 'pre_owned_rinse'])
})

test('two heat tips in one load get their own steps, and recording one leaves the other pending', async () => {
  const t = newBackend()
  const as = signedIn(t, 'thrift-two-heat')
  const home = await intakeHousehold(as)
  const tag = { washMethod: 'machine' as const, cycle: 'normal', maxTemperatureC: 40, dryMethod: 'tumble_dry' as const, dryHeat: 'high' as const, bleach: 'non_chlorine' as const }
  const base = { householdId: home.householdId, quantity: 1, tag, colorGroup: 'dark' as const, material: 'cotton', status: 'dirty' as const, preOwned: { heatTreat: true } }
  const [clean] = await as.mutation(api.inventory.createTextiles, { ...base, name: 'Thrifted tee' })
  const [stained] = await as.mutation(api.inventory.createTextiles, { ...base, name: 'Thrifted shirt' })
  await as.mutation(api.closet.flagDirty, { textileIds: [stained!], reasons: ['food'], soilLevel: 'normal', stainNote: 'collar' })
  const planned = await planFor(as, home.householdId, [clean!, stained!])
  const load = planned.result.loads.find((row) => (row.garmentAdvice ?? []).filter((tip) => tip.scope === 'pre_owned_heat').length === 2)!
  expect(load).toBeDefined()
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: load.id, idempotencyKey: 'two-heat' })
  const heat = async () => (await t.run(async (ctx) => (await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique())!)).actions
    .filter((step) => step.kind === 'task' && step.task === 'garment_advice' && step.advice?.scope === 'pre_owned_heat')
  const steps = await heat()
  expect(steps.map((step) => step.id)).toEqual([`${load.id}:garment-advice:pre_owned_heat`, `${load.id}:garment-advice:pre_owned_heat:1`])
  await as.mutation(api.actions.recordAction, { sessionId, actionId: steps[1]!.id, status: 'confirmed' })
  expect((await heat()).map((step) => step.status)).toEqual(['pending', 'confirmed'])
})

test('a fragile pre-owned piece is held out of the plan for hand washing or a cleaner', async () => {
  const t = newBackend()
  const as = signedIn(t, 'thrift-fragile')
  const home = await intakeHousehold(as)
  const [id] = await as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'Vintage cardigan', quantity: 1, status: 'dirty', tag: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30 }, material: 'wool', preOwned: { fragile: true } })
  const planned = await planFor(as, home.householdId, [home.shirt, id!])
  expect(planned.result.loads.flatMap((load) => load.textileIds)).not.toContain(id)
  expect(planned.result.reasons.find((reason) => reason.code === 'care_prohibition')?.details).toMatchObject({ cause: 'pre_owned_fragile', method: 'hand_wash' })
})
