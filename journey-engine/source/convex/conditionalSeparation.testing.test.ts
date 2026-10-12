import { expect, test } from 'vitest'
import { api } from './_generated/api'
import { careInstructionKey, careInstructionRevision, type CareInstructions } from './careInstructions'
import { intakeHousehold, newBackend, planFor, signedIn } from './harness.testing'

const wording = 'Wash separately for the first wash only'
const instructions: CareInstructions = { source: 'Synthetic sewn label, both sides', symbolSystem: 'Synthetic exact edition',
  preparation: [], washing: [wording], beforeDrying: [], drying: [], afterDrying: [], ironing: [],
  washingRequirements: [{ wording, checked: true, requirements: [{ kind: 'wash_alone_first_wash' }, { kind: 'no_bleach' }] }],
}

test('first-wash separation has exact source, wording and checked-state revisions without changing old keys', () => {
  const old = { ...instructions, washingRequirements: undefined }
  expect(careInstructionKey(old)).toBe(JSON.stringify([old.source, old.symbolSystem, [], [wording], [], [], [], [], null, null, null]))
  const key = careInstructionRevision(instructions)
  for (const changed of [
    { ...instructions, source: 'Different exact source' },
    { ...instructions, symbolSystem: 'Different edition' },
    { ...instructions, washing: [`${wording}.`] },
    { ...instructions, washingRequirements: instructions.washingRequirements!.map((entry) => ({ ...entry, checked: false })) },
    { ...instructions, washingRequirements: instructions.washingRequirements!.map((entry) => ({ ...entry, requirements: [{ kind: 'no_bleach' as const }] })) },
  ]) expect(careInstructionRevision(changed)).not.toBe(key)
  expect(careInstructionRevision({ ...instructions, source: instructions.source })).toBe(key)
})

test('schema capture and stale guard retain the entire binding; symbol edits cannot erase it', async () => {
  const t = newBackend()
  const as = signedIn(t, 'conditional-capture')
  const home = await intakeHousehold(as)
  // Storage contract only. Root must integrate the supported-kind intake and planner callers.
  await t.run(async (ctx) => {
    const row = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', home.shirt)).unique()
    await ctx.db.patch(row!._id, { instructions })
  })
  await as.mutation(api.inventory.answerTagQuestions, { textileIds: [home.shirt], washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, dryMethod: 'tumble_dry', dryHeat: 'low' })
  const saved = await t.run((ctx) => ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', home.shirt)).unique())
  expect(saved?.instructions).toEqual(instructions)
  await expect(as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: null, expectedInstructions: { ...instructions, washingRequirements: instructions.washingRequirements!.map((entry) => ({ ...entry, checked: false })) } })).rejects.toThrow('wording changed')
  await as.mutation(api.inventory.setCareInstructions, { textileId: home.shirt, instructions: null, expectedInstructions: instructions })
  expect(instructions.washingRequirements?.[0]?.requirements).toEqual([{ kind: 'wash_alone_first_wash' }, { kind: 'no_bleach' }])
})

test('recorded washing clears first-wash state and stales plans without changing the conditional label', async () => {
  const t = newBackend()
  const as = signedIn(t, 'conditional-recorded-wash')
  const home = await intakeHousehold(as)
  const previous = await planFor(as, home.householdId, [home.towel])
  await t.run(async (ctx) => {
    const row = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', home.shirt)).unique()
    await ctx.db.patch(row!._id, { instructions })
    await ctx.db.patch(home.shirt, { firstWash: true, status: 'dirty' })
  })
  await as.mutation(api.closet.washedElsewhere, { textileIds: [home.shirt], method: 'elsewhere' })
  expect(await t.run((ctx) => ctx.db.get(home.shirt))).toMatchObject({ firstWash: false, washCount: 1 })
  expect(await as.query(api.plans.get, { planId: previous.planId })).toMatchObject({ status: 'stale' })
  const saved = await t.run((ctx) => ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', home.shirt)).unique())
  expect(saved?.instructions).toEqual(instructions)
  expect(careInstructionRevision(saved!.instructions!)).toBe(careInstructionRevision(instructions))
})
