import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { isDryerPhase } from '@washcloset/planner'
import { api } from './_generated/api'
import { dryingInstructionToken, type CareInstructions } from './careInstructions'
import { applyDryerStart } from './execution'
import { addDryer, dryingCare, intakeHousehold, newBackend, planFor, signedIn, startLoad, type Caller } from './harness.testing'
import type { Id } from './_generated/dataModel'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const words: CareInstructions = { source: 'Synthetic sewn label, front and reverse', symbolSystem: 'Recorded test system',
  preparation: ['Turn inside out; zip the removable liner'], washing: [], beforeDrying: ['Reshape while damp'], drying: [], afterDrying: ['Remove promptly and smooth'], ironing: ['Use a press cloth on the undecorated reverse'],
  professionalDry: { permission: 'not_allowed', wording: 'Do not professionally dry clean' },
  professionalWet: { permission: 'allowed', wording: 'Professional wet clean, very mild process' }, maximumSoakMinutes: 2,
}
const process = { source: 'Synthetic exact model manual and controls', programLabel: 'Normal / Extra Rinse / No Spin', extraRinses: 2, rinseTemperatureC: 20, spinRpm: 0, spinMinutes: 0 }
const washWords: CareInstructions = { ...words, washing: ['Maximum half drum; two extra cool rinses; no spin'],
  washingRequirements: [{ wording: 'Maximum half drum; two extra cool rinses; no spin', checked: true, requirements: [{ kind: 'maximum_fill_fraction', value: 0.5 }, { kind: 'extra_rinses', value: 2 }, { kind: 'maximum_rinse_temperature', value: 20 }, { kind: 'no_spin' }] }],
}

test('mechanical severity and positive detergent contents survive storage and gate the actual selected process', async () => {
  const t = newBackend()
  const as = signedIn(t, 'remaining-process')
  const home = await intakeHousehold(as)
  const instructions: CareInstructions = { ...words, washing: ['Very mild process; fragrance-free, dye-free detergent without bleach'],
    washingRequirements: [{ wording: 'Very mild process; fragrance-free, dye-free detergent without bleach', checked: true, requirements: [
      { kind: 'maximum_mechanical_severity', value: 'very_mild' }, { kind: 'detergent_fragrance_free' }, { kind: 'detergent_dye_free' }, { kind: 'detergent_bleach_free' },
    ] }],
  }
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions, expectedInstructions: null })
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: { ...process, programLabel: 'Gentle' } } })
  expect((await planFor(as, home.householdId, [home.shirt])).result.loads).toHaveLength(0)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: { ...process, mechanicalSeverity: 'very_mild' } } })
  expect((await planFor(as, home.householdId, [home.shirt])).result.status).not.toBe('ready')
  const safety = { bleachKind: 'none' as const, fragrance: 'free' as const, dye: 'free' as const, incompatibleSupplyIds: [], incompatibleMaterials: [], factSource: 'Synthetic exact pack' }
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, safety })
  const planned = await planFor(as, home.householdId, [home.shirt])
  expect(planned.result.status).toBe('ready')
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, safety: { ...safety, dye: 'dyed' } })
  await expect(startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'changed-contents' })).rejects.toThrow()
  expect((await planFor(as, home.householdId, [home.shirt])).result.status).not.toBe('ready')
  const saved = await t.run((ctx) => ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', home.shirt)).unique())
  expect(saved?.instructions).toEqual(instructions)
})

test('process bindings require exact current source lines, supported values and checked interpretations', async () => {
  const t = newBackend()
  const as = signedIn(t, 'process-intake')
  const home = await intakeHousehold(as)
  for (const requirements of [
    [{ wording: 'Different wording', checked: true, requirements: [{ kind: 'no_spin' as const }] }],
    [{ wording: washWords.washing[0]!, checked: true, requirements: [{ kind: 'maximum_fill_fraction' as const, value: 2 }] }],
    [{ wording: washWords.washing[0]!, checked: true, requirements: [{ kind: 'dry_flat' as const }] }],
    [...washWords.washingRequirements!, ...washWords.washingRequirements!],
  ]) await expect(as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: { ...washWords, washingRequirements: requirements }, expectedInstructions: null })).rejects.toThrow()
  const unchecked = { ...washWords, washingRequirements: washWords.washingRequirements!.map((entry) => ({ ...entry, checked: false })) }
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: unchecked, expectedInstructions: null })
  expect((await planFor(as, home.householdId, [home.shirt])).result.loads).toHaveLength(0)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: process } })
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: washWords, expectedInstructions: unchecked })
  expect((await planFor(as, home.householdId, [home.shirt])).result.loads[0]).toMatchObject({ status: 'ready', capacityUnits: 4 })
})

