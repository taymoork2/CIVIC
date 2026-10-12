import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { isDryerPhase } from '@washcloset/planner'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { startLoad, dryingCare, intakeHousehold, joinHousehold, keyOf, label, newBackend, planFor, signedIn, type Backend, type Caller } from './harness.testing'
import { sessionlessRecipient } from './reminders'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 9, 1, 18, 0)) })
afterEach(() => { vi.useRealTimers() })

test('guidance completes after the entire recovered load is put away, retains completion and supports replay', async () => {
  const t = newBackend()
  const as = signedIn(t, 'guided-drying')
  const home = await sharedRoom(as)
  await as.mutation(api.households.setGuidance, { householdId: home.householdId, command: 'start', stage: 'laundry' })
  const sessionId = await washUntilDry(as, home.householdId, [home.tee, home.silk], home.washer3, 'guided-wash')
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const pieces = await t.run((ctx) => ctx.db.query('dryingPieces').collect())
  await t.run(async (ctx) => { for (const piece of pieces) await ctx.db.patch(piece._id, { status: 'dry' }) })
  const guidance = async () => (await as.query(api.households.onboardingStatus, {})).households[0]!.guidance!
  await as.mutation(api.dryingQueue.putAway, { householdId: home.householdId, pieceIds: [pieces[0]!._id] })
  expect((await guidance()).status).toBe('started')
  await as.mutation(api.dryingQueue.putAway, { householdId: home.householdId, pieceIds: [pieces[1]!._id] })
  expect((await guidance()).status).toBe('completed')
  const completedAt = (await guidance()).completedAt
  await as.mutation(api.households.setGuidance, { householdId: home.householdId, command: 'resume', stage: 'intent' })
  expect((await guidance()).status).toBe('completed')
  await as.mutation(api.households.setGuidance, { householdId: home.householdId, command: 'replay' })
  expect(await guidance()).toMatchObject({ status: 'started', stage: 'intent', completedAt })
})

test('the load detail tells each piece queued, dry or put away without changing completion', async () => {
  const t = newBackend()
  const as = signedIn(t, 'load-drying-state')
  const home = await sharedRoom(as)
  const sessionId = await washUntilDry(as, home.householdId, [home.tee, home.silk], home.washer3, 'load-state-wash')
  const drying = async () => new Map((await as.query(api.execution.sessionDetail, { sessionId })).textiles.map((piece) => [piece.textileId, piece.drying]))
  expect([...(await drying()).values()]).toEqual([undefined, undefined])
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const tee = (await t.run((ctx) => ctx.db.query('dryingPieces').collect())).find((piece) => piece.textileId === home.tee)!
  await t.run((ctx) => ctx.db.patch(tee._id, { status: 'dry' }))
  expect(await drying()).toEqual(new Map([[home.tee, 'dry'], [home.silk, 'queued']]))
  await as.mutation(api.dryingQueue.putAway, { householdId: home.householdId, pieceIds: [tee._id] })
  expect(await drying()).toEqual(new Map([[home.tee, 'put_away'], [home.silk, 'queued']]))
  expect((await as.query(api.execution.sessionDetail, { sessionId })).status).toBe('completed')
})

/** Starts the first load of these garments on `machineId` and records every wash step, stopping before drying. */
async function washUntilDry(as: Caller, householdId: Id<'households'>, textileIds: Id<'textiles'>[], machineId: Id<'machines'>, key: string) {
  const planned = await planFor(as, householdId, textileIds)
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: key, machineId })
  for (;;) {
    const detail = await as.query(api.execution.sessionDetail, { sessionId })
    const step = detail.actions.find((action) => action.status === 'pending' && !isDryerPhase(action.phase))
    if (step === undefined) return sessionId
    if (step.kind === 'task') await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed' })
    else await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'skipped' })
  }
}

/** A shared room: two washers, a 6-unit dryer and a dryer with no capacity recorded; towels (2 units each) and two tees. */
async function sharedRoom(as: Caller, location: 'shared' | 'home' = 'shared') {
  const { householdId } = await as.mutation(api.households.createHousehold, { name: 'Flat', displayName: 'Pat' })
  const washer = (name: string) => as.mutation(api.inventory.createMachine, { householdId, name, applianceType: 'top_load_washer', location, capacityUnits: 20, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['direct_to_drum'], cycleMinutes: { normal: 30 }, provenance: label('washer plate') })
  const dryer = (name: string, capacity: number | null) => as.mutation(api.inventory.createMachine, {
    householdId, name, applianceType: 'tumble_dryer', location,
    ...(capacity === null ? { capacityConfidence: 'unknown' as const } : { capacityUnits: capacity, capacityConfidence: 'verified' as const }),
    heatSettings: [{ heat: 'high', label: 'Hot' }, { heat: 'medium', label: 'Medium' }, { heat: 'low', label: 'Delicate' }], cycleMinutes: { timed: 45 }, provenance: label('dryer plate'),
  })
  const detergent = await as.mutation(api.inventory.createSupply, { householdId, name: 'Tide HE liquid', kind: 'chemical', use: 'detergent', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'HE liquid', form: 'liquid', highEfficiencyCompatible: true }, provenance: label('Tide bottle label') })
  await as.mutation(api.inventory.saveRule, { supplyId: detergent, dose: { amount: 30, unit: 'ml' }, stage: 'wash', placement: 'direct_to_drum', timing: 'before loading garments', provenance: label('Tide bottle label') })
  const washer3 = await washer('Washer 3')
  const washer5 = await washer('Washer 5')
  const dryer4 = await dryer('Dryer 4', 6)
  const dryer9 = await dryer('Dryer 9', null)
  const garment = async (name: string, bulkUnits: number, heat: 'low' | 'medium' | 'high') => {
    const id = await as.mutation(api.inventory.createTextile, { householdId, name, color: 'White', colorGroup: 'light', firstWash: false, bulkUnits })
    await dryingCare(as, id, 'tumble_dry', heat)
    return id
  }
  const towels = [await garment('Towel 1', 2, 'high'), await garment('Towel 2', 2, 'high'), await garment('Towel 3', 2, 'high')]
  const tee = await garment('Tee', 1, 'high')
  const silk = await garment('Silk top', 1, 'low')
  const wool = await as.mutation(api.inventory.createTextile, { householdId, name: 'Wool jumper', color: 'White', colorGroup: 'light', firstWash: false })
  await dryingCare(as, wool, 'dry_flat')
  return { householdId, washer3, washer5, dryer4, dryer9, towels, tee, silk, wool }
}

const queueOf = (as: Caller, householdId: Id<'households'>, extra: { combine?: boolean; capacityUnits?: number | null } = {}) => as.query(api.dryingQueue.queue, { householdId, ...extra })

test('a dryer suggestion, displayed timer and confirmed dryness remain separate historical facts', async () => {
  const t = newBackend()
  const as = signedIn(t, 'dryer-suggestion')
  const room = await sharedRoom(as)
  const sessionId = await washUntilDry(as, room.householdId, [room.tee], room.washer3, 'suggestion-wash')
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const queued = await queueOf(as, room.householdId)
  expect(queued.dryers.find((dryer) => dryer.machineId === room.dryer4)?.programTime).toMatchObject({ durationMinutes: 45 })
  const pieceId = queued.pieces[0]!.pieceId
  const { runId } = await as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: [pieceId], dryerId: room.dryer4, minutes: 35 })
  expect(await t.run((ctx) => ctx.db.get(runId))).toMatchObject({ minutes: 35, durationSuggestion: { version: 1, minutes: 45, basis: 'recorded_program' } })
  await as.mutation(api.inventory.updateMachine, { machineId: room.dryer4, cycleMinutes: { timed: 90 } })
  vi.advanceTimersByTime(36 * 60_000)
  expect((await queueOf(as, room.householdId)).pieces[0]?.status).toBe('drying')
  // The load page learns when the displayed timer ran out: a check is due, the piece is still drying.
  const run = (await t.run((ctx) => ctx.db.get(runId)))!
  const timed = await as.query(api.execution.sessionDetail, { sessionId })
  expect(timed.dryerCheckAt).toBe(run.startedAt + 35 * 60_000)
  expect(timed.textiles[0]?.drying).toBe('drying')
  await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [pieceId] })
  expect((await as.query(api.execution.sessionDetail, { sessionId })).dryerCheckAt).toBeUndefined()
  const record = (await t.run((ctx) => ctx.db.query('washRecords').collect()))[0]!
  expect(record.drying).toMatchObject({ outcome: 'tumble_dried', minutes: 35, durationSuggestion: { minutes: 45 } })
  expect(await t.run((ctx) => ctx.db.get(runId))).toMatchObject({ status: 'done', durationSuggestion: { minutes: 45 } })
})

test('pieces from two washers queue once each, plan dryer loads across washers by heat, and keep their washer', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'drying-queue')
  const room = await sharedRoom(as)
  const first = await washUntilDry(as, room.householdId, [...room.towels, room.silk], room.washer3, 'w3')
  expect((await as.query(api.execution.sessionDetail, { sessionId: first })).machineStartedAt).not.toBeNull()
  // Repeated taps never queue the same wash twice.
  expect(await as.mutation(api.dryingQueue.queueFromWasher, { sessionId: first })).toEqual({ queued: 4, already: false })
  expect(await as.mutation(api.dryingQueue.queueFromWasher, { sessionId: first })).toEqual({ queued: 4, already: true })
  const second = await washUntilDry(as, room.householdId, [room.tee, room.wool], room.washer5, 'w5')
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId: second })

  const queue = await queueOf(as, room.householdId, { capacityUnits: null })
  expect(queue.pieces.map((piece) => [piece.name, piece.washerName, piece.status])).toEqual([
    ['Towel 1', 'Washer 3', 'queued'], ['Towel 2', 'Washer 3', 'queued'], ['Towel 3', 'Washer 3', 'queued'], ['Silk top', 'Washer 3', 'queued'],
    ['Tee', 'Washer 5', 'queued'], ['Wool jumper', 'Washer 5', 'queued'],
  ])
  const name = (id: string) => queue.pieces.find((piece) => piece.pieceId === id)!.name
  // Unknown capacity: grouped by heat only, fit not checked; compatible pieces from both washers share a load.
  expect(queue.plan.loads.map((load) => [load.heat, load.pieceIds.map(name).sort(), load.sources, load.fit])).toEqual([
    ['low', ['Silk top'], ['Washer 3'], 'not_checked'],
    ['high', ['Tee', 'Towel 1', 'Towel 2', 'Towel 3'], ['Washer 3', 'Washer 5'], 'not_checked'],
  ])
  expect(queue.plan.natural.map((entry) => [name(entry.pieceId), entry.method])).toEqual([['Wool jumper', 'flat']])
  expect((await queueOf(as, room.householdId, { combine: true, capacityUnits: null })).plan.loads.map((load) => load.heat), 'All on low heat').toEqual(['low'])
  // The sharing line counts both ways, whichever is picked. This "Tee" has no garment kind recorded, so it is not flagged as knit.
  expect(queue.share, 'offered, counted apart and together').toEqual({ separate: 2, together: 1, heat: 'low', knitIds: [] })
  expect((await queueOf(as, room.householdId, { capacityUnits: 6 })).share).toMatchObject({ separate: 3, together: 2 })
  // Planned for the 6-unit dryer, the high-heat group splits.
  expect((await queueOf(as, room.householdId, { capacityUnits: 6 })).plan.loads.map((load) => [load.heat, load.bulkUnits, load.fit])).toEqual([['low', 1, 'fits'], ['high', 6, 'fits'], ['high', 1, 'fits']])
})

