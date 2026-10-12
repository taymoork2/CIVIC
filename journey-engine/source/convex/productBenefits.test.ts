import { expect, test } from 'vitest'
import type { CapabilityEvidence } from '@washcloset/planner'
import { api } from './_generated/api'
import { intakeHousehold, label, newBackend, planFor, signedIn, startLoad } from './harness.testing'

const capability = (overrides: Partial<CapabilityEvidence> = {}): CapabilityEvidence => ({ kind: 'oxygen_bleaching', status: 'present', variant: 'Synthetic exact pack', market: 'US', formulationRevision: 'test-revision', source: 'synthetic disclosure', retrievedAt: 1, scope: 'ingredient_disclosure', ...overrides })
const safety = (capabilities: CapabilityEvidence[]) => ({ bleachKind: 'none' as const, incompatibleSupplyIds: [], incompatibleMaterials: [], capabilities })

test('capability facts require bounded exact identity, explicit absence and valid retrieval dates', async () => {
  const t = newBackend()
  const as = signedIn(t, 'capability-validation')
  const home = await intakeHousehold(as)
  const create = (facts: CapabilityEvidence[]) => as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Exact pack', kind: 'chemical', safety: safety(facts), provenance: label('synthetic pack') })
  for (const invalid of [capability({ variant: ' ' }), capability({ market: '' }), capability({ formulationRevision: '' }), capability({ source: '' }), capability({ source: 'x'.repeat(501) }), capability({ retrievedAt: 0 }), capability({ retrievedAt: -1 }), capability({ retrievedAt: Date.now() + 172_800_000 }), capability({ status: 'absent' }), capability({ scope: 'explicit_absence' })]) {
    await expect(create([invalid])).rejects.toThrow()
  }
  await expect(create([capability(), capability()])).rejects.toThrow('one fact per')
  const facts = [capability(), capability({ kind: 'protease', status: 'absent', scope: 'explicit_absence' }), capability({ kind: 'lipase', status: 'unknown' })]
  const supplyId = await create(facts)
  const stored = (await as.query(api.inventory.list, { householdId: home.householdId })).supplies.find((entry) => entry.supplyId === supplyId)!
  expect(stored.safety?.capabilities).toEqual(facts)
  await expect(signedIn(t, 'outsider').mutation(api.inventory.updateSupply, { supplyId, safety: safety(facts) })).rejects.toThrow('Forbidden')
})

test('editing product identity invalidates capability facts, including facts replayed by a stale editor', async () => {
  const t = newBackend()
  const as = signedIn(t, 'capability-identity')
  const home = await intakeHousehold(as)
  const supplyId = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Exact pack', kind: 'chemical', formulation: { form: 'liquid', name: 'revision one' }, safety: safety([capability()]), provenance: label('synthetic pack') })
  const read = async () => (await as.query(api.inventory.list, { householdId: home.householdId })).supplies.find((entry) => entry.supplyId === supplyId)!
  // Stored Convex objects can return fields in a different order from the editor payload.
  await t.run((ctx) => ctx.db.patch(supplyId, { formulation: { form: 'liquid', name: 'revision one' } }))
  await as.mutation(api.inventory.updateSupply, { supplyId, formulation: { name: 'revision one', form: 'liquid' }, safety: safety([capability()]) })
  expect((await read()).safety?.capabilities).toHaveLength(1)
  await as.mutation(api.inventory.updateSupply, { supplyId, name: 'Other pack', safety: safety([capability()]) })
  expect((await read()).safety?.capabilities).toBeUndefined()
  await as.mutation(api.inventory.updateSupply, { supplyId, safety: safety([capability()]) })
  expect((await read()).safety?.capabilities).toHaveLength(1)
  await as.mutation(api.inventory.updateSupply, { supplyId, formulation: { form: 'powder', name: 'revision two' }, safety: safety([capability()]) })
  expect((await read()).safety?.capabilities).toBeUndefined()
  await as.mutation(api.inventory.updateSupply, { supplyId, safety: { ...safety([capability()]), ingredients: ['changed ingredient'] } })
  expect((await read()).safety?.capabilities).toBeUndefined()
})

test('optional selection and goals survive reload, sort into a stable hash and reject other households', async () => {
  const t = newBackend()
  const as = signedIn(t, 'capability-pass')
  const home = await intakeHousehold(as)
  const a = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Unread A', kind: 'chemical', safety: safety([capability()]), provenance: { source: 'not checked', confidence: 'unknown' } })
  const b = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Unread B', kind: 'chemical', provenance: { source: 'not checked', confidence: 'unknown' } })
  const ordinary = await planFor(as, home.householdId, [home.shirt])
  expect(ordinary.status).toBe('ready')
  expect(ordinary.result.loads[0]!.treatments.map((step) => step.supplyId)).toEqual([home.detergent])
  expect((await as.query(api.plans.questions, { planId: ordinary.planId })).some((question) => question.key.subjectId === a || question.key.subjectId === b)).toBe(false)
  const chosen = await planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [b, a, a], washGoals: ['visible_stain', 'dull_grey', 'visible_stain'] })
  expect(chosen.status).toBe('needs_confirmation')
  expect(chosen.pass.optionalSupplyIds).toEqual([a, b].sort())
  expect(chosen.pass.washGoals).toEqual(['dull_grey', 'visible_stain'])
  const reloaded = (await as.query(api.plans.get, { planId: chosen.planId }))!
  expect(reloaded.pass).toEqual(chosen.pass)
  const reordered = await planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [a, b], washGoals: ['dull_grey', 'visible_stain'] })
  expect(reordered.inputHash).toBe(chosen.inputHash)
  expect(reordered.planId).toBe(chosen.planId)
  const other = await intakeHousehold(signedIn(t, 'other-home'))
  await expect(planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [other.detergent] })).rejects.toThrow()
  const noExtra = await planFor(as, home.householdId, [home.shirt])
  expect(noExtra.status).toBe('ready')
  expect(noExtra.pass.optionalSupplyIds).toEqual([])
  expect(noExtra.pass.washGoals).toEqual(['ordinary'])
})

test('a legacy running recipe preserves selected additions and immutable execution steps', async () => {
  const t = newBackend()
  const as = signedIn(t, 'legacy-recipe')
  const home = await intakeHousehold(as)
  const addition = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Synthetic addition', kind: 'chemical', use: 'booster', formulation: { form: 'powder' }, safety: safety([capability()]), provenance: label('synthetic label') })
  await as.mutation(api.inventory.saveRule, { supplyId: addition, dose: { amount: 10, unit: 'g' }, stage: 'wash', placement: 'direct_to_drum', timing: 'before cycle start', provenance: label('synthetic label') })
  const planned = await planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [addition] })
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'legacy' })
  await t.run(async (ctx) => {
    const stored = (await ctx.db.get(planned.planId))!
    const { optionalSupplyIds: _selected, washGoals: _goals, ...legacy } = stored.inputSnapshot as Record<string, unknown>
    await ctx.db.patch(planned.planId, { inputSnapshot: legacy, plannerVersion: 'planner-v2.11' })
  })
  const executionSteps = () => t.run(async (ctx) => (await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique())!.actions)
  const before = await executionSteps()
  expect(before.filter((step) => step.kind === 'treatment').map((step) => step.supplyId)).toContain(addition)
  const legacy = (await as.query(api.plans.get, { planId: planned.planId }))!
  expect(legacy.pass.optionalSupplyIds).toContain(addition)
  expect(legacy.pass.washGoals).toEqual(['ordinary'])
  await planFor(as, home.householdId, [home.shirt])
  expect(await executionSteps()).toEqual(before)
})
