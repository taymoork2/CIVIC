import { expect, test } from 'vitest'
import { api } from './_generated/api'
import { finishSteps, intakeHousehold, label, newBackend, planFor, signedIn, startLoad } from './harness.testing'
import { constructionCareSource, printfulCareSource } from '@washcloset/planner'

const facts = { kind: 'printed' as const, method: 'dtg' as const, manufacturer: 'Printful', source: 'Synthetic exact garment reference', confidence: 'observed' as const }
const instructions = { source: 'Synthetic sewn label', preparation: ['Close fasteners'], washing: [], beforeDrying: [], drying: [], afterDrying: [], ironing: [] }

test('decoration writes are bounded, household-scoped, explicit and revision checked', async () => {
  const t = newBackend()
  const as = signedIn(t, 'print-details')
  const home = await intakeHousehold(as)
  const args = { textileIds: [home.shirt], facts, expectedRevisions: [{ textileId: home.shirt, revision: 0 }] }
  await expect(signedIn(t, 'outsider').mutation(api.garmentAdvice.setDecoration, args)).rejects.toThrow('Forbidden')
  await expect(as.mutation(api.garmentAdvice.setDecoration, { ...args, facts: { ...facts, source: ' ' } })).rejects.toThrow('where')
  await expect(as.mutation(api.garmentAdvice.setDecoration, { ...args, facts: { ...facts, kind: 'none' } })).rejects.toThrow('method')
  await expect(as.mutation(api.garmentAdvice.setDecoration, { ...args, textileIds: [home.shirt, home.shirt] })).rejects.toThrow('distinct')
  await expect(as.mutation(api.garmentAdvice.setDecoration, { ...args, expectedRevisions: [] })).rejects.toThrow('changed')
  await as.mutation(api.garmentAdvice.setDecoration, args)
  const stored = (await as.query(api.inventory.list, { householdId: home.householdId })).textiles.find((piece) => piece.textileId === home.shirt)!
  expect(stored.decoration).toMatchObject({ ...facts, revision: 1 })
  await expect(as.mutation(api.garmentAdvice.setDecoration, args)).rejects.toThrow('changed')
  const other = await intakeHousehold(signedIn(t, 'other-print-household'))
  await expect(as.mutation(api.garmentAdvice.setReminder, { textileIds: [home.shirt, other.shirt], enabled: false })).rejects.toThrow('Forbidden')
  expect((await t.run((ctx) => ctx.db.get(other.shirt)))!.adviceReminder).toBeUndefined()
  await t.run((ctx) => ctx.db.patch(home.towel, { guest: true }))
  await expect(as.mutation(api.garmentAdvice.setReminder, { textileIds: [home.shirt, home.towel], enabled: false })).rejects.toThrow('active closet')
  expect((await t.run((ctx) => ctx.db.get(home.shirt)))!.adviceReminder).toBeUndefined()
  await t.run((ctx) => ctx.db.patch(home.towel, { guest: false, trashedAt: Date.now() }))
  await expect(as.mutation(api.garmentAdvice.setReminder, { textileIds: [home.towel], enabled: false })).rejects.toThrow('Not found')
})

const zipper = { presence: 'present' as const, confidence: 'observed' as const, source: 'Synthetic observed zipper' }
const trim = { presence: 'present' as const, confidence: 'verified' as const, source: 'Synthetic exact lace-trim reference' }