/** Starts the silk top (a low tag) on Dryer 4 as stored, and returns the heat button it was given. */
async function silkHeatOn(as: Caller, t: Backend, room: Awaited<ReturnType<typeof sharedRoom>>, tag: string) {
  const sessionId = await washUntilDry(as, room.householdId, [room.silk], room.washer3, tag)
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const silk = (await queueOf(as, room.householdId)).pieces.find((piece) => piece.name === 'Silk top')!.pieceId
  const { runId } = await as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: [silk], dryerId: room.dryer4, minutes: 30 })
  const run = (await t.run((ctx) => ctx.db.get(runId)))!
  return [run.heat, run.heatLabel]
}

const buttons = [{ heat: 'high' as const, label: 'Hot' }, { heat: 'delicate' as const, label: 'Delicates' }, { heat: 'low' as const, label: 'Low' }]

test('a low tag takes Delicates on the owner\'s dryer model, whose documented Low is 145 F', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'drying-low-heat')
  const room = await sharedRoom(as)
  await as.mutation(api.inventory.updateMachine, { machineId: room.dryer4, model: 'SSGNCFGW113TW01', heatSettings: buttons })
  // The queue carries the spec sheet's temperatures (Speed Queen D514575ENR11), never a stored one.
  const sent = (await queueOf(as, room.householdId)).dryers.find((dryer) => dryer.machineId === room.dryer4)!
  expect(sent.heatSettings.map((setting) => [setting.heat, setting.tempF])).toEqual([['delicate', 115], ['low', 145], ['high', 160]])
  expect(await silkHeatOn(as, t, room, 'low-heat')).toEqual(['delicate', 'Delicates'])
})

test('a dryer button temperature written to a stored row is ignored', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'drying-stored-temp')
  const room = await sharedRoom(as)
  await as.mutation(api.inventory.updateMachine, { machineId: room.dryer4, heatSettings: buttons })
  // A row saved before temperatures were retired says Low is cool; no model documents it, so Low stays unknown.
  await t.run((ctx) => ctx.db.patch(room.dryer4, { heatSettings: buttons.map((setting) => setting.heat === 'low' ? { ...setting, tempF: 100 } : setting) }))
  expect((await queueOf(as, room.householdId)).dryers.find((dryer) => dryer.machineId === room.dryer4)!.heatSettings.every((setting) => !('tempF' in setting))).toBe(true)
  expect(await silkHeatOn(as, t, room, 'stored-temp')).toEqual(['delicate', 'Delicates'])
})

test('a dryer without a cooler button keeps low for a low tag', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'drying-low-only')
  const room = await sharedRoom(as)
  const sessionId = await washUntilDry(as, room.householdId, [room.silk], room.washer3, 'low-only')
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const silk = (await queueOf(as, room.householdId)).pieces.find((piece) => piece.name === 'Silk top')!.pieceId
  const { runId } = await as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: [silk], dryerId: room.dryer4, minutes: 30 })
  expect(await t.run((ctx) => ctx.db.get(runId))).toMatchObject({ heat: 'low', heatLabel: 'Delicate' })
})

test('the dryer entered at the machine takes what fits; the rest stays queued; dryness and put-away are partial', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'drying-fit')
  const room = await sharedRoom(as)
  const sessionId = await washUntilDry(as, room.householdId, [...room.towels, room.tee], room.washer3, 'w3')
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const queue = await queueOf(as, room.householdId, { capacityUnits: null })
  const byName = (name: string) => queue.pieces.find((piece) => piece.name === name)!.pieceId
  const load = queue.plan.loads[0]!
  await expect(as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: [...load.pieceIds] as Id<'dryingPieces'>[], dryerId: room.dryer4, minutes: 0 })).rejects.toThrow('minutes')

  // Dryer 4 holds 6 units: three towels go in, the tee stays queued.
  const started = await as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: ['Towel 1', 'Towel 2', 'Towel 3', 'Tee'].map(byName), dryerId: room.dryer4, minutes: 45 })
  expect([started.going.length, started.staying, started.fit]).toEqual([3, [byName('Tee')], 'fits'])
  const after = await queueOf(as, room.householdId, { capacityUnits: null })
  expect(after.pieces.filter((piece) => piece.status === 'queued').map((piece) => piece.name)).toEqual(['Tee'])
  expect(after.runs).toMatchObject([{ kind: 'dryer', dryerName: 'Dryer 4', heatLabel: 'Hot', minutes: 45 }])

  // An unknown-capacity dryer takes the rest without claiming it fits.
  expect((await as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: [byName('Tee')], dryerId: room.dryer9, minutes: 30 })).fit).toBe('not_checked')

  // At the end, two towels are dry; one is damp and needs the extra minutes.
  vi.advanceTimersByTime(45 * 60_000)
  await expect(as.mutation(api.dryingQueue.checkDry, { runId: started.runId, dryPieceIds: [byName('Towel 1'), byName('Towel 2')] })).rejects.toThrow('minutes')
  expect(await as.mutation(api.dryingQueue.checkDry, { runId: started.runId, dryPieceIds: [byName('Towel 1'), byName('Towel 2')], extraMinutes: 10 })).toEqual({ dry: 2, damp: 1, hung: 0 })
  const record = await t.run(async (ctx) => (await ctx.db.query('washRecords').collect()).find((entry) => entry.textileId === room.towels[0]))
  expect(record).toMatchObject({ washerName: 'Washer 3', drying: { outcome: 'tumble_dried', dryerName: 'Dryer 4', heat: 'high', minutes: 45 } })

  // Put away one of the two: the other stays dry and waiting, still from Washer 3.
  expect(await as.mutation(api.dryingQueue.putAway, { householdId: room.householdId, pieceIds: [byName('Towel 1')] })).toEqual({ putAway: 1 })
  const left = await queueOf(as, room.householdId, { capacityUnits: null })
  expect(left.pieces.map((piece) => [piece.name, piece.status, piece.washerName, piece.driedIn])).toEqual([
    ['Towel 2', 'dry', 'Washer 3', 'Dryer 4'], ['Towel 3', 'drying', 'Washer 3', null], ['Tee', 'drying', 'Washer 3', null],
  ])
  expect(await t.run(async (ctx) => (await ctx.db.get(room.towels[0]!))!.status)).toBe('clean')
  expect(await t.run(async (ctx) => (await ctx.db.get(room.towels[1]!))!.status), 'dry but not put away').toBe('hanging')
  await expect(as.mutation(api.dryingQueue.putAway, { householdId: room.householdId, pieceIds: [byName('Towel 3')] })).rejects.toThrow('dry piece')
})

test('Air dry, Own dryer load and Merge back change only the grouping; strangers see nothing', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'drying-moves')
  const room = await sharedRoom(as)
  const sessionId = await washUntilDry(as, room.householdId, [room.towels[0]!, room.tee], room.washer3, 'w3')
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const queue = await queueOf(as, room.householdId, { capacityUnits: null })
  const tee = queue.pieces.find((piece) => piece.name === 'Tee')!.pieceId
  await as.mutation(api.dryingQueue.setPiece, { pieceId: tee, own: true })
  expect((await queueOf(as, room.householdId, { capacityUnits: null })).plan.loads.map((load) => load.pieceIds.length)).toEqual([1, 1])
  await as.mutation(api.dryingQueue.setPiece, { pieceId: tee, own: false, air: true })
  const moved = await queueOf(as, room.householdId, { capacityUnits: null })
  expect([moved.plan.loads.length, moved.plan.natural]).toEqual([1, [{ pieceId: tee, method: 'rack_line' }]])
  await expect(as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: [tee], dryerId: room.dryer4, minutes: 20 })).rejects.toThrow('dry another way')
  const runId = await as.mutation(api.dryingQueue.startAirDry, { householdId: room.householdId, pieceIds: [tee] })
  expect(await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [tee] })).toEqual({ dry: 1, damp: 0, hung: 0 })
  const record = await t.run(async (ctx) => (await ctx.db.query('washRecords').collect()).find((entry) => entry.textileId === room.tee))
  expect(record?.drying).toMatchObject({ outcome: 'left_hanging', method: 'rack_line', scope: 'once', evidence: 'not_specified', label: 'tumble_dry',
    activityContext: { runId, start: { products: [], load: { pieceCount: 1, bulkUnits: 1, fit: 'not_checked' } }, displayedStarts: [{ startedAt: Date.now() }], checkedAt: Date.now(), telemetry: false } })
  expect(record?.drying.activityContext?.start.machine).toBeUndefined()

  const stranger = signedIn(t, 'drying-stranger')
  await expect(stranger.query(api.dryingQueue.queue, { householdId: room.householdId })).rejects.toThrow()
  await expect(stranger.mutation(api.dryingQueue.setPiece, { pieceId: tee, air: false })).rejects.toThrow()
})

test('a stained piece air dries until someone checks the stain is gone, and the dryer refuses it until then', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'drying-stain')
  const room = await sharedRoom(as)
  const sessionId = await washUntilDry(as, room.householdId, [room.tee], room.washer3, 'stain')
  // A stain noted on the piece by the time the wash finishes goes with it into the drying queue.
  await t.run(async (ctx) => ctx.db.patch(room.tee, { flag: { reasons: ['food'], flaggedBy: 'test', flaggedAt: Date.now() } }))
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const stained = (await queueOf(as, room.householdId)).pieces.find((piece) => piece.textileId === room.tee)!
  expect([stained.method, stained.source, stained.stained, stained.label]).toEqual(['rack_line', 'stain', true, 'tumble_dry'])
  await expect(as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: [stained.pieceId], dryerId: room.dryer4, minutes: 35 })).rejects.toThrow('stained')
  // Choosing the dryer for this time only does not outrank the stain.
  await as.mutation(api.dryingQueue.setPiece, { pieceId: stained.pieceId, method: 'tumble' })
  expect((await queueOf(as, room.householdId)).pieces.find((piece) => piece.pieceId === stained.pieceId)!.method).toBe('rack_line')
  // The wash never clears the stain silently: it waits for "Stain gone?".
  const check = await t.run(async (ctx) => (await ctx.db.get(room.tee))!.stainCheck)
  expect([check?.reason, check?.washes, check?.answer]).toEqual(['food', 1, undefined])
  await expect(signedIn(t, 'drying-stain-stranger').mutation(api.closet.answerStainCheck, { textileIds: [room.tee], answer: 'gone' })).rejects.toThrow()
  await as.mutation(api.closet.answerStainCheck, { textileIds: [room.tee], answer: 'still_there' })
  expect((await queueOf(as, room.householdId)).pieces.find((piece) => piece.pieceId === stained.pieceId)!.stained).toBe(true)
  expect((await t.run(async (ctx) => (await ctx.db.get(room.tee))!.stainCheck))?.answer).toBe('still_there')

  await as.mutation(api.closet.answerStainCheck, { textileIds: [room.tee], answer: 'gone' })
  expect(await t.run(async (ctx) => (await ctx.db.get(room.tee))!.stainCheck ?? null)).toBeNull()
  const checked = (await queueOf(as, room.householdId)).pieces.find((piece) => piece.pieceId === stained.pieceId)!
  expect([checked.method, checked.stained ?? false]).toEqual(['tumble', false])
  const { runId } = await as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: [stained.pieceId], dryerId: room.dryer4, minutes: 35 })
  expect(runId).toBeDefined()
})