test('checked program settings become required steps; edits stale recipes and identity changes clear capabilities', async () => {
  const t = newBackend()
  const as = signedIn(t, 'checked-program')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: process } })
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: washWords, expectedInstructions: null })
  const old = await planFor(as, home.householdId, [home.shirt])
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: { ...process, spinRpm: 800 } } })
  await expect(startLoad(as, { planId: old.planId, loadId: old.result.loads[0]!.id, idempotencyKey: 'stale-process' })).rejects.toThrow()
  expect((await planFor(as, home.householdId, [home.shirt])).result.loads).toHaveLength(0)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: process } })
  const planned = await planFor(as, home.householdId, [home.shirt])
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'checked-process' })
  const detail = await as.query(api.execution.sessionDetail, { sessionId })
  const setting = detail.actions.find((action) => action.kind === 'task' && action.task === 'care_preparation' && action.detail?.includes(process.programLabel))!
  expect(setting).toBeDefined()
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: setting.id, status: 'skipped' })).rejects.toThrow('only be marked done')
  const sibling = await as.mutation(api.inventory.addMachineLikeIt, { machineId: home.machine, name: 'Another actual machine' })
  expect((await t.run((ctx) => ctx.db.get(sibling)))?.washProcesses).toBeUndefined()
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, model: 'Changed-model', washProcesses: { normal: process } })
  expect((await t.run((ctx) => ctx.db.get(home.machine)))?.washProcesses).toBeUndefined()
})

test('Start rechecks program drift and actual recorded fill after preparation has begun', async () => {
  for (const scenario of ['changed_program', 'overfilled', 'matching'] as const) {
    const t = newBackend()
    const as = signedIn(t, `start-process-${scenario}`)
    const home = await intakeHousehold(as)
    await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: process } })
    await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: washWords, expectedInstructions: null })
    const planned = await planFor(as, home.householdId, [home.shirt])
    const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: scenario })
    for (;;) {
      const detail = await as.query(api.execution.sessionDetail, { sessionId })
      const step = detail.actions.find((action) => action.status === 'pending' && !isDryerPhase(action.phase))
      if (step === undefined) throw new Error('Start action missing')
      if (step.kind === 'task' && step.task === 'start') {
        if (scenario === 'changed_program') await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: { ...process, extraRinses: 3 } } })
        await t.run((ctx) => ctx.db.patch(sessionId, { drumFullness: scenario === 'overfilled' ? 'large' : 'medium' }))
        const start = as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed' })
        if (scenario === 'matching') {
          await start
          expect((await t.run((ctx) => ctx.db.get(sessionId)))?.washerContext?.washProcesses?.normal).toEqual(process)
        } else {
          await expect(start).rejects.toThrow(scenario === 'changed_program' ? 'program or options changed' : 'recorded drum fill exceeds')
          expect((await t.run((ctx) => ctx.db.get(sessionId)))?.machineStartedAt).toBeUndefined()
        }
        break
      }
      await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: step.kind === 'task' ? 'confirmed' : 'skipped' })
    }
  }
})

