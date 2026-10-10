import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { isDryerPhase } from '@washcloset/planner'
import { api } from './_generated/api'
import { careInstructionRevision, type CareInstructions } from './careInstructions'
import { dryingCare, finishSteps, intakeHousehold, newBackend, planFor, signedIn, startLoad } from './harness.testing'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const wording = 'Wash phase at most 10 minutes; no spin'
const words: CareInstructions = { source: 'Synthetic sewn label, both sides', preparation: [], washing: [wording], beforeDrying: [], drying: [], afterDrying: [], ironing: [], maximumSoakMinutes: 2,
  washingRequirements: [{ wording, checked: true, requirements: [{ kind: 'maximum_wash_minutes', value: 10 }, { kind: 'no_spin' }] }],
}
const process = { source: 'Synthetic exact model manual phase table for selected options', programLabel: 'Normal / Short Wash / No Spin', washMinutes: 10, spinRpm: 0 }

test('unconditional grouping kinds retain independent source-bound interpretations without a phase inference', async () => {
  for (const kind of ['wash_alone', 'wash_with_like_colors'] as const) {
    const t = newBackend()
    const as = signedIn(t, `grouping-intake-${kind}`)
    const home = await intakeHousehold(as)
    const instructions: CareInstructions = { ...words, washingRequirements: [{ wording, checked: true, requirements: [{ kind }, { kind: 'maximum_wash_minutes', value: 10 }] }] }
    await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions, expectedInstructions: null })
    expect((await t.run((ctx) => ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', home.shirt)).unique()))?.instructions).toEqual(instructions)
    await expect(as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: { ...instructions, drying: [wording], dryingRequirements: instructions.washingRequirements }, expectedInstructions: instructions })).rejects.toThrow('unsupported')
    const unchecked = { ...instructions, washingRequirements: [{ ...instructions.washingRequirements![0]!, checked: false }] }
    await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: unchecked, expectedInstructions: instructions })
    expect((await planFor(as, home.householdId, [home.shirt])).result.loads).toHaveLength(0)
  }
})

test('phase intake validates exact ranges/source lines and never substitutes total-cycle estimates', async () => {
  const t = newBackend()
  const as = signedIn(t, 'phase-intake')
  const home = await intakeHousehold(as)
  for (const value of [0, -1, 300.01, Number.NaN, Infinity]) {
    await expect(as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, expectedInstructions: null, instructions: { ...words, washingRequirements: [{ wording, checked: true, requirements: [{ kind: 'maximum_wash_minutes', value }] }] } })).rejects.toThrow()
    await expect(as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: { ...process, washMinutes: value } } })).rejects.toThrow()
  }
  await expect(as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, expectedInstructions: null, instructions: { ...words, washing: ['Stale wording'] } })).rejects.toThrow('current source line')
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: words, expectedInstructions: null })
  for (const configured of [{ ...process, washMinutes: undefined }, { ...process, washMinutes: 11 }, { ...process, spinRpm: 400 }]) {
    await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: configured }, cycleMinutes: { normal: 1 } })
    expect((await planFor(as, home.householdId, [home.shirt])).result.loads).toHaveLength(0)
  }
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: process }, cycleMinutes: { normal: 40 } })
  expect((await planFor(as, home.householdId, [home.shirt])).result.status).toBe('ready')
  expect((await t.run((ctx) => ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', home.shirt)).unique()))?.instructions).toEqual(words)
  const conflict = { ...words, washingRequirements: [{ wording, checked: true, requirements: [{ kind: 'maximum_wash_minutes' as const, value: 10 }, { kind: 'maximum_wash_minutes' as const, value: 30 }] }] }
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: conflict, expectedInstructions: words })
  expect((await planFor(as, home.householdId, [home.shirt])).result.loads).toHaveLength(0)
})