test('construction writes reject unknown claims, missing sources, stale edits and foreign pieces, preserving print facts', async () => {
  const t = newBackend(), as = signedIn(t, 'construction-contract')
  const home = await intakeHousehold(as)
  const args = { textileIds: [home.shirt], facts: { zipper }, expectedRevisions: [{ textileId: home.shirt, revision: 0 }] }
  await expect(signedIn(t, 'outsider').mutation(api.garmentAdvice.setConstruction, args)).rejects.toThrow('Forbidden')
  await expect(as.mutation(api.garmentAdvice.setConstruction, { ...args, facts: { zipper: { ...zipper, source: '' } } })).rejects.toThrow('where')
  await expect(as.mutation(api.garmentAdvice.setConstruction, { ...args, facts: { zipper: { ...zipper, presence: 'unknown' } } })).rejects.toThrow('remain unknown')
  await expect(as.mutation(api.garmentAdvice.setConstruction, { ...args, facts: { zipper: { ...zipper, confidence: 'unknown' } } })).rejects.toThrow('where')
  await expect(as.mutation(api.garmentAdvice.setConstruction, { ...args, textileIds: [home.shirt, home.shirt] })).rejects.toThrow('distinct')
  await as.mutation(api.garmentAdvice.setDecoration, { textileIds: [home.shirt], facts, expectedRevisions: args.expectedRevisions })
  await expect(as.mutation(api.garmentAdvice.setConstruction, args)).rejects.toThrow('changed')
  await as.mutation(api.garmentAdvice.setConstruction, { ...args, expectedRevisions: [{ textileId: home.shirt, revision: 1 }] })
  expect((await t.run((ctx) => ctx.db.get(home.shirt)))!.decoration).toMatchObject({ ...facts, construction: { zipper }, revision: 2 })
  // A legacy print editor without new construction fields cannot erase those facts.
  await as.mutation(api.garmentAdvice.setDecoration, { textileIds: [home.shirt], facts: { ...facts, method: 'unknown' }, expectedRevisions: [{ textileId: home.shirt, revision: 2 }] })
  expect((await t.run((ctx) => ctx.db.get(home.shirt)))!.decoration?.construction).toEqual({ zipper })
  await as.mutation(api.inventory.updateTextile, { textileId: home.shirt, identity: { brand: 'Different maker' } })
  expect((await t.run((ctx) => ctx.db.get(home.shirt)))!.decoration).toMatchObject({ kind: 'unknown', revision: 4 })
  expect((await t.run((ctx) => ctx.db.get(home.shirt)))!.decoration?.construction).toBeUndefined()
})

test('checked embroidery maker/source scope is explicit and survives inventory reads', async () => {
  const t = newBackend(), as = signedIn(t, 'embroidery-source')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateTextile, { textileId: home.shirt, kind: 'shirt' })
  const embroidery = { ...facts, kind: 'embroidered' as const, method: 'unknown' as const, confidence: 'verified' as const, guidanceSource: printfulCareSource }
  const args = { textileIds: [home.shirt], facts: embroidery, expectedRevisions: [{ textileId: home.shirt, revision: 0 }] }
  for (const mismatch of [{ ...embroidery, guidanceSource: 'Other care source' }, { ...embroidery, confidence: 'observed' as const }, { ...embroidery, manufacturer: 'Other maker' }]) {
    await expect(as.mutation(api.garmentAdvice.setDecoration, { ...args, facts: mismatch })).rejects.toThrow('checked embroidery')
  }
  await as.mutation(api.garmentAdvice.setDecoration, args)
  expect((await as.query(api.inventory.list, { householdId: home.householdId })).textiles.find((piece) => piece.textileId === home.shirt)!.decoration).toMatchObject(embroidery)
  expect((await planFor(as, home.householdId, [home.shirt])).result.loads[0]!.garmentAdvice?.[0]?.scope).toBe('manufacturer_embroidery')
})

test('construction invalidates stale preparation without changing required actions, doses or machine limits', async () => {
  const t = newBackend(), as = signedIn(t, 'construction-stale')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateTextile, { textileId: home.shirt, kind: 'shirt' })
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions, expectedInstructions: null })
  const before = await planFor(as, home.householdId, [home.shirt])
  await as.mutation(api.garmentAdvice.setConstruction, { textileIds: [home.shirt], facts: { zipper, delicateTrim: trim }, expectedRevisions: [{ textileId: home.shirt, revision: 0 }] })
  expect((await as.query(api.plans.get, { planId: before.planId }))!.status).toBe('stale')
  await expect(startLoad(as, { planId: before.planId, loadId: before.result.loads[0]!.id, idempotencyKey: 'stale-construction' })).rejects.toThrow('Stale')
  const after = await planFor(as, home.householdId, [home.shirt])
  const { garmentAdvice, ...load } = after.result.loads[0]!
  expect(garmentAdvice?.map((tip) => tip.tipId)).toEqual(['protect_delicate_trim']) // exact "Close fasteners" owns zipper handling
  expect(load).toEqual(before.result.loads[0])
  expect(load.labelPreparation).toEqual([{ textileIds: [home.shirt], wording: 'Close fasteners' }])
  expect((await t.run((ctx) => ctx.db.get(home.machine)))!.capacityUnits).toBe(8)
})