test('matched drip-flat shade process requires the captured no-spin wash, current acknowledgment and explicit place confirmations', async () => {
  const t = newBackend()
  const as = signedIn(t, 'drip-process')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: process } })
  const instructions: CareInstructions = { ...words, drying: ['Drip dry flat in shade, away from direct heat'],
    dryingRequirements: [{ wording: 'Drip dry flat in shade, away from direct heat', checked: true, requirements: [{ kind: 'dry_flat' }, { kind: 'drip_dry' }, { kind: 'shade' }, { kind: 'no_direct_heat' }] }],
  }
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions, expectedInstructions: null })
  const { sessionId, piece } = await queueWash(as, home.householdId, home.shirt)
  expect(piece).toMatchObject({ method: 'flat', noSpinRecorded: true })
  expect((await t.run((ctx) => ctx.db.get(sessionId)))?.washerContext?.washProcesses?.normal).toEqual(process)
  const args = { householdId: home.householdId, pieceIds: [piece.pieceId], method: 'flat' as const, labelInstructionsAcknowledged: true,
    labelInstructionsToken: dryingInstructionToken([{ id: piece.pieceId, instructions }]) }
  await expect(as.mutation(api.dryingQueue.startAirDry, args)).rejects.toThrow('not yet matched')
  const place = { shade: true, noDirectHeat: true, drip: true }
  await expect(as.mutation(api.dryingQueue.startAirDry, { ...args, process: place, labelInstructionsToken: 'stale' })).rejects.toThrow('wording changed')
  await as.mutation(api.dryingQueue.setPiece, { pieceId: piece.pieceId, method: 'heated_hanging' })
  await expect(as.mutation(api.dryingQueue.startAirDry, { ...args, method: 'heated_hanging', process: place })).rejects.toThrow('not yet matched')
  await as.mutation(api.dryingQueue.setPiece, { pieceId: piece.pieceId, method: 'flat' })
  const runId = await as.mutation(api.dryingQueue.startAirDry, { ...args, process: place })
  await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [piece.pieceId], labelInstructionsAcknowledged: true })
  await as.mutation(api.dryingQueue.putAway, { householdId: home.householdId, pieceIds: [piece.pieceId] })
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: null, expectedInstructions: instructions })
  const record = (await t.run((ctx) => ctx.db.query('washRecords').collect())).find((entry) => entry.sessionId === sessionId)!
  expect(record.drying).toMatchObject({ method: 'flat', instructions, process: place })
})

test('a later drip interpretation cannot invent extraction evidence for a completed spinning wash', async () => {
  const t = newBackend()
  const as = signedIn(t, 'late-drip')
  const home = await intakeHousehold(as)
  await dryingCare(as, home.shirt, 'dry_flat')
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: words, expectedInstructions: null })
  const { piece } = await queueWash(as, home.householdId, home.shirt)
  const instructions: CareInstructions = { ...words, drying: ['Drip dry flat'], dryingRequirements: [{ wording: 'Drip dry flat', checked: true, requirements: [{ kind: 'dry_flat' }, { kind: 'drip_dry' }] }] }
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions, expectedInstructions: words })
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: process } })
  await expect(as.mutation(api.dryingQueue.startAirDry, { householdId: home.householdId, pieceIds: [piece.pieceId], method: 'flat', process: { drip: true }, labelInstructionsAcknowledged: true, labelInstructionsToken: dryingInstructionToken([{ id: piece.pieceId, instructions }]) })).rejects.toThrow('this wash’s recorded no-spin')
})