test('an open stain check holds the piece out of dryer heat on its next wash, whatever it went back in the hamper for', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'drying-open-check')
  const room = await sharedRoom(as)
  // Answered "Lighter", then worn and flagged dirty for wear only: the stain is not gone.
  await t.run(async (ctx) => ctx.db.patch(room.tee, { status: 'dirty', flag: { reasons: ['worn'], flaggedBy: 'test', flaggedAt: Date.now() },
    stainCheck: { reason: 'food', kind: 'protein', tried: [], washes: 1, washedAt: Date.now() - 1, answer: 'lighter' } }))
  const planned = await planFor(as, room.householdId, [room.tee])
  expect(planned.result.loads[0]!.drying?.heldOut.map((held) => [held.textileId, held.reason])).toEqual([[room.tee, 'stain']])
  const sessionId = await washUntilDry(as, room.householdId, [room.tee], room.washer3, 'open-check')
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const piece = (await queueOf(as, room.householdId)).pieces.find((entry) => entry.textileId === room.tee)!
  expect([piece.stained, piece.method]).toEqual([true, 'rack_line'])
  await expect(as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: [piece.pieceId], dryerId: room.dryer4, minutes: 35 })).rejects.toThrow('stained')
  // The wash counts toward the stain's tries and asks again.
  const check = await t.run(async (ctx) => (await ctx.db.get(room.tee))!.stainCheck)
  expect([check?.washes, check?.answer]).toEqual([2, undefined])
})

test('"Stain gone?" on a guest piece releases its dryer hold, and says so only when something changed', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'drying-guest-stain')
  const room = await sharedRoom(as)
  const sessionId = await washUntilDry(as, room.householdId, [room.tee], room.washer3, 'guest-stain')
  await t.run(async (ctx) => ctx.db.patch(room.tee, { guest: true, flag: { reasons: ['food'], flaggedBy: 'test', flaggedAt: Date.now() } }))
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const piece = (await queueOf(as, room.householdId)).pieces.find((entry) => entry.textileId === room.tee)!
  expect(piece.stained).toBe(true)
  expect(await t.run(async (ctx) => (await ctx.db.get(room.tee))!.stainCheck ?? null)).toBeNull()
  expect(await as.mutation(api.closet.answerStainCheck, { textileIds: [room.tee], answer: 'gone' })).toEqual({ changed: 1 })
  expect((await queueOf(as, room.householdId)).pieces.find((entry) => entry.pieceId === piece.pieceId)!.stained ?? false).toBe(false)
  expect(await as.mutation(api.closet.answerStainCheck, { textileIds: [room.tee], answer: 'gone' })).toEqual({ changed: 0 })
})

test('a stain that stayed can go to a cleaner or be kept as a known mark, and gets one more try at most', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'stain-stayed')
  const room = await sharedRoom(as)
  const check = (washes: number) => ({ reason: 'food' as const, kind: 'protein' as const, tried: ['Tide stain remover'], washes, washedAt: Date.now(), answer: 'still_there' as const })
  await t.run(async (ctx) => {
    await ctx.db.patch(room.tee, { stainCheck: check(1) })
    await ctx.db.patch(room.towels[0]!, { stainCheck: check(2) })
    await ctx.db.patch(room.towels[1]!, { stainCheck: check(2) })
  })
  // One more try goes back to the hamper with what was already tried.
  expect(await as.mutation(api.closet.resolveStain, { textileIds: [room.tee], choice: 'try_again' })).toEqual({ changed: 1, skipped: 0 })
  const tee = await t.run(async (ctx) => (await ctx.db.get(room.tee))!)
  expect([tee.status, tee.flag?.reasons, tee.flag?.stainReport?.priorTreatmentAttempts, tee.stainCheck?.washes, tee.stainCheck?.answer]).toEqual(['dirty', ['food'], ['Tide stain remover'], 1, undefined])
  // After its tries, it goes to a cleaner with its note, or stays as a known mark.
  await expect(as.mutation(api.closet.resolveStain, { textileIds: [room.towels[0]!], choice: 'try_again' })).rejects.toThrow('had its tries')
  // A stain that got worse gets no home try, even on its first wash.
  await t.run(async (ctx) => ctx.db.patch(room.tee, { stainCheck: { ...check(1), answer: 'worse' } }))
  await expect(as.mutation(api.closet.resolveStain, { textileIds: [room.tee], choice: 'try_again' })).rejects.toThrow('got worse')
  await as.mutation(api.closet.resolveStain, { textileIds: [room.towels[0]!], choice: 'cleaner' })
  await as.mutation(api.closet.resolveStain, { textileIds: [room.towels[1]!], choice: 'keep' })
  const [cleaner, kept] = await t.run(async (ctx) => [(await ctx.db.get(room.towels[0]!))!, (await ctx.db.get(room.towels[1]!))!])
  expect([cleaner.status, cleaner.stainCheck?.tried]).toEqual(['needs_dry_clean', ['Tide stain remover']])
  expect([kept.stainCheck ?? null, kept.knownStain?.reason]).toEqual([null, 'food'])
})

test('a stain sent to the cleaner carries its note through drop-off, and "Stain gone?" is asked again after pickup', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'stain-cleaner-note')
  const room = await sharedRoom(as)
  const tried = [{ name: 'Enzyme spray', supplyId: 'enzyme', chemistry: 'protease' as const, washedOut: true as const }]
  await t.run(async (ctx) => ctx.db.patch(room.tee, { stainCheck: { reason: 'food', kind: 'protein', tried, washes: 1, washedAt: Date.now(), answer: 'still_there' } }))
  await as.mutation(api.closet.resolveStain, { textileIds: [room.tee], choice: 'cleaner' })
  const note = 'Food or drink stain after 1 wash. Tried Enzyme spray.'
  expect((await t.run(async (ctx) => (await ctx.db.get(room.tee))!)).cleanerNote).toBe(note)
  await as.mutation(api.closet.droppedAtCleaner, { textileIds: [room.tee] })
  expect((await t.run(async (ctx) => (await ctx.db.get(room.tee))!)).cleanerNote).toBe(note)
  await as.mutation(api.closet.pickedUp, { textileIds: [room.tee] })
  const back = await t.run(async (ctx) => (await ctx.db.get(room.tee))!)
  expect([back.status, back.stainCheck?.answer, back.stainCheck?.tried, back.stainCheck?.washes]).toEqual(['clean', undefined, tried, 1])
  expect(await as.mutation(api.closet.answerStainCheck, { textileIds: [room.tee], answer: 'gone' })).toEqual({ changed: 1 })
  // Taken off the cleaner list instead: the stain note goes with it and does not come back next time.
  await t.run(async (ctx) => ctx.db.patch(room.towels[0]!, { stainCheck: { reason: 'food', kind: 'protein', tried, washes: 1, washedAt: Date.now(), answer: 'still_there' } }))
  await as.mutation(api.closet.resolveStain, { textileIds: [room.towels[0]!], choice: 'cleaner' })
  await as.mutation(api.closet.unflag, { textileIds: [room.towels[0]!] })
  await as.mutation(api.closet.moveToDryCleaning, { textileIds: [room.towels[0]!] })
  expect((await t.run(async (ctx) => (await ctx.db.get(room.towels[0]!))!)).cleanerNote).toBeUndefined()
})

test('flagging a stain that stayed again keeps its home tries, its worse answer and what the app already tried', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'stain-flag-again')
  const room = await sharedRoom(as)
  const tried = [{ name: 'Enzyme spray', supplyId: 'enzyme', chemistry: 'protease' as const, washedOut: true as const }]
  const check = (washes: number, answer: 'lighter' | 'worse') => ({ reason: 'food' as const, kind: 'protein' as const, tried, washes, washedAt: Date.now(), answer })
  await t.run(async (ctx) => {
    await ctx.db.patch(room.tee, { stainCheck: check(1, 'worse') })
    await ctx.db.patch(room.towels[0]!, { stainCheck: check(2, 'lighter') })
    await ctx.db.patch(room.towels[1]!, { stainCheck: check(1, 'lighter') })
  })
  const flag = (textileId: Id<'textiles'>, priorTreatmentAttempts: string[]) => as.mutation(api.closet.flagDirty, { textileIds: [textileId], reasons: ['food'], soilLevel: 'normal', stainReport: { kind: 'protein', priorTreatmentAttempts } })
  await expect(flag(room.tee, [])).rejects.toThrow('got worse')
  await expect(flag(room.towels[0]!, [])).rejects.toThrow('had its tries')
  // Worn only is no stain flag: it goes in the hamper, and the open check still holds it out of the dryer.
  await as.mutation(api.closet.flagDirty, { textileIds: [room.tee], reasons: ['worn'], soilLevel: 'normal' })
  // "Not sure" stays not sure: the app's own records are not every try, so a retry still needs confirming.
  await as.mutation(api.closet.flagDirty, { textileIds: [room.towels[1]!], reasons: ['food'], soilLevel: 'normal', stainReport: { kind: 'protein', priorTreatmentAttempts: 'unknown' } })
  expect((await t.run(async (ctx) => (await ctx.db.get(room.towels[1]!))!)).flag?.stainReport?.priorTreatmentAttempts).toBe('unknown')
  await flag(room.towels[1]!, ['Dish soap'])
  const towel = await t.run(async (ctx) => (await ctx.db.get(room.towels[1]!))!)
  expect(towel.flag?.stainReport?.priorTreatmentAttempts).toEqual([...tried, 'Dish soap'])
})

test('a wash that has not started cannot be queued for drying', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'drying-not-started')
  const room = await sharedRoom(as)
  const planned = await planFor(as, room.householdId, [room.tee])
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'early', machineId: room.washer3 })
  await expect(as.mutation(api.dryingQueue.queueFromWasher, { sessionId })).rejects.toThrow('Start the washer first')
  expect((await queueOf(as, room.householdId)).pieces).toEqual([])
})