test('distinct construction actions preserve piece preferences and immutable facts/statuses for the load', async () => {
  const t = newBackend(), as = signedIn(t, 'construction-history')
  const home = await intakeHousehold(as)
  const pieces = [home.shirt, home.towel]
  for (const textileId of pieces) await as.mutation(api.inventory.updateTextile, { textileId, kind: 'shirt' })
  await as.mutation(api.garmentAdvice.setConstruction, { textileIds: [home.shirt], facts: { zipper, hooks: zipper, buttons: zipper, delicateTrim: trim }, expectedRevisions: [{ textileId: home.shirt, revision: 0 }] })
  await as.mutation(api.garmentAdvice.setConstruction, { textileIds: [home.towel], facts: { zipper: { ...zipper, presence: 'absent' }, delicateTrim: trim }, expectedRevisions: [{ textileId: home.towel, revision: 0 }] })
  await as.mutation(api.garmentAdvice.setReminder, { textileIds: [home.towel], enabled: false })
  const planned = await planFor(as, home.householdId, pieces)
  expect(planned.result.loads[0]!.garmentAdvice).toHaveLength(4)
  expect(planned.result.loads[0]!.garmentAdvice?.every((tip) => tip.textileIds.length === 1 && tip.textileIds[0] === home.shirt)).toBe(true)
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'construction-history' })
  const timeline = () => t.run(async (ctx) => (await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique())!)
  const advice = (await timeline()).actions.filter((step) => step.kind === 'task' && step.task === 'garment_advice')
  expect(new Set(advice.map((step) => step.id)).size).toBe(4)
  for (const step of advice) await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: step === advice[0] ? 'skipped' : 'confirmed' })
  const frozen = await timeline()
  await as.mutation(api.garmentAdvice.setConstruction, { textileIds: [home.shirt], facts: {}, expectedRevisions: [{ textileId: home.shirt, revision: 1 }] })
  await as.mutation(api.garmentAdvice.setReminder, { textileIds: pieces, enabled: null })
  expect(await timeline()).toEqual(frozen)
  await finishSteps(as, sessionId)
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const record = (await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt }))[0]!
  expect(record.activityContext?.garment?.decoration?.construction).toEqual({ zipper, hooks: zipper, buttons: zipper, delicateTrim: trim })
  expect(record.activityContext?.advice).toHaveLength(4)
  expect(record.activityContext?.advice?.map((row) => row.status)).toEqual(['skipped', 'confirmed', 'confirmed', 'confirmed'])
  expect(record.activityContext?.advice?.every((row) => row.advice.source === constructionCareSource && row.advice.policyVersion === '2')).toBe(true)
  const otherRecord = (await as.query(api.sessions.washRecordsForTextile, { textileId: home.towel }))[0]!
  expect(otherRecord.activityContext?.advice).toEqual([])
  expect(otherRecord.activityContext?.garment?.adviceReminder?.enabled).toBe(false)
  expect(otherRecord.activityContext?.garment?.decoration?.construction?.zipper?.presence).toBe('absent')
})

test('identity changes invalidate print evidence without resetting its stale-editor revision', async () => {
  const t = newBackend(), as = signedIn(t, 'print-identity')
  const home = await intakeHousehold(as)
  await as.mutation(api.garmentAdvice.setDecoration, { textileIds: [home.shirt], facts, expectedRevisions: [{ textileId: home.shirt, revision: 0 }] })
  await as.mutation(api.inventory.updateTextile, { textileId: home.shirt, identity: { brand: 'Changed maker' } })
  expect((await t.run((ctx) => ctx.db.get(home.shirt)))!.decoration).toMatchObject({ kind: 'unknown', revision: 2, source: '' })
  await expect(as.mutation(api.garmentAdvice.setDecoration, { textileIds: [home.shirt], facts, expectedRevisions: [{ textileId: home.shirt, revision: 1 }] })).rejects.toThrow('changed')
})