test('additional wording is authorized per piece, bounded, concurrent-safe and retained by symbol edits', async () => {
  const t = newBackend()
  const as = signedIn(t, 'label-owner')
  const home = await intakeHousehold(as)
  const args = { textileId: home.shirt, instructions: words, expectedInstructions: null }
  await expect(signedIn(t, 'outsider').mutation(api.inventory.setCareInstructions, args)).rejects.toThrow('Forbidden')
  for (const instructions of [{ ...words, source: '' }, { ...words, washing: Array(11).fill('No spin') }, { ...words, maximumSoakMinutes: -1 }, { ...words, washing: Array.from({ length: 10 }, (_, index) => `${index}${'界'.repeat(79)}`) }]) {
    await expect(as.mutation(api.inventory.setCareInstructions, { ...args, instructions })).rejects.toThrow()
  }
  await as.mutation(api.inventory.setCareInstructions, args)
  await expect(as.mutation(api.inventory.setCareInstructions, { ...args, instructions: { ...words, beforeDrying: [] } })).rejects.toThrow('wording changed')
  await as.mutation(api.inventory.answerTagQuestions, { textileIds: [home.shirt], washMethod: 'machine', cycle: 'normal', maxTemperatureC: 35, dryMethod: 'tumble_dry', dryHeat: 'high', ironSteam: 'allowed', steamPermission: 'allowed' })
  const saved = await t.run((ctx) => ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', home.shirt)).unique())
  expect(saved).toMatchObject({ instructions: words, material: 'cotton', maxTemperatureC: 35, dryHeat: 'high' })
  expect((await t.run((ctx) => ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', home.towel)).unique()))?.instructions).toBeUndefined()
  await expect(as.mutation(api.closet.moveToDryCleaning, { textileIds: [home.shirt] })).rejects.toThrow('prohibits professional dry cleaning')
  await t.run((ctx) => ctx.db.patch(home.shirt, { status: 'clean' }))
  await as.mutation(api.closet.setRefresh, { textileIds: [home.shirt] })
  await expect(as.mutation(api.closet.refreshed, { textileIds: [home.shirt], method: 'steam' })).rejects.toThrow('additional ironing')
})

test('label changes invalidate recipes; preparation cannot be skipped or bypassed at Start', async () => {
  const t = newBackend()
  const as = signedIn(t, 'preparation-owner')
  const home = await intakeHousehold(as)
  const old = await planFor(as, home.householdId, [home.shirt])
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: { ...words, beforeDrying: [], afterDrying: [] }, expectedInstructions: null })
  await expect(startLoad(as, { planId: old.planId, loadId: old.result.loads[0]!.id, idempotencyKey: 'old-label' })).rejects.toThrow()
  const planned = await planFor(as, home.householdId, [home.shirt, home.towel])
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'new-label' })
  const detail = await as.query(api.execution.sessionDetail, { sessionId })
  const preparation = detail.actions.filter((action) => action.kind === 'task' && action.task === 'care_preparation')
  expect(preparation).toHaveLength(1)
  expect(preparation[0]).toMatchObject({ detail: words.preparation[0], garments: [{ textileId: home.shirt }] })
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: preparation[0]!.id, status: 'skipped' })).rejects.toThrow('only be marked done')
  const start = detail.actions.find((action) => action.kind === 'task' && action.task === 'start')!
  await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: start.id, status: 'confirmed' })).rejects.toThrow('every step')
  await expect(as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: null, expectedInstructions: { ...words, beforeDrying: [], afterDrying: [] } })).rejects.toThrow('active load')
  expect((await t.run((ctx) => ctx.db.get(sessionId)))?.preparationContext?.garments.find((garment) => garment.textileId === home.shirt)?.care?.instructions?.source).toBe(words.source)
})

async function queueWash(as: Caller, householdId: Id<'households'>, textileId: Id<'textiles'>) {
  const planned = await planFor(as, householdId, [textileId])
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: `label-${textileId}` })
  for (;;) {
    const detail = await as.query(api.execution.sessionDetail, { sessionId })
    const step = detail.actions.find((action) => action.status === 'pending' && !isDryerPhase(action.phase))
    if (step === undefined) break
    await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: step.kind === 'task' ? 'confirmed' : 'skipped' })
  }
  await as.mutation(api.execution.washFinished, { sessionId })
  await expect(as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: `label-${textileId}` })).rejects.toThrow('drying queue')
  await expect(as.run(async (ctx) => {
    const session = await ctx.db.get(sessionId)
    const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique()
    if (session === null || timeline === null) throw new Error('Missing test wash')
    await applyDryerStart(ctx, session, timeline, Date.now())
  })).rejects.toThrow('drying queue')
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const queue = await as.query(api.dryingQueue.queue, { householdId })
  return { sessionId, piece: queue.pieces.find((piece) => piece.textileId === textileId)! }
}

test('drying acknowledgments are revision-bound and source wording survives completed history', async () => {
  const t = newBackend()
  const as = signedIn(t, 'drying-label-owner')
  const home = await intakeHousehold(as)
  const dryerId = await addDryer(as, home.householdId)
  await dryingCare(as, home.shirt, 'tumble_dry', 'low')
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: words, expectedInstructions: null })
  const { sessionId, piece } = await queueWash(as, home.householdId, home.shirt)
  const args = { householdId: home.householdId, pieceIds: [piece.pieceId], dryerId, minutes: 25 }
  await expect(as.mutation(api.dryingQueue.startDryer, args)).rejects.toThrow('label preparation')
  await expect(as.mutation(api.dryingQueue.startDryer, { ...args, labelInstructionsAcknowledged: true, labelInstructionsToken: 'stale' })).rejects.toThrow('wording changed')
  const changed = { ...words, beforeDrying: ['Reshape the sleeves while damp'] }
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: changed, expectedInstructions: words })
  await expect(as.mutation(api.dryingQueue.startDryer, { ...args, labelInstructionsAcknowledged: true, labelInstructionsToken: dryingInstructionToken([{ id: piece.pieceId, instructions: words }]) })).rejects.toThrow('wording changed')
  const { runId } = await as.mutation(api.dryingQueue.startDryer, { ...args, labelInstructionsAcknowledged: true, labelInstructionsToken: dryingInstructionToken([{ id: piece.pieceId, instructions: changed }]) })
  await expect(as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: null, expectedInstructions: changed })).rejects.toThrow('Put this piece away')
  await expect(as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [piece.pieceId] })).rejects.toThrow('removal and handling')
  await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [piece.pieceId], labelInstructionsAcknowledged: true })
  await as.mutation(api.dryingQueue.putAway, { householdId: home.householdId, pieceIds: [piece.pieceId] })
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: null, expectedInstructions: changed })
  const record = (await t.run((ctx) => ctx.db.query('washRecords').collect())).find((entry) => entry.sessionId === sessionId && entry.textileId === home.shirt)!
  expect(record.drying).toMatchObject({ outcome: 'tumble_dried', minutes: 25, instructions: changed })
})