test('a garment group changes atomically, rejects mixed records and retains per-piece choices', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'drying-group')
  const room = await sharedRoom(as)
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId: await washUntilDry(as, room.householdId, [room.tee, room.towels[0]!], room.washer3, 'group') })
  const initial = await queueOf(as, room.householdId)
  const tee = initial.pieces.find((piece) => piece.textileId === room.tee)!.pieceId
  const towel = initial.pieces.find((piece) => piece.textileId === room.towels[0])!.pieceId
  // Two physical copies of one inventory record, preserving the actual wash source.
  const second = await t.run(async (ctx) => {
    const { _id, _creationTime, ...piece } = (await ctx.db.get(tee))!
    return ctx.db.insert('dryingPieces', piece)
  })
  await as.mutation(api.dryingQueue.setPiece, { pieceId: tee, pieceIds: [tee, second, second], method: 'rack_line', need: 'today' })
  let tees = (await queueOf(as, room.householdId)).pieces.filter((piece) => piece.textileId === room.tee)
  expect(tees.map((piece) => [piece.method, piece.source, piece.need])).toEqual([['rack_line', 'once', 'today'], ['rack_line', 'once', 'today']])
  // The single-piece API remains usable when one copy needs a different method.
  await as.mutation(api.dryingQueue.setPiece, { pieceId: second, method: 'flat' })
  tees = (await queueOf(as, room.householdId)).pieces.filter((piece) => piece.textileId === room.tee)
  expect(tees.map((piece) => piece.method)).toEqual(['rack_line', 'flat'])
  await expect(as.mutation(api.dryingQueue.setPiece, { pieceId: tee, pieceIds: [tee, towel], method: 'heated_hanging', remember: true })).rejects.toThrow('same garment')
  expect((await queueOf(as, room.householdId)).pieces.filter((piece) => piece.textileId === room.tee).map((piece) => piece.preference)).toEqual([null, null])
  await t.run(async (ctx) => ctx.db.patch(second, { status: 'dry' }))
  await expect(as.mutation(api.dryingQueue.setPiece, { pieceId: tee, pieceIds: [tee, second], method: 'tumble' })).rejects.toThrow('queued')
  expect((await queueOf(as, room.householdId)).pieces.find((piece) => piece.pieceId === tee)!.method).toBe('rack_line')
  await expect(signedIn(t, 'drying-group-stranger').mutation(api.dryingQueue.setPiece, { pieceId: tee, pieceIds: [tee], method: 'tumble' })).rejects.toThrow()
})

test('matching garments choose together as one group; a group with different labels or washers is refused', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'drying-matching')
  const room = await sharedRoom(as)
  const shirt = async (color: string, heat: 'low' | 'high') => {
    const id = await as.mutation(api.inventory.createTextile, { householdId: room.householdId, name: 'White T-shirt', color, colorGroup: 'light', firstWash: false })
    await dryingCare(as, id, 'tumble_dry', heat)
    return id
  }
  // "Grey" and "Gray" are the same garment identity; the third shirt's label caps the heat lower.
  const [first, second, lowHeat, otherWasher] = [await shirt('Grey', 'high'), await shirt('Gray', 'high'), await shirt('Gray', 'low'), await shirt('Gray', 'high')]
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId: await washUntilDry(as, room.householdId, [first, second], room.washer3, 'matching-1') })
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId: await washUntilDry(as, room.householdId, [lowHeat], room.washer3, 'matching-2') })
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId: await washUntilDry(as, room.householdId, [otherWasher], room.washer5, 'matching-3') })
  const pieces = (await queueOf(as, room.householdId)).pieces
  const pieceOf = (textileId: Id<'textiles'>) => pieces.find((piece) => piece.textileId === textileId)!.pieceId
  const shirts = async () => (await queueOf(as, room.householdId)).pieces.filter((piece) => piece.textileId === first || piece.textileId === second)

  // A method chosen for "White T-shirt · 2 pieces" applies to both, in one change.
  await as.mutation(api.dryingQueue.setPiece, { pieceId: pieceOf(first), pieceIds: [pieceOf(first), pieceOf(second)], method: 'rack_line', need: 'today' })
  expect((await shirts()).map((piece) => [piece.method, piece.source, piece.need])).toEqual([['rack_line', 'once', 'today'], ['rack_line', 'once', 'today']])
  await as.mutation(api.dryingQueue.setPiece, { pieceId: pieceOf(first), pieceIds: [pieceOf(first), pieceOf(second)], method: 'flat', remember: true })
  expect((await shirts()).map((piece) => [piece.method, piece.source, piece.preference])).toEqual([['flat', 'preference', 'flat'], ['flat', 'preference', 'flat']])
  await as.mutation(api.dryingQueue.setDryingPreference, { textileId: first, textileIds: [first, second], method: null })
  expect((await shirts()).map((piece) => [piece.method, piece.source, piece.preference])).toEqual([['tumble', 'label', null], ['tumble', 'label', null]])

  // Different labels never share one choice, and nothing in the group changes.
  await expect(as.mutation(api.dryingQueue.setPiece, { pieceId: pieceOf(first), pieceIds: [pieceOf(first), pieceOf(lowHeat)], method: 'rack_line' })).rejects.toThrow('different care labels')
  await expect(as.mutation(api.dryingQueue.setDryingPreference, { textileId: first, textileIds: [first, lowHeat], method: 'rack_line' })).rejects.toThrow('different care labels')
  await expect(as.mutation(api.dryingQueue.setPiece, { pieceId: pieceOf(first), pieceIds: [pieceOf(first), pieceOf(otherWasher)], method: 'rack_line' })).rejects.toThrow('same washer')
  expect((await queueOf(as, room.householdId)).pieces.map((piece) => [piece.method, piece.preference])).toEqual(Array(4).fill(['tumble', null]))
})

test('a one-time drying method ends at put-away; a remembered one is reused next wash until Follow label again', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'drying-methods')
  const room = await sharedRoom(as)
  const pieceOf = async (name: string) => (await queueOf(as, room.householdId)).pieces.find((piece) => piece.name === name && piece.status === 'queued')!
  const dryAndPutAway = async (pieceId: Id<'dryingPieces'>, method: 'rack_line' | 'flat') => {
    const runId = await as.mutation(api.dryingQueue.startAirDry, { householdId: room.householdId, pieceIds: [pieceId], method })
    await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [pieceId] })
    await as.mutation(api.dryingQueue.putAway, { householdId: room.householdId, pieceIds: [pieceId] })
  }

  // First wash: the tee's label allows the tumble dryer; "This time only" lays it flat.
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId: await washUntilDry(as, room.householdId, [room.tee], room.washer3, 'once-1') })
  let tee = await pieceOf('Tee')
  expect([tee.label, tee.method, tee.source]).toEqual(['tumble_dry', 'tumble', 'label'])
  await as.mutation(api.dryingQueue.setPiece, { pieceId: tee.pieceId, method: 'flat' })
  tee = await pieceOf('Tee')
  expect([tee.method, tee.source, tee.evidence]).toEqual(['flat', 'once', 'not_specified'])
  await dryAndPutAway(tee.pieceId, 'flat')

  // Second wash: the one-time choice expired with put-away; the label decides again.
  await as.mutation(api.closet.flagDirty, { textileIds: [room.tee], reasons: ['worn'], soilLevel: 'normal' })
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId: await washUntilDry(as, room.householdId, [room.tee], room.washer3, 'once-2') })
  tee = await pieceOf('Tee')
  expect([tee.method, tee.source]).toEqual(['tumble', 'label'])
  // "Remember for this garment": kept on the garment; the label is not edited.
  await as.mutation(api.dryingQueue.setPiece, { pieceId: tee.pieceId, method: 'rack_line', remember: true })
  tee = await pieceOf('Tee')
  expect([tee.method, tee.source, tee.preference, tee.label]).toEqual(['rack_line', 'preference', 'rack_line', 'tumble_dry'])
  await dryAndPutAway(tee.pieceId, 'rack_line')

  // Third wash: the preference is reused, and history keeps method and scope.
  await as.mutation(api.closet.flagDirty, { textileIds: [room.tee], reasons: ['worn'], soilLevel: 'normal' })
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId: await washUntilDry(as, room.householdId, [room.tee], room.washer3, 'once-3') })
  tee = await pieceOf('Tee')
  expect([tee.method, tee.source]).toEqual(['rack_line', 'preference'])
  const record = await as.query(api.sessions.garmentRecord, { textileId: room.tee })
  expect(record.washes.map((wash) => [wash.drying.method, wash.drying.scope])).toEqual([[undefined, undefined], ['rack_line', 'preference'], ['flat', 'once']])
  expect(record.preferenceChanges.map((change) => change.method)).toEqual(['rack_line'])

  // Follow label again: the label decides from now on.
  await as.mutation(api.dryingQueue.setDryingPreference, { textileId: room.tee, method: null })
  tee = await pieceOf('Tee')
  expect([tee.method, tee.source, tee.preference]).toEqual(['tumble', 'label', null])
})

test('a one-time drying choice cannot bypass a subsequently recorded wool heat limit', async () => {
  const t = newBackend()
  const as = signedIn(t, 'drying-wool-heat')
  const room = await sharedRoom(as)
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId: await washUntilDry(as, room.householdId, [room.tee], room.washer3, 'wool-heat') })
  await as.mutation(api.inventory.setMaterial, { textileIds: [room.tee], material: '80% cotton / 20% wool' })
  const piece = (await queueOf(as, room.householdId)).pieces.find((entry) => entry.textileId === room.tee)!
  await as.mutation(api.dryingQueue.setPiece, { pieceId: piece.pieceId, method: 'tumble' })
  await expect(as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: [piece.pieceId], dryerId: room.dryer4, minutes: 20, heat: 'high' })).rejects.toThrow('Wool needs a label permitting low-heat')
  const started = await as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: [piece.pieceId], dryerId: room.dryer4, minutes: 20, heat: 'low' })
  expect((await t.run((ctx) => ctx.db.get(started.runId)))?.heat).toBe('low')
})

test('do-not-tumble in the tumble dryer is a conflict, never given an assumed heat; heated hanging needs a recorded dryer', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'drying-no-tumble')
  const room = await sharedRoom(as)
  const knit = await as.mutation(api.inventory.createTextile, { householdId: room.householdId, name: 'Knit', color: 'White', colorGroup: 'light', firstWash: false })
  await dryingCare(as, knit, 'do_not_tumble_dry')
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId: await washUntilDry(as, room.householdId, [knit], room.washer3, 'knit') })
  let piece = (await queueOf(as, room.householdId)).pieces.find((entry) => entry.name === 'Knit')!
  expect([piece.method, piece.evidence]).toEqual(['rack_line', 'not_specified'])

  await as.mutation(api.dryingQueue.setPiece, { pieceId: piece.pieceId, method: 'tumble' })
  const queue = await queueOf(as, room.householdId)
  piece = queue.pieces.find((entry) => entry.name === 'Knit')!
  expect([piece.method, piece.evidence]).toEqual(['tumble', 'conflict'])
  expect(queue.plan.loads.map((load) => load.heat)).toEqual([null])
  await expect(as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: [piece.pieceId], dryerId: room.dryer4, minutes: 20 })).rejects.toThrow('Choose a heat setting yourself')
  const started = await as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: [piece.pieceId], dryerId: room.dryer4, minutes: 20, heat: 'low' })
  const run = await t.run(async (ctx) => ctx.db.get(started.runId))
  expect([run?.heat, run?.heatLabel, run?.heatChosen]).toEqual(['low', 'Delicate', true])

  // Heated hanging: compatibility is never established, and the machine must be recorded.
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId: await washUntilDry(as, room.householdId, [room.silk], room.washer5, 'silk') })
  const silk = (await queueOf(as, room.householdId)).pieces.find((entry) => entry.name === 'Silk top' && entry.status === 'queued')!
  await as.mutation(api.dryingQueue.setPiece, { pieceId: silk.pieceId, method: 'heated_hanging' })
  expect((await queueOf(as, room.householdId)).pieces.find((entry) => entry.pieceId === silk.pieceId)!.evidence).toBe('not_established')
  await expect(as.mutation(api.dryingQueue.startAirDry, { householdId: room.householdId, pieceIds: [silk.pieceId], method: 'heated_hanging' })).rejects.toThrow('heated hanging dryer')
})