test('source-bound phase edits stale recipe confirmation and duration participates in care revisions', async () => {
  const t = newBackend()
  const as = signedIn(t, 'phase-recipe')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: words, expectedInstructions: null })
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: process } })
  const planned = await planFor(as, home.householdId, [home.shirt])
  await as.mutation(api.plans.confirmRecipe, { planId: planned.planId, loadId: planned.result.loads[0]!.id, machineId: home.machine })
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: { ...process, washMinutes: 9 } } })
  await expect(as.mutation(api.execution.start, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'stale-phase' })).rejects.toThrow()
  const changed = { ...words, washingRequirements: [{ wording, checked: true, requirements: [{ kind: 'maximum_wash_minutes' as const, value: 9 }, { kind: 'no_spin' as const }] }] }
  expect(careInstructionRevision(changed)).not.toBe(careInstructionRevision(words))
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: changed, expectedInstructions: words })
  await expect(as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: words, expectedInstructions: words })).rejects.toThrow('wording changed')
})

test('Start after preparation refuses changed, missing or differently sourced phase evidence', async () => {
  for (const next of [{ ...process, washMinutes: 11 }, { ...process, washMinutes: 9 }, { ...process, washMinutes: undefined }, { ...process, source: 'Changed phase source' }, { ...process, programLabel: 'Different options' }]) {
    const t = newBackend()
    const as = signedIn(t, `phase-start-${JSON.stringify(next)}`)
    const home = await intakeHousehold(as)
    await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: words, expectedInstructions: null })
    await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: process } })
    const planned = await planFor(as, home.householdId, [home.shirt])
    const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'phase-start' })
    const prepared = await as.query(api.execution.sessionDetail, { sessionId })
    const required = prepared.actions.find((action) => action.kind === 'task' && action.task === 'care_preparation' && action.detail?.includes('documented washing phase 10 min'))!
    expect(required).toBeDefined()
    await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: required.id, status: 'skipped' })).rejects.toThrow('only be marked done')
    for (;;) {
      const detail = await as.query(api.execution.sessionDetail, { sessionId })
      const step = detail.actions.find((action) => action.status === 'pending' && !isDryerPhase(action.phase))
      if (step === undefined) throw new Error('Start step missing')
      if (step.kind === 'task' && step.task === 'start') {
        await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: next } })
        await expect(as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed', minutes: 1 })).rejects.toThrow('program or options changed')
        expect((await t.run((ctx) => ctx.db.get(sessionId)))?.machineStartedAt).toBeUndefined()
        break
      }
      if (step.kind === 'task' && step.task === 'drum_fullness') await as.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'medium' })
      else await as.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: step.kind === 'task' ? 'confirmed' : 'skipped' })
    }
  }
})

test('immutable completed history retains documented phase/source separately from timers and later machine edits', async () => {
  const t = newBackend()
  const as = signedIn(t, 'phase-history')
  const home = await intakeHousehold(as)
  await dryingCare(as, home.shirt, 'dry_flat')
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: words, expectedInstructions: null })
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: process } })
  const planned = await planFor(as, home.householdId, [home.shirt])
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'phase-history' })
  await finishSteps(as, sessionId, 'medium', 42)
  expect((await t.run((ctx) => ctx.db.get(sessionId)))?.washerContext?.washProcesses?.normal).toEqual(process)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, washProcesses: { normal: { ...process, washMinutes: 20, source: 'Later source' } } })
  await as.mutation(api.execution.washFinished, { sessionId })
  await as.mutation(api.dryingQueue.queueFromWasher, { sessionId })
  const queue = await as.query(api.dryingQueue.queue, { householdId: home.householdId })
  const piece = queue.pieces.find((entry) => entry.textileId === home.shirt)!
  const runId = await as.mutation(api.dryingQueue.startAirDry, { householdId: home.householdId, pieceIds: [piece.pieceId], method: 'flat' })
  await as.mutation(api.dryingQueue.checkDry, { runId, dryPieceIds: [piece.pieceId] })
  await as.mutation(api.dryingQueue.putAway, { householdId: home.householdId, pieceIds: [piece.pieceId] })
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: null, expectedInstructions: words })
  const record = (await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt }))[0]!
  expect(record.activityContext?.washer?.washProcesses?.normal).toEqual(process)
  expect(record.activityContext?.washer?.cycleProfile?.cycles.normal?.durationMinutes).toBe(40)
  expect(record.activityContext?.garment?.care?.instructions).toEqual(words)
  expect((await t.run((ctx) => ctx.db.get(sessionId)))?.cycleMinutesShown).toBe(42)
})
