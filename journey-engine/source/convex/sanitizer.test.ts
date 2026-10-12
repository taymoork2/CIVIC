import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api } from './_generated/api'
import { intakeHousehold, label, newBackend, planFor, signedIn, startLoad, type Caller } from './harness.testing'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const contact = (minutes: number) => ({ normal: { minutes, placement: 'softener_compartment', source: 'Synthetic release-to-drain observation' } })
const safety = { bleachKind: 'none' as const, incompatibleSupplyIds: [], incompatibleMaterials: [],
  sanitizing: { route: 'rinse' as const, minimumContactMinutes: 16, formulation: 'Synthetic exact pack', source: 'Synthetic label' } }

async function setup(as: Caller) {
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, placements: ['detergent_compartment', 'softener_compartment', 'direct_to_drum'] })
  const sanitizer = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Synthetic sanitizer', kind: 'chemical', use: 'rinse_sanitizer',
    formulation: { form: 'liquid' }, safety, provenance: label('Synthetic label') })
  await as.mutation(api.inventory.saveRule, { supplyId: sanitizer, dose: { amount: 10, unit: 'ml' }, stage: 'rinse', placement: 'softener_compartment', timing: 'Before starting', provenance: label('Synthetic label') })
  return { ...home, sanitizer }
}

test('a whole-cycle timer and another program cannot supply rinse contact; exact evidence persists and changes the recipe', async () => {
  const t = newBackend()
  const as = signedIn(t, 'sanitizer-owner')
  const home = await setup(as)
  const compute = () => planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [home.sanitizer] })
  expect((await compute()).status).toBe('needs_confirmation')
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, rinseContact: { delicate: { minutes: 20, placement: 'softener_compartment', source: 'Synthetic observation' } } })
  expect((await compute()).status).toBe('needs_confirmation')
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, rinseContact: contact(15) })
  expect((await compute()).status).toBe('needs_confirmation')
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, rinseContact: contact(16) })
  const ready = await compute()
  expect(ready.status).toBe('ready')
  expect((await t.run((ctx) => ctx.db.get(home.sanitizer)))?.safety?.sanitizing).toEqual(safety.sanitizing)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, name: 'Renamed washer' })
  expect((await compute()).status).toBe('ready')
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, model: 'Different model' })
  expect((await t.run((ctx) => ctx.db.get(home.machine)))?.rinseContact).toBeUndefined()
  expect((await compute()).status).toBe('needs_confirmation')
  await expect(startLoad(as, { planId: ready.planId, loadId: ready.result.loads[0]!.id, idempotencyKey: 'stale-contact', startedAt: Date.now() })).rejects.toThrow()
  expect((await planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [home.sanitizer], excludedSupplyIds: [home.sanitizer] })).status).toBe('ready')
})

test('otherwise identical room washers cannot inherit contact time, including the Start mutation', async () => {
  const t = newBackend()
  const as = signedIn(t, 'sanitizer-owner')
  const home = await setup(as)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, rinseContact: contact(16) })
  const sibling = await as.mutation(api.inventory.addMachineLikeIt, { machineId: home.machine, name: 'Second washer' })
  expect((await t.run((ctx) => ctx.db.get(sibling)))?.rinseContact).toBeUndefined()
  await as.mutation(api.inventory.updateMachine, { machineId: sibling, rinseContact: contact(5) })
  await as.mutation(api.inventory.setPlanning, { householdId: home.householdId, preferredMachineId: home.machine })
  const planned = await planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [home.sanitizer] })
  expect(planned.status).toBe('ready')
  expect(planned.loadStates[0]!.startableMachineIds).toContain(home.machine)
  expect(planned.loadStates[0]!.startableMachineIds).not.toContain(sibling)
  await expect(startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, machineId: sibling, idempotencyKey: 'short-sibling', startedAt: Date.now() })).rejects.toThrow()
  expect(await t.run((ctx) => ctx.db.query('sessions').collect())).toHaveLength(0)
  await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, machineId: home.machine, idempotencyKey: 'qualified', startedAt: Date.now() })
})

test('contact claims reject incomplete inputs and require household access', async () => {
  const t = newBackend()
  const as = signedIn(t, 'sanitizer-owner')
  const outsider = signedIn(t, 'outsider')
  const home = await setup(as)
  for (const sanitizing of [{ ...safety.sanitizing, source: '' }, { ...safety.sanitizing, formulation: '' }, { ...safety.sanitizing, minimumContactMinutes: 0 }]) {
    await expect(as.mutation(api.inventory.updateSupply, { supplyId: home.sanitizer, safety: { ...safety, sanitizing } })).rejects.toThrow()
  }
  await expect(as.mutation(api.inventory.updateMachine, { machineId: home.machine, rinseContact: { normal: { minutes: 16, placement: 'softener_compartment', source: '' } } })).rejects.toThrow()
  await expect(outsider.mutation(api.inventory.updateMachine, { machineId: home.machine, rinseContact: contact(16) })).rejects.toThrow()
  await expect(outsider.mutation(api.inventory.updateSupply, { supplyId: home.sanitizer, safety })).rejects.toThrow()
})

test('changing the product identity invalidates rinse claims, including a stale full editor draft', async () => {
  const t = newBackend()
  const as = signedIn(t, 'sanitizer-owner')
  const home = await setup(as)
  await as.mutation(api.inventory.updateMachine, { machineId: home.machine, rinseContact: contact(16) })
  expect((await planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [home.sanitizer] })).status).toBe('ready')
  await as.mutation(api.inventory.updateSupply, { supplyId: home.sanitizer, name: 'Different pack', safety })
  expect((await t.run((ctx) => ctx.db.get(home.sanitizer)))?.safety?.sanitizing).toBeUndefined()
  expect((await planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [home.sanitizer] })).status).toBe('needs_confirmation')
  await as.mutation(api.inventory.updateSupply, { supplyId: home.sanitizer, safety })
  expect((await planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [home.sanitizer] })).status).toBe('ready')
  await as.mutation(api.inventory.updateSupply, { supplyId: home.sanitizer, formulation: { form: 'powder' }, safety })
  expect((await t.run((ctx) => ctx.db.get(home.sanitizer)))?.safety?.sanitizing).toBeUndefined()
})