test('a shared drying run freezes selected products and equipment, with each piece retaining only its own displayed starts', async () => {
  const t = newBackend()
  const as = signedIn(t, 'dryer-context')
  const room = await sharedRoom(as)
  const balls = await as.mutation(api.inventory.createSupply, { householdId: room.householdId, name: 'Checked dryer balls', kind: 'wool_dryer_ball', measure: { kind: 'count', countUnit: 'ball' }, provenance: label('original ball pack') })
  await as.mutation(api.inventory.saveLabelDirections, { supplyId: balls, measure: { kind: 'count', countUnit: 'ball' }, stage: 'dry', placement: 'dryer_drum', timing: 'before starting the dryer', rows: [{ cells: [{ amount: 3, unit: 'ball' }] }], provenance: label('original ball pack') })
  await as.mutation(api.inventory.createSupply, { householdId: room.householdId, name: 'Unchosen balls', kind: 'wool_dryer_ball', provenance: label('another ball pack') })
  const washed = []
  for (const [index, textileId] of room.towels.slice(0, 2).entries()) {
    const sessionId = await washUntilDry(as, room.householdId, [textileId], room.washer3, `context-wash-${index}`)
    washed.push(sessionId)
    await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  }
  const pieces = (await queueOf(as, room.householdId)).pieces
  const startedAt = Date.now()
  const { runId } = await as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: pieces.map((piece) => piece.pieceId), dryerId: room.dryer4, minutes: 35, productIds: [balls, balls] })
  const original = (await t.run((ctx) => ctx.db.get(runId)))!.activityContext!
  expect(original).toMatchObject({ version: 1, capturedAt: startedAt, load: { pieceCount: 2, bulkUnits: 4 },
    machine: { machineId: room.dryer4, name: 'Dryer 4', applianceType: 'tumble_dryer', capacityUnits: 6, capacityConfidence: 'verified', telemetry: false, cycleProfile: { cycles: { timed: { durationMinutes: 45 } } } },
    products: [{ supplyId: balls, name: 'Checked dryer balls', amount: 3, unit: 'ball', context: { provenance: label('original ball pack') } }] })
  await as.mutation(api.inventory.updateMachine, { machineId: room.dryer4, name: 'Renamed dryer', cycleMinutes: { timed: 90 }, capacityUnits: 12, model: 'New model' })
  await as.mutation(api.inventory.updateSupply, { supplyId: balls, name: 'Renamed balls', provenance: label('changed pack') })
  const records = () => as.query(api.sessions.washRecordsForTextile, { textileId: pieces[0]!.textileId })
  expect((await records())[0]?.drying).toEqual({ outcome: 'queued' })
  vi.advanceTimersByTime(36 * 60_000)
  expect((await records())[0]?.drying).toEqual({ outcome: 'queued' })
  const firstCheck = Date.now()
  await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [pieces[0]!.pieceId], extraMinutes: 10 })
  const first = (await records())[0]!
  expect(first.drying).toMatchObject({ dryerName: 'Dryer 4', minutes: 35, products: ['Checked dryer balls'], durationSuggestion: { minutes: 45 },
    activityContext: { runId, start: original, displayedStarts: [{ startedAt, minutes: 35 }], checkedAt: firstCheck, recordedAt: firstCheck, telemetry: false } })
  vi.advanceTimersByTime(11 * 60_000)
  await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [pieces[1]!.pieceId] })
  const second = (await as.query(api.sessions.washRecordsForTextile, { textileId: pieces[1]!.textileId }))[0]!
  expect(second.drying).toMatchObject({ minutes: 45, activityContext: { runId, start: original, displayedStarts: [{ startedAt, minutes: 35 }, { startedAt: firstCheck, minutes: 10 }], checkedAt: Date.now() } })
  expect((await records())[0]?.drying).toEqual(first.drying)
  expect([first.activityContext?.independentWashId, second.activityContext?.independentWashId]).toEqual(washed)
  await expect(as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [pieces[1]!.pieceId] })).rejects.toThrow('not drying here')
  expect((await as.query(api.sessions.washRecordsForTextile, { textileId: pieces[1]!.textileId }))[0]?.drying).toEqual(second.drying)
  await expect(signedIn(t, 'dryer-context-outsider').query(api.sessions.washRecordsForTextile, { textileId: pieces[0]!.textileId })).rejects.toThrow()
})

test('heated hanging records equipment without inventing a timer or products; legacy runs retain unknown context', async () => {
  const t = newBackend()
  const as = signedIn(t, 'hanging-context')
  const room = await sharedRoom(as)
  const machineId = await as.mutation(api.inventory.createMachine, { householdId: room.householdId, name: 'Hanging dryer', applianceType: 'heated_hanging_dryer', model: 'Recorded cabinet', provenance: label('cabinet plate') })
  const sessionId = await washUntilDry(as, room.householdId, [room.tee], room.washer3, 'hanging-context-wash')
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const pieceId = (await queueOf(as, room.householdId)).pieces[0]!.pieceId
  await as.mutation(api.dryingQueue.setPiece, { pieceId, method: 'heated_hanging' })
  const runId = await as.mutation(api.dryingQueue.startAirDry, { householdId: room.householdId, pieceIds: [pieceId], machineId, method: 'heated_hanging' })
  await as.mutation(api.inventory.updateMachine, { machineId, model: 'Changed cabinet', name: 'Changed name' })
  await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [pieceId] })
  const record = (await as.query(api.sessions.washRecordsForTextile, { textileId: room.tee }))[0]!
  expect(record.drying).toMatchObject({ method: 'heated_hanging', dryerName: 'Hanging dryer', activityContext: { runId, start: { products: [], machine: { name: 'Hanging dryer', model: 'Recorded cabinet', telemetry: false } }, displayedStarts: [{ startedAt: Date.now() }] } })
  expect(record.drying.minutes).toBeUndefined()
  await as.mutation(api.dryingQueue.putAway, { householdId: room.householdId, pieceIds: [pieceId] })
  await as.mutation(api.closet.flagDirty, { textileIds: [room.tee], reasons: ['worn'], soilLevel: 'normal' })
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId: await washUntilDry(as, room.householdId, [room.tee], room.washer3, 'legacy-drying') })
  const legacyPiece = (await queueOf(as, room.householdId)).pieces.find((piece) => piece.status === 'queued')!.pieceId
  await as.mutation(api.dryingQueue.setPiece, { pieceId: legacyPiece, method: 'flat' })
  const legacyRun = await as.mutation(api.dryingQueue.startAirDry, { householdId: room.householdId, pieceIds: [legacyPiece], method: 'flat' })
  await t.run((ctx) => ctx.db.patch(legacyRun, { activityContext: undefined }))
  await as.mutation(api.dryingQueue.checkDry, { runId: legacyRun, dryPieceIds: [legacyPiece] })
  const legacy = (await as.query(api.sessions.washRecordsForTextile, { textileId: room.tee }))[0]!
  expect(legacy.drying).toMatchObject({ method: 'flat', outcome: 'left_hanging' })
  expect(legacy.drying.activityContext).toBeUndefined()
})

test.each(['confirmed', 'skipped'] as const)('a %s per-piece pretreatment keeps its status and never becomes product use for another piece', async (treatmentStatus) => {
  const t = newBackend()
  const as = signedIn(t, 'piece-treatment-context')
  const home = await intakeHousehold(as)
  const treatment = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Checked stain fixture', kind: 'chemical', formulation: { form: 'liquid' },
    safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [], pretreatment: { stainChemistry: 'protease', stainKinds: ['protein'], dose: { amount: 10, unit: 'ml' }, timing: 'Checked label directions', safeMaterials: ['cotton'], maximumTemperatureC: 30 } }, provenance: label('synthetic stain pack') })
  await as.mutation(api.closet.flagDirty, { textileIds: [home.shirt], reasons: ['food'], soilLevel: 'normal', stainReport: { kind: 'protein', priorTreatmentAttempts: [] } })
  const planned = await planFor(as, home.householdId, [home.shirt, home.towel], { pretreatmentChoices: [{ textileId: home.shirt, supplyId: treatment }] })
  expect(planned.result.loads[0]?.textileIds).toHaveLength(2)
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'piece-use' })
  for (;;) {
    const step = (await as.query(api.execution.sessionDetail, { sessionId })).actions.find((action) => action.status === 'pending' && !isDryerPhase(action.phase))
    if (step === undefined) break
    const status = step.kind === 'treatment' && step.supplyId === treatment ? treatmentStatus : 'confirmed'
    await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status, ...(step.kind !== 'treatment' || status === 'skipped' ? {} : { usage: { supplyId: step.supplyId as Id<'supplies'>, amount: step.dose.amount, unit: step.dose.unit, placement: step.placement } }) })
  }
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const shirt = (await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt }))[0]!
  const towel = (await as.query(api.sessions.washRecordsForTextile, { textileId: home.towel }))[0]!
  expect(shirt.products.some((product) => product.name === 'Checked stain fixture')).toBe(treatmentStatus === 'confirmed')
  expect(shirt.activityContext?.products.some((product) => product.supplyId === treatment)).toBe(treatmentStatus === 'confirmed')
  expect(shirt.activityContext?.treatments?.find((step) => step.supplyId === treatment)?.status).toBe(treatmentStatus)
  expect(towel.activityContext?.treatments?.some((step) => step.supplyId === treatment)).toBe(false)
  expect(towel.products.map((product) => product.name)).not.toContain('Checked stain fixture')
  expect(towel.activityContext?.products.some((product) => product.supplyId === treatment)).toBe(false)
  expect(shirt.activityContext?.independentWashId).toBe(towel.activityContext?.independentWashId)
})