test('one grouped optional task supports skip while label preparation stays required and snapshots remain frozen', async () => {
  const t = newBackend(), as = signedIn(t, 'print-wash')
  const home = await intakeHousehold(as)
  const pieces = [home.shirt, home.towel]
  for (const textileId of pieces) {
    await as.mutation(api.inventory.updateTextile, { textileId, kind: 't_shirt' })
    await as.mutation(api.inventory.setCareInstructions, { textileId, instructions, expectedInstructions: null })
  }
  await as.mutation(api.garmentAdvice.setDecoration, { textileIds: pieces, facts, expectedRevisions: pieces.map((textileId) => ({ textileId, revision: 0 })) })
  const planned = await planFor(as, home.householdId, pieces)
  expect(planned.result.loads[0]!.garmentAdvice).toHaveLength(1)
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'print-wash' })
  const timeline = () => t.run(async (ctx) => (await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique())!)
  const before = await timeline()
  const advice = before.actions.find((step) => step.kind === 'task' && step.task === 'garment_advice')!
  const required = before.actions.find((step) => step.kind === 'task' && step.task === 'care_preparation')!
  expect(advice.kind === 'task' ? advice.garments : []).toHaveLength(2)
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: advice.id, status: 'missed' })).rejects.toThrow('done or skipped')
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: required.id, status: 'skipped' })).rejects.toThrow('only be marked done')
  await as.mutation(api.actions.recordAction, { sessionId, actionId: advice.id, status: 'skipped', receiptId: 'print-advice-receipt-01' })
  await as.mutation(api.actions.recordAction, { sessionId, actionId: advice.id, status: 'skipped', receiptId: 'print-advice-receipt-01' })
  expect((await timeline()).actions.find((step) => step.id === advice.id)!.status).toBe('skipped')
  const frozen = await timeline()
  await as.mutation(api.garmentAdvice.setReminder, { textileIds: pieces, enabled: false })
  await as.mutation(api.garmentAdvice.setDecoration, { textileIds: pieces, facts: { ...facts, method: 'unknown' }, expectedRevisions: pieces.map((textileId) => ({ textileId, revision: 1 })) })
  expect(await timeline()).toEqual(frozen)
  const session = (await t.run((ctx) => ctx.db.get(sessionId)))!
  expect(session.preparationContext?.garments.every((piece) => piece.decoration?.method === 'dtg')).toBe(true)
  expect(session.preparationContext?.garments.every((piece) => piece.care?.instructions?.preparation[0] === 'Close fasteners')).toBe(true)
  await finishSteps(as, sessionId)
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  for (const textileId of pieces) {
    const record = (await as.query(api.sessions.washRecordsForTextile, { textileId }))[0]!
    expect(record.activityContext?.advice).toEqual([{ actionId: advice.id, advice: advice.kind === 'task' ? advice.advice : undefined, status: 'skipped', recordedAt: frozen.actions.find((step) => step.id === advice.id)!.recordedAt }])
    expect(record.activityContext?.garment?.decoration?.method).toBe('dtg')
  }
})

test('reminder reset affects selected future pieces only and never hides recorded inside-out labels', async () => {
  const t = newBackend(), as = signedIn(t, 'print-reminder')
  const home = await intakeHousehold(as)
  for (const textileId of [home.shirt, home.towel]) await as.mutation(api.inventory.updateTextile, { textileId, kind: 't_shirt' })
  const textileIds = [home.shirt, home.towel]
  await as.mutation(api.garmentAdvice.setDecoration, { textileIds, facts, expectedRevisions: textileIds.map((textileId) => ({ textileId, revision: 0 })) })
  await as.mutation(api.garmentAdvice.setReminder, { textileIds: [home.shirt], enabled: false })
  expect((await planFor(as, home.householdId, textileIds)).result.loads[0]!.garmentAdvice?.[0]?.textileIds).toEqual([home.towel])
  await as.mutation(api.garmentAdvice.setReminder, { textileIds: [home.shirt], enabled: null })
  expect((await planFor(as, home.householdId, textileIds)).result.loads[0]!.garmentAdvice?.[0]?.textileIds).toHaveLength(2)
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: { ...instructions, preparation: ['Turn inside out'] }, expectedInstructions: null })
  await as.mutation(api.garmentAdvice.setReminder, { textileIds, enabled: false })
  const load = (await planFor(as, home.householdId, textileIds)).result.loads[0]!
  expect(load.garmentAdvice).toBeUndefined()
  expect(load.labelPreparation).toEqual([{ textileIds: [home.shirt], wording: 'Turn inside out' }])
  await as.mutation(api.garmentAdvice.setReminder, { textileIds, enabled: null })
  expect((await planFor(as, home.householdId, textileIds)).result.loads[0]!.garmentAdvice?.[0]?.textileIds).toEqual([home.towel])
})