test('air drying requires the current preparation and retains removal wording through put-away', async () => {
  const t = newBackend()
  const as = signedIn(t, 'air-label-owner')
  const home = await intakeHousehold(as)
  await dryingCare(as, home.shirt, 'dry_flat')
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: words, expectedInstructions: null })
  const { sessionId, piece } = await queueWash(as, home.householdId, home.shirt)
  const args = { householdId: home.householdId, pieceIds: [piece.pieceId], method: 'flat' as const }
  await expect(as.mutation(api.dryingQueue.startAirDry, args)).rejects.toThrow('label preparation')
  await expect(as.mutation(api.dryingQueue.startAirDry, { ...args, labelInstructionsAcknowledged: true, labelInstructionsToken: 'stale' })).rejects.toThrow('wording changed')
  const runId = await as.mutation(api.dryingQueue.startAirDry, { ...args, labelInstructionsAcknowledged: true, labelInstructionsToken: dryingInstructionToken([{ id: piece.pieceId, instructions: words }]) })
  await expect(as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [piece.pieceId] })).rejects.toThrow('removal and handling')
  await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [piece.pieceId], labelInstructionsAcknowledged: true })
  await as.mutation(api.dryingQueue.putAway, { householdId: home.householdId, pieceIds: [piece.pieceId] })
  const record = (await t.run((ctx) => ctx.db.query('washRecords').collect())).find((entry) => entry.sessionId === sessionId && entry.textileId === home.shirt)!
  expect(record.drying).toMatchObject({ outcome: 'left_hanging', method: 'flat', instructions: words })
})

test('unmatched drying settings block every method, including a once-only alternative', async () => {
  const t = newBackend()
  const as = signedIn(t, 'unmatched-drying-owner')
  const home = await intakeHousehold(as)
  const dryerId = await addDryer(as, home.householdId)
  await dryingCare(as, home.shirt, 'tumble_dry', 'low')
  const instructions = { ...words, drying: ['Dry flat in shade away from heat'] }
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions, expectedInstructions: null })
  const { sessionId, piece } = await queueWash(as, home.householdId, home.shirt)
  expect(piece.label).toBe('unknown')
  expect(piece.method).toBeNull()
  await as.mutation(api.dryingQueue.setPiece, { pieceId: piece.pieceId, method: 'tumble' })
  await expect(as.mutation(api.dryingQueue.startDryer, { householdId: home.householdId, pieceIds: [piece.pieceId], dryerId, minutes: 20, heat: 'low', labelInstructionsAcknowledged: true })).rejects.toThrow('not yet matched')
  await as.mutation(api.dryingQueue.setPiece, { pieceId: piece.pieceId, method: 'flat' })
  await expect(as.mutation(api.dryingQueue.startAirDry, { householdId: home.householdId, pieceIds: [piece.pieceId], method: 'flat', labelInstructionsAcknowledged: true })).rejects.toThrow('not yet matched')
  expect((await as.query(api.dryingQueue.queue, { householdId: home.householdId })).pieces[0]?.instructions?.drying).toEqual(instructions.drying)
  expect((await t.run((ctx) => ctx.db.get(sessionId)))?.preparationContext?.garments[0]?.care?.instructions).toEqual(instructions)
})