test('a home dryer holding a load refuses a second start and says why; a shared dryer is never checked', async () => {
  for (const location of ['home', 'shared'] as const) {
    const t: Backend = newBackend()
    const as = signedIn(t, `double-start-${location}`)
    const room = await sharedRoom(as, location)
    const sessionId = await washUntilDry(as, room.householdId, [room.towels[0]!, room.tee], room.washer3, 'first')
    await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
    const [towel, tee] = (await queueOf(as, room.householdId)).pieces.map((piece) => piece.pieceId)
    const first = await as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: [towel!], dryerId: room.dryer4, minutes: 45 })
    const second = as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: [tee!], dryerId: room.dryer4, minutes: 45 })
    if (location === 'shared') { await expect(second).resolves.toMatchObject({ going: [tee] }); continue }
    await expect(second).rejects.toThrow('Dryer 4 still has a load in it. Take it out first')
    // Checked dry: the dryer is empty again.
    await as.mutation(api.dryingQueue.checkDry, { runId: first.runId, dryPieceIds: [towel!] })
    await expect(as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: [tee!], dryerId: room.dryer4, minutes: 45 })).resolves.toMatchObject({ going: [tee] })
  }
})

test('"Wait for the dryer" reminds at the run\'s end while it runs, follows a restart, and is cancelled once it is dry', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'dryer-done-reminder')
  const room = await sharedRoom(as, 'home')
  const { subscriptionId } = await as.mutation(api.notifications.subscribe, { deviceId: 'phone', endpointHash: 'hash', endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } })
  const sessionId = await washUntilDry(as, room.householdId, [room.towels[0]!, room.tee], room.washer3, 'wait')
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const pieces = (await queueOf(as, room.householdId)).pieces.map((piece) => piece.pieceId)
  const { runId } = await as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: pieces, dryerId: room.dryer4, minutes: 45 })
  expect((await queueOf(as, room.householdId)).runs[0]).toMatchObject({ dryerId: room.dryer4, reminded: false })
  const { dueAt } = await as.mutation(api.dryingQueue.remindWhenDone, { runId })
  await as.mutation(api.dryingQueue.remindWhenDone, { runId })
  expect(dueAt).toBe(Date.now() + 45 * 60_000)
  expect((await queueOf(as, room.householdId)).runs[0]!.reminded).toBe(true)
  const reminders = () => t.run((ctx) => ctx.db.query('reminders').withIndex('by_drying_run', (q) => q.eq('dryingRunId', runId)).collect())
  expect((await reminders()).map((reminder) => [reminder.kind, reminder.status])).toEqual([['dryer_done', 'scheduled']])

  // Due while the run is still running: sent, and the push goes to the drying page.
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect((await reminders())[0]).toMatchObject({ status: 'sent', dueAt })
  const sent = (await reminders())[0]!
  const claim = async () => t.mutation(internal.pushDelivery.claim, { deliveryId: await t.run((ctx) => ctx.db.insert('pushDeliveries', { reminderId: sent._id, subscriptionId, status: 'queued', attempts: 0 })) })
  expect(await claim()).toMatchObject({ url: '/drying' })

  // Damp pieces restart the run: the reminder moves to the new end; the old one no longer reaches anyone.
  await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [pieces[0]!], extraMinutes: 10 })
  expect(await claim()).toBeNull()
  const moved = (await reminders()).find((reminder) => reminder.status === 'scheduled')!
  expect(moved.dueAt).toBe(Date.now() + 10 * 60_000)
  // Checked dry before it is due: cancelled, never sent.
  await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [pieces[1]!] })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await t.run((ctx) => ctx.db.get(moved._id))).toMatchObject({ status: 'cancelled' })
  await expect(as.mutation(api.dryingQueue.remindWhenDone, { runId })).rejects.toThrow('not running')
})

test('"Wait for the dryer" reminds the member who asked, one reminder each, and follows a restart for each', async () => {
  const t: Backend = newBackend()
  const owner = signedIn(t, 'wait-owner')
  const room = await sharedRoom(owner, 'home')
  const sam = await joinHousehold(t, owner, room.householdId, 'wait-sam', 'Sam')
  const sessionId = await washUntilDry(owner, room.householdId, [room.towels[0]!, room.tee], room.washer3, 'wait-two')
  await owner.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const pieces = (await queueOf(owner, room.householdId)).pieces.map((piece) => piece.pieceId)
  // The owner starts the dryer; Sam is the one waiting for it.
  const { runId } = await owner.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: pieces, dryerId: room.dryer4, minutes: 45 })
  const reminders = () => t.run((ctx) => ctx.db.query('reminders').withIndex('by_drying_run', (q) => q.eq('dryingRunId', runId)).collect())
  const who = async (reminder: Awaited<ReturnType<typeof reminders>>[number]) => t.run((ctx) => sessionlessRecipient(ctx, reminder))
  await sam.mutation(api.dryingQueue.remindWhenDone, { runId })
  expect(await Promise.all((await reminders()).map(who))).toEqual([await keyOf(sam)])
  expect((await queueOf(sam, room.householdId)).runs[0]!.reminded, 'Sam asked').toBe(true)
  expect((await queueOf(owner, room.householdId)).runs[0]!.reminded, 'the owner did not').toBe(false)
  // The owner asks too: an independent reminder, not blocked by Sam's. Asking twice is still one each.
  await owner.mutation(api.dryingQueue.remindWhenDone, { runId })
  await owner.mutation(api.dryingQueue.remindWhenDone, { runId })
  await sam.mutation(api.dryingQueue.remindWhenDone, { runId })
  expect((await Promise.all((await reminders()).map(who))).sort()).toEqual([await keyOf(owner), await keyOf(sam)].sort())
  expect((await queueOf(owner, room.householdId)).runs[0]!.reminded).toBe(true)
  // Both are told when it ends. Damp pieces then restart the run: each asker's reminder moves to the new end.
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect((await reminders()).map((reminder) => reminder.status)).toEqual(['sent', 'sent'])
  await owner.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [pieces[0]!], extraMinutes: 10 })
  // The old ones no longer reach anyone (their end has passed on); the new ones do.
  const [old, moved] = [(await reminders()).filter((reminder) => reminder.dueAt !== Date.now() + 10 * 60_000), (await reminders()).filter((reminder) => reminder.dueAt === Date.now() + 10 * 60_000)]
  expect(await Promise.all(old.map(who))).toEqual([null, null])
  expect(moved.map((reminder) => reminder.status)).toEqual(['scheduled', 'scheduled'])
  expect((await Promise.all(moved.map(who))).sort()).toEqual([await keyOf(owner), await keyOf(sam)].sort())
})

test('dryer reminders go to whoever created the laundry plan; a person who asked still gets theirs', async () => {
  const t: Backend = newBackend()
  const owner = signedIn(t, 'plan-creator')
  const room = await sharedRoom(owner, 'home')
  const sam = await joinHousehold(t, owner, room.householdId, 'plan-sam', 'Sam')
  const tee = await owner.mutation(api.inventory.createTextile, { householdId: room.householdId, name: 'Blue tee', color: 'Blue', colorGroup: 'light', firstWash: false, bulkUnits: 0.5 })
  await owner.mutation(api.inventory.updateTextile, { textileId: tee, kind: 't_shirt' })
  await dryingCare(owner, tee, 'tumble_dry', 'high')
  // The owner plans and washes; Sam starts the dryer.
  const sessionId = await washUntilDry(owner, room.householdId, [tee, room.towels[0]!], room.washer3, 'creator-wash')
  await owner.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const pieces = (await queueOf(sam, room.householdId)).pieces.map((piece) => piece.pieceId)
  const { runId } = await sam.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: pieces, dryerId: room.dryer4, minutes: 50 })
  const reminders = () => t.run((ctx) => ctx.db.query('reminders').withIndex('by_drying_run', (q) => q.eq('dryingRunId', runId)).collect())
  const who = async (reminder: Awaited<ReturnType<typeof reminders>>[number]) => t.run((ctx) => sessionlessRecipient(ctx, reminder))
  const check = (await reminders()).find((reminder) => reminder.kind === 'dryer_check')!
  expect(await who(check)).toBe(await keyOf(owner))
  // A dryer_done saved before askers were recorded goes to the plan's creator, not the run's starter.
  const legacy = await t.run(async (ctx) => ctx.db.get(await ctx.db.insert('reminders', { householdId: room.householdId, kind: 'dryer_done', dryingRunId: runId, status: 'scheduled', dueAt: Date.now() + 50 * 60_000 })))
  expect(await who(legacy!)).toBe(await keyOf(owner))
  // Sam asked "Wait for the dryer": that one is Sam's.
  await sam.mutation(api.dryingQueue.remindWhenDone, { runId })
  const asked = (await reminders()).find((reminder) => reminder.kind === 'dryer_done' && reminder.recipientPrincipalKey !== undefined)!
  expect(await who(asked)).toBe(await keyOf(sam))
})

test('a start_load reminder stands only while its load has no session', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'start-load-reminder')
  const room = await sharedRoom(as, 'home')
  const planned = await planFor(as, room.householdId, [room.tee])
  const loadId = planned.result.loads[0]!.id
  const member = await t.run(async (ctx) => (await ctx.db.query('memberships').withIndex('by_household', (q) => q.eq('householdId', room.householdId)).first())!.principalKey)
  const reminderId = await t.run((ctx) => ctx.db.insert('reminders', { householdId: room.householdId, kind: 'start_load', planId: planned.planId, loadId, status: 'scheduled', dueAt: Date.now(), recipientPrincipalKey: member }))
  await t.mutation(internal.reminders.deliver, { reminderId })
  expect(await t.run((ctx) => ctx.db.get(reminderId))).toMatchObject({ status: 'sent' })
  const { subscriptionId } = await as.mutation(api.notifications.subscribe, { deviceId: 'phone', endpointHash: 'hash', endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } })
  const claim = async () => t.mutation(internal.pushDelivery.claim, { deliveryId: await t.run((ctx) => ctx.db.insert('pushDeliveries', { reminderId, subscriptionId, status: 'queued', attempts: 0 })) })
  expect(await claim()).toMatchObject({ url: '/laundry' })
  await startLoad(as, { planId: planned.planId, loadId, idempotencyKey: 'started', machineId: room.washer3 })
  expect(await claim()).toBeNull()
  const late = await t.run((ctx) => ctx.db.insert('reminders', { householdId: room.householdId, kind: 'start_load', planId: planned.planId, loadId, status: 'scheduled', dueAt: Date.now(), recipientPrincipalKey: member }))
  await t.mutation(internal.reminders.deliver, { reminderId: late })
  expect(await t.run((ctx) => ctx.db.get(late))).toMatchObject({ status: 'cancelled' })
})

test('"start load N at about" keeps one start_load reminder per plan, moves it with a new time, and only for a home washer', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'start-load-at')
  const room = await sharedRoom(as, 'home')
  const planned = await planFor(as, room.householdId, [room.tee])
  const loadId = planned.result.loads[0]!.id
  const at = Date.now() + 40 * 60_000
  expect(await as.mutation(api.plans.remindStartLoad, { planId: planned.planId, loadId, at })).toEqual({ dueAt: at })
  await as.mutation(api.plans.remindStartLoad, { planId: planned.planId, loadId, at })
  const scheduled = async () => (await t.run((ctx) => ctx.db.query('reminders').collect())).filter((reminder) => reminder.kind === 'start_load' && reminder.status === 'scheduled')
  expect(await scheduled()).toMatchObject([{ dueAt: at, loadId }])
  // The dryer said otherwise: the reminder moves, the old one is cancelled.
  await as.mutation(api.plans.remindStartLoad, { planId: planned.planId, loadId, at: at + 20 * 60_000 })
  expect(await scheduled()).toMatchObject([{ dueAt: at + 20 * 60_000 }])
  await vi.advanceTimersByTimeAsync(61 * 60_000)
  expect((await t.run((ctx) => ctx.db.query('reminders').collect())).filter((reminder) => reminder.kind === 'start_load').map((reminder) => reminder.status).sort()).toEqual(['cancelled', 'sent'])
  await startLoad(as, { planId: planned.planId, loadId, idempotencyKey: 'started', machineId: room.washer3 })
  await expect(as.mutation(api.plans.remindStartLoad, { planId: planned.planId, loadId, at })).rejects.toThrow('has started')
  const sharedT: Backend = newBackend()
  const shared = signedIn(sharedT, 'start-load-shared')
  const sharedRoomData = await sharedRoom(shared)
  const sharedPlan = await planFor(shared, sharedRoomData.householdId, [sharedRoomData.tee])
  await expect(shared.mutation(api.plans.remindStartLoad, { planId: sharedPlan.planId, loadId: sharedPlan.result.loads[0]!.id, at })).rejects.toThrow('only for a washer at home')
})

test('a held start reminder is cancelled when the hold goes, and stands only while the dryer time it was timed from does', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'start-load-basis')
  const room = await sharedRoom(as, 'home')
  // The dryer holds a load until 45 minutes from now: the next wash is held back to start before then.
  const sessionId = await washUntilDry(as, room.householdId, [room.towels[0]!], room.washer3, 'basis-wash')
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const queued = (await queueOf(as, room.householdId)).pieces.map((piece) => piece.pieceId)
  const { runId } = await as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: queued, dryerId: room.dryer4, minutes: 45 })
  const planned = await planFor(as, room.householdId, [room.tee])
  const loadId = planned.result.loads[0]!.id
  const end = Date.now() + 45 * 60_000
  const at = end - 15 * 60_000
  const basis = { key: runId, end, source: 'entered' as const }
  const scheduled = async () => (await t.run((ctx) => ctx.db.query('reminders').collect())).filter((reminder) => reminder.kind === 'start_load' && reminder.status === 'scheduled')
  await as.mutation(api.plans.remindStartLoad, { planId: planned.planId, loadId, at, basis })
  await as.mutation(api.plans.remindStartLoad, { planId: planned.planId, loadId, at, basis })
  expect(await scheduled(), 'the same time and basis keep one reminder').toMatchObject([{ dueAt: at, basis }])
  // "Dryer says" turned the step into "Start now": the hold is gone, so is the reminder.
  await as.mutation(api.plans.cancelStartLoadReminder, { planId: planned.planId })
  expect(await scheduled()).toEqual([])
  expect((await t.run((ctx) => ctx.db.query('reminders').collect())).filter((reminder) => reminder.kind === 'start_load').map((reminder) => reminder.status)).toEqual(['cancelled'])

  // A reminder whose dryer time moved is not delivered: the run was extended after it was set.
  await as.mutation(api.plans.remindStartLoad, { planId: planned.planId, loadId, at, basis })
  const [held] = await scheduled()
  await t.run((ctx) => ctx.db.patch(runId, { minutes: 75 }))
  await t.mutation(internal.reminders.deliver, { reminderId: held!._id })
  expect(await t.run((ctx) => ctx.db.get(held!._id))).toMatchObject({ status: 'cancelled' })

  // The person's own "Dryer says" is phone-only: it stands while that dryer still runs, and not once it is checked dry.
  const says = { key: runId, end: Date.now() + 90 * 60_000, source: 'says' as const }
  await as.mutation(api.plans.remindStartLoad, { planId: planned.planId, loadId, at: Date.now() + 40 * 60_000, basis: says })
  const [typed] = await scheduled()
  const member = await t.run(async (ctx) => (await ctx.db.query('memberships').withIndex('by_household', (q) => q.eq('householdId', room.householdId)).first())!.principalKey)
  expect(await t.run((ctx) => sessionlessRecipient(ctx, typed!))).toBe(member)
  await t.run((ctx) => ctx.db.patch(runId, { status: 'done' }))
  expect(await t.run((ctx) => sessionlessRecipient(ctx, typed!))).toBeNull()
})

test('wash and dryer minutes are asked once: saved as the household estimate, or "Not now" alone', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'laundry-times')
  const room = await sharedRoom(as, 'home')
  const planned = await planFor(as, room.householdId, [room.tee])
  await as.mutation(api.inventory.setLaundryTimes, { householdId: room.householdId, washMinutes: 60, dryerMinutes: 75 })
  expect((await as.query(api.inventory.list, { householdId: room.householdId })).planning.times).toMatchObject({ washMinutes: 60, dryerMinutes: 75, askedAt: Date.now() })
  // Not a plan input: the plan stays current.
  expect(await t.run((ctx) => ctx.db.get(planned.planId))).toMatchObject({ status: planned.status })
  await as.mutation(api.inventory.setLaundryTimes, { householdId: room.householdId })
  expect((await as.query(api.inventory.list, { householdId: room.householdId })).planning.times).toEqual({ askedAt: Date.now() })
  await expect(as.mutation(api.inventory.setLaundryTimes, { householdId: room.householdId, washMinutes: 5 })).rejects.toThrow('between 10 and 240')
  await expect(signedIn(t, 'outsider').mutation(api.inventory.setLaundryTimes, { householdId: room.householdId })).rejects.toThrow('Forbidden')
})

test('the machines this household used most recently come from its own loads, newest first, and say nothing about what is free', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'recent-machines')
  const room = await sharedRoom(as)
  expect(await as.query(api.execution.recentMachines, { householdId: room.householdId })).toEqual({ washers: [], dryers: [] })
  const sessionId = await washUntilDry(as, room.householdId, [room.tee], room.washer3, 'recent-wash')
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const queue = await queueOf(as, room.householdId)
  await as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: queue.pieces.map((piece) => piece.pieceId), dryerId: room.dryer4, minutes: 35 })
  expect(await as.query(api.execution.recentMachines, { householdId: room.householdId })).toEqual({ washers: [room.washer3], dryers: [room.dryer4] })
  await expect(signedIn(t, 'outsider').query(api.execution.recentMachines, { householdId: room.householdId })).rejects.toThrow('Forbidden')
})

test('"Hang them" puts what may hang on a rack once and leaves dry-flat and label-step pieces waiting', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'hang-while-busy')
  const room = await sharedRoom(as, 'home')
  const sessionId = await washUntilDry(as, room.householdId, [room.tee, room.wool], room.washer3, 'hang')
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const queue = await queueOf(as, room.householdId)
  const id = (name: string) => queue.pieces.find((piece) => piece.name === name)!.pieceId
  const result = await as.mutation(api.dryingQueue.hangWhileDryerBusy, { householdId: room.householdId, pieceIds: [id('Tee'), id('Wool jumper')] })
  expect(result).toEqual({ hung: [id('Tee')], waiting: [id('Wool jumper')] })
  const after = await queueOf(as, room.householdId)
  expect(after.runs).toMatchObject([{ kind: 'air', method: 'rack_line', pieceIds: [id('Tee')] }])
  expect(after.pieces.find((piece) => piece.name === 'Tee')).toMatchObject({ status: 'drying', method: 'rack_line', source: 'once' })
  await expect(as.mutation(api.dryingQueue.hangWhileDryerBusy, { householdId: room.householdId, pieceIds: [id('Wool jumper')] })).rejects.toThrow('None of these can hang')
})

test('"Wash now, hang to dry" starts with no dryer steps and racks only what the dryer would have taken', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'hang-once')
  const room = await sharedRoom(as, 'home')
  const planned = await planFor(as, room.householdId, [room.tee, room.wool])
  const load = planned.result.loads[0]!
  expect([...load.textileIds].sort()).toEqual([room.tee, room.wool].sort())
  expect(load.drying?.tumbleTextileIds).toEqual([room.tee])
  await as.mutation(api.plans.hangOnce, { planId: planned.planId, textileIds: [room.tee, room.wool] })
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: load.id, idempotencyKey: 'hang-once', machineId: room.washer3 })
  // A hung load: no dryer steps, no drying snapshot, no dryer reminders.
  const detail = await as.query(api.execution.sessionDetail, { sessionId })
  expect(detail.actions.filter((action) => isDryerPhase(action.phase))).toEqual([])
  const timeline = await t.run((ctx) => ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique())
  expect(timeline?.drying).toBeUndefined()
  expect(timeline?.dryerId).toBeUndefined()
  for (;;) {
    const step = (await as.query(api.execution.sessionDetail, { sessionId })).actions.find((action) => action.status === 'pending')
    if (step === undefined) break
    await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: step.kind === 'task' ? 'confirmed' : 'skipped' })
  }
  expect((await t.run((ctx) => ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique()))?.actions.some((action) => isDryerPhase(action.phase))).toBe(false)
  expect((await t.run((ctx) => ctx.db.query('reminders').collect())).filter((reminder) => reminder.kind === 'dryer_done' || reminder.kind === 'dryer_check' || reminder.actionId?.includes('dryer') === true)).toEqual([])
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const queue = await queueOf(as, room.householdId)
  // The dry-flat jumper keeps its label's way; only the tee goes on the rack this once.
  expect(queue.pieces.find((piece) => piece.name === 'Tee')).toMatchObject({ method: 'rack_line', source: 'once' })
  expect(queue.pieces.find((piece) => piece.name === 'Wool jumper')).toMatchObject({ method: 'flat' })
  expect(queue.plan.natural.map((entry) => entry.method).sort()).toEqual(['flat', 'rack_line'])
})

test('a one-time hang choice survives replanning changed inputs for the same pieces', async () => {
  const t = newBackend()
  const as = signedIn(t, 'hang-once-replan')
  const room = await sharedRoom(as, 'home')
  const planned = await planFor(as, room.householdId, [room.tee, room.wool])
  await as.mutation(api.plans.hangOnce, { planId: planned.planId, textileIds: [room.tee, room.wool] })
  await dryingCare(as, room.tee, 'tumble_dry', 'low')
  const replanned = await planFor(as, room.householdId, [room.tee, room.wool])
  expect(replanned.planId).not.toBe(planned.planId)
  expect((await t.run((ctx) => ctx.db.get(replanned.planId)))?.hangTextileIds?.sort()).toEqual([room.tee, room.wool].sort())
  const load = replanned.result.loads[0]!
  const { sessionId } = await startLoad(as, { planId: replanned.planId, loadId: load.id, machineId: room.washer3, idempotencyKey: 'replanned-hang' })
  expect((await as.query(api.execution.sessionDetail, { sessionId })).actions.some((action) => isDryerPhase(action.phase))).toBe(false)
  await t.run((ctx) => ctx.db.patch(sessionId, { status: 'completed' }))
  await dryingCare(as, room.tee, 'tumble_dry', 'no_heat')
  const later = await planFor(as, room.householdId, [room.tee, room.wool])
  expect((await t.run((ctx) => ctx.db.get(later.planId)))?.hangTextileIds).toBeUndefined()
})

test('"Wash now, hang to dry" keeps a tumble-label piece set to dry flat off the rack', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'hang-once-preference')
  const room = await sharedRoom(as, 'home')
  const planned = await planFor(as, room.householdId, [room.tee])
  const load = planned.result.loads[0]!
  expect(load.drying?.tumbleTextileIds).toEqual([room.tee])
  await t.run((ctx) => ctx.db.patch(room.tee, { dryingPreference: { method: 'flat', setAt: Date.now(), setBy: 'test' } }))
  await as.mutation(api.plans.hangOnce, { planId: planned.planId, textileIds: [room.tee] })
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: load.id, idempotencyKey: 'hang-once-preference', machineId: room.washer3 })
  for (;;) {
    const step = (await as.query(api.execution.sessionDetail, { sessionId })).actions.find((action) => action.status === 'pending')
    if (step === undefined) break
    await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: step.kind === 'task' ? 'confirmed' : 'skipped' })
  }
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const tee = (await queueOf(as, room.householdId)).pieces.find((piece) => piece.name === 'Tee')
  expect(tee).toMatchObject({ method: 'flat' })
  expect(tee?.source).not.toBe('once')
})

test('rack size and loads a day are saved once for the household, 1 to 3, and the queue reads the rack', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'laundry-day')
  const room = await sharedRoom(as, 'home')
  const planned = await planFor(as, room.householdId, [room.tee])
  expect((await queueOf(as, room.householdId)).rackLoads).toBeUndefined()
  await as.mutation(api.inventory.setLaundryDay, { householdId: room.householdId, rackLoads: 2 })
  await as.mutation(api.inventory.setLaundryDay, { householdId: room.householdId, loadsPerDay: 3 })
  expect((await as.query(api.inventory.list, { householdId: room.householdId })).planning.day).toEqual({ rackLoads: 2, loadsPerDay: 3 })
  expect((await queueOf(as, room.householdId)).rackLoads).toBe(2)
  // Not a plan input: the plan stays current.
  expect(await t.run((ctx) => ctx.db.get(planned.planId))).toMatchObject({ status: planned.status })
  await expect(as.mutation(api.inventory.setLaundryDay, { householdId: room.householdId, rackLoads: 4 })).rejects.toThrow('Choose 1, 2 or 3')
  await expect(signedIn(t, 'outsider').mutation(api.inventory.setLaundryDay, { householdId: room.householdId, loadsPerDay: 1 })).rejects.toThrow('Forbidden')
})

test('the next load learns its wash time from 3 finished washes on its washer and program, each capped at the program plus 15', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'wash-learning')
  const room = await sharedRoom(as, 'home')
  const planned = await planFor(as, room.householdId, [room.tee])
  const load = planned.result.loads[0]!
  const learned = async () => (await as.query(api.plans.upNext, { householdId: room.householdId }))!.loads[0]!.washLearned
  const finished = (minutes: number, machineId = load.machineId as Id<'machines'>) => t.run(async (ctx) => {
    const started = Date.now() - 24 * 60 * 60_000
    await ctx.db.insert('sessions', { householdId: room.householdId, planId: planned.planId, loadId: 'earlier', cycle: load.cycle, textileIds: [room.tee], startedBy: 'test', idempotencyKey: `learn-${minutes}-${machineId}`,
      status: 'completed', revision: 1, machineStartedAt: started, washFinishedAt: started + minutes * 60_000,
      washerContext: { machineId, capturedAt: started, name: 'Washer', provenance: label('test'), telemetry: false } })
  })
  await finished(28)
  await finished(34)
  expect(await learned()).toBeNull()
  // Another washer's taps don't count.
  await finished(20, room.washer5 === load.machineId ? room.washer3 : room.washer5)
  expect(await learned()).toBeNull()
  // A forgotten load (90 min on a 30-min program) counts as 45: the median is 34.
  await finished(90)
  expect(await learned()).toEqual({ minutes: 34, count: 3 })
})

test('a mid-run check: the tee comes out at about half, hangs, and the run keeps its time; a missed check is recorded', async () => {
  const t: Backend = newBackend()
  const as = signedIn(t, 'mid-run-check')
  const room = await sharedRoom(as, 'home')
  const { subscriptionId } = await as.mutation(api.notifications.subscribe, { deviceId: 'phone', endpointHash: 'hash', endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } })
  const tee = await as.mutation(api.inventory.createTextile, { householdId: room.householdId, name: 'Blue tee', color: 'Blue', colorGroup: 'light', firstWash: false, bulkUnits: 0.5 })
  await as.mutation(api.inventory.updateTextile, { textileId: tee, kind: 't_shirt' })
  await dryingCare(as, tee, 'tumble_dry', 'high')
  const wash = async (key: string) => {
    for (const id of [tee, room.towels[0]!]) await as.mutation(api.inventory.updateTextile, { textileId: id, status: 'dirty' })
    const sessionId = await washUntilDry(as, room.householdId, [tee, room.towels[0]!], room.washer3, key)
    await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
    const pieces = (await queueOf(as, room.householdId)).pieces.filter((piece) => piece.status === 'queued')
    const { runId } = await as.mutation(api.dryingQueue.startDryer, { householdId: room.householdId, pieceIds: pieces.map((piece) => piece.pieceId), dryerId: room.dryer4, minutes: 50 })
    const teePiece = pieces.find((piece) => piece.textileId === tee)!.pieceId
    const towelPiece = pieces.find((piece) => piece.textileId === room.towels[0])!.pieceId
    return { runId, teePiece, towelPiece }
  }
  const { runId, teePiece, towelPiece } = await wash('mid-1')
  const startedAt = Date.now()
  const run = (await t.run((ctx) => ctx.db.get(runId)))!
  expect(run.midCheck).toEqual({ checkAt: run.startedAt + 25 * 60_000, atMinute: 25, pieceIds: [teePiece], reasons: ['knit'] })
  expect((await queueOf(as, room.householdId)).runs[0]!.check).toMatchObject({ atMinute: 25, pieceIds: [teePiece], missed: false })

  // A reminder at the check reaches the phone, opening the drying page.
  const reminders = () => t.run((ctx) => ctx.db.query('reminders').withIndex('by_drying_run', (q) => q.eq('dryingRunId', runId)).collect())
  const reminder = (await reminders()).find((entry) => entry.kind === 'dryer_check')!
  expect(reminder).toMatchObject({ status: 'scheduled', dueAt: run.midCheck!.checkAt })
  vi.advanceTimersByTime(25 * 60_000)
  await t.mutation(internal.reminders.deliver, { reminderId: reminder._id })
  expect((await t.run((ctx) => ctx.db.get(reminder._id)))?.status).toBe('sent')
  const delivery = await t.run((ctx) => ctx.db.insert('pushDeliveries', { reminderId: reminder._id, subscriptionId, status: 'queued', attempts: 0 }))
  expect(await t.mutation(internal.pushDelivery.claim, { deliveryId: delivery })).toMatchObject({ url: '/drying' })

  // Before the end: no extra minutes, the run's time is left alone, the tee hangs.
  await expect(as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [], hangPieceIds: [room.towels[1]! as never] })).rejects.toThrow()
  expect(await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [], hangPieceIds: [teePiece] })).toEqual({ dry: 0, damp: 1, hung: 1 })
  const after = (await t.run((ctx) => ctx.db.get(runId)))!
  expect(after).toMatchObject({ status: 'running', startedAt, minutes: 50, earlyChecks: [{ dry: 0, hung: 1, left: 1 }], midCheck: { checkedAt: Date.now() } })
  expect(after.earlier).toBeUndefined()
  expect((await queueOf(as, room.householdId)).runs.find((entry) => entry.runId === runId)!.check).toBeUndefined()
  const hung = (await t.run((ctx) => ctx.db.get(teePiece)))!
  expect(hung).toMatchObject({ status: 'drying', method: 'rack_line', tumbledFirst: { runId, minutes: 25, dryerName: 'Dryer 4', heat: 'high' } })
  expect((await t.run((ctx) => ctx.db.get(hung.dryingRunId!)))).toMatchObject({ kind: 'air', method: 'rack_line', status: 'running' })
  // A hang at or after the end is refused; the towel finishes as today's check.
  vi.advanceTimersByTime(25 * 60_000)
  await expect(as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [], hangPieceIds: [towelPiece] })).rejects.toThrow('before the dryer ends')
  await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [towelPiece] })
  await as.mutation(api.dryingQueue.checkDry, { runId: hung.dryingRunId!, dryPieceIds: [teePiece] })
  const records = await t.run((ctx) => ctx.db.query('washRecords').collect())
  expect(records.find((entry) => entry.textileId === tee)?.drying).toMatchObject({ outcome: 'left_hanging', method: 'rack_line', tumbledMinutes: 25, dryerName: 'Dryer 4', scope: 'once' })
  expect(records.find((entry) => entry.textileId === room.towels[0])?.drying).toMatchObject({ outcome: 'tumble_dried', minutes: 50 })
  await as.mutation(api.dryingQueue.putAway, { householdId: room.householdId, pieceIds: [teePiece, towelPiece] })
  const history = await t.run((ctx) => ctx.db.query('history').collect())
  expect(history.find((entry) => entry.textileId === tee && entry.event === 'dried')?.details).toMatchObject({ tumbledMinutes: 25, dryer: 'Dryer 4' })

  // Missed: nobody checked before the end. Recorded on the run and the tee, never as damage.
  vi.advanceTimersByTime(60_000)
  const second = await wash('mid-2')
  vi.advanceTimersByTime(55 * 60_000)
  const ended = (await t.run((ctx) => ctx.db.query('reminders').withIndex('by_drying_run', (q) => q.eq('dryingRunId', second.runId)).collect()))[0]!
  await as.mutation(api.dryingQueue.checkDry, { runId: second.runId, dryPieceIds: [second.teePiece, second.towelPiece] })
  expect((await t.run((ctx) => ctx.db.get(second.runId)))?.midCheck).toMatchObject({ missed: true })
  await t.mutation(internal.reminders.deliver, { reminderId: ended._id })
  expect((await t.run((ctx) => ctx.db.get(ended._id)))?.status, 'a check reminder after the run is done reaches no one').toBe('cancelled')
  const latest = await t.run((ctx) => ctx.db.query('washRecords').order('desc').take(2))
  expect(latest.find((entry) => entry.textileId === tee)?.drying).toMatchObject({ outcome: 'tumble_dried', checkMissed: true })
  expect(latest.find((entry) => entry.textileId === room.towels[0])?.drying.checkMissed).toBeUndefined()
})
