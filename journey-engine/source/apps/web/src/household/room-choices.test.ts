import type { LoadAlternate, TreatmentStep } from '@washcloset/planner'
import { expect, test } from 'vitest'

import type { Machine } from '@/household/inventory-types'
import type { PlanLoad } from '@/laundry/laundry-pass'
import { blockReason, classChanges, classWord, loadFor, roomArrivalMachines, roomGroups } from '@/household/room-choices'

let next = 0
const machine = (overrides: Partial<Machine> = {}): Machine => ({
  machineId: `m${(next += 1)}` as Machine['machineId'],
  name: 'Washer',
  model: null,
  applianceType: 'front_load_washer',
  highEfficiency: true,
  heatSettings: [],
  capacityUnits: 13.5,
  capacityConfidence: 'verified',
  supportedCycles: ['normal'],
  placements: ['detergent_compartment', 'softener_compartment', 'bleach_compartment'],
  cycleMinutes: {},
  availability: 'available',
  location: 'shared',
  pricePerStart: 2,
  drumVolume: { amount: 3.42, unit: 'cu_ft' },
  archived: false,
  provenance: { source: 'machine_taps', confidence: 'observed' },
  ...overrides,
} as Machine)

const topLoaders = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => machine({ machineId: `top${n}` as Machine['machineId'], name: `Top-loader ${n}`, applianceType: 'top_load_washer', highEfficiency: false, placements: ['direct_to_drum'], capacityUnits: 11.5, drumVolume: { amount: 2.83, unit: 'cu_ft' } }))
const frontLoaders = [1, 2, 3, 4].map((n) => machine({ machineId: `front${n}` as Machine['machineId'], name: `Front-loader ${n}` }))
const allMachines = [...frontLoaders, ...topLoaders]

const treatment = (overrides: Partial<TreatmentStep> = {}): TreatmentStep => ({
  supplyId: 'detergent',
  dose: { amount: 2, unit: 'cap', mark: 'Line 2' },
  measurementCue: null,
  stage: 'wash',
  placement: 'detergent_compartment',
  timing: null,
  rationale: '',
  source: 'verified-product-label',
  confirmation: 'confirmed',
  ...overrides,
})

const alternate = (overrides: Partial<LoadAlternate> = {}): LoadAlternate => ({
  machineId: 'top1',
  machineIds: topLoaders.map((m) => m.machineId as string),
  applianceType: 'top_load_washer',
  washerClass: 'standard',
  capacityUnits: 11.5,
  cycle: 'normal',
  temperatureC: 30,
  treatments: [],
  status: 'ready',
  problems: [],
  ...overrides,
})

const load = (overrides: Partial<PlanLoad> = {}): PlanLoad => ({
  id: 'load-1',
  textileIds: ['t1'],
  owners: [],
  bulkUnits: 4,
  capacityUnits: 13.5,
  machineId: 'front1',
  machineModelId: null,
  cycle: 'normal',
  temperatureC: 30,
  treatments: [treatment()],
  status: 'ready',
  loadSize: null,
  soilLevel: null,
  washerClass: 'he',
  drying: null,
  ...overrides,
} as PlanLoad)

// ---- roomGroups -------------------------------------------------------------------------

test('arrival retains a lone shared washer while the load is blocked, without calling it startable', () => {
  const washer = machine({ machineId: 'solo' as Machine['machineId'], name: 'Washer 14' })
  const blocked = load({ machineId: washer.machineId, status: 'needs_confirmation' })
  const groups = roomGroups(blocked, [washer], [])
  expect(groups).toEqual([])
  expect(roomArrivalMachines(blocked, [washer], groups).map((entry) => entry.machineId)).toEqual(['solo'])
  expect(roomArrivalMachines(blocked, [{ ...washer, archived: true }], [])).toEqual([])
  expect(roomArrivalMachines(load({ machineId: null }), [washer], [])).toEqual([])
})

test('a mixed room gives 2 groups, own first, with $2.00 metas and physical-order machines', () => {
  const mixedLoad = load({ roomMachineIds: frontLoaders.map((m) => m.machineId as string), alternates: [alternate()] })
  const groups = roomGroups(mixedLoad, allMachines, [])
  expect(groups.map((g) => g.title)).toEqual(['Front-loaders', 'Top-loaders'])
  expect(groups[0]!.own).toBe(true)
  expect(groups[1]!.own).toBe(false)
  expect(groups[0]!.meta).toBe('$2.00 · door locks, drawer')
  expect(groups[1]!.meta).toBe('$2.00 · lid, no drawer')
  // Physical order, never sorted by availability: Top-loader 1 first even though none are marked free here.
  expect(groups[1]!.machines.map((m) => m.name)).toEqual(['Top-loader 1', 'Top-loader 2', 'Top-loader 3', 'Top-loader 4', 'Top-loader 5', 'Top-loader 6', 'Top-loader 7', 'Top-loader 8'])
})

test('an in-unit single washer gives no groups', () => {
  const home = machine({ machineId: 'home1' as Machine['machineId'], name: 'Washer', location: 'home' })
  expect(roomGroups(load({ machineId: 'home1' }), [home], [])).toEqual([])
})

test('a single-class shared room of 4 gives 1 group', () => {
  const groups = roomGroups(load({ machineId: 'front1' }), frontLoaders, [])
  expect(groups).toHaveLength(1)
  expect(groups[0]!.own).toBe(true)
  expect(groups[0]!.machines).toHaveLength(4)
})

test('a lone shared washer with no siblings and no alternates gives no groups', () => {
  const lone = machine({ machineId: 'lone1' as Machine['machineId'], name: 'Washer' })
  expect(roomGroups(load({ machineId: 'lone1' }), [lone], [])).toEqual([])
})

test('startable reflects startableIds, and a blocked alternate carries a reason', () => {
  const blocked = alternate({ status: 'blocked', problems: [{ cause: 'label_row_needed', supplyId: 'detergent' }] })
  const mixedLoad = load({ roomMachineIds: frontLoaders.map((m) => m.machineId as string), alternates: [blocked] })
  const groups = roomGroups(mixedLoad, allMachines, ['front1'], (id) => (id === 'detergent' ? 'Tide' : null))
  expect(groups[0]!.startable).toBe(true)
  expect(groups[1]!.startable).toBe(false)
  expect(groups[1]!.reason).toBe("Your Tide label has no line for a standard washer on record. Add it at home, or pick a front-loader.")
})

// ---- loadFor ------------------------------------------------------------------------------

test('loadFor gives the base for its own class, an alternate for its ids, and null otherwise', () => {
  const altTreatments = [treatment({ placement: 'direct_to_drum' })]
  const roomLoad = load({ roomMachineIds: ['front1', 'front2'], alternates: [alternate({ machineId: 'top1', machineIds: ['top1', 'top2'], treatments: altTreatments })] })
  expect(loadFor(roomLoad, 'front1')).toBe(roomLoad.treatments)
  expect(loadFor(roomLoad, 'front2')).toBe(roomLoad.treatments)
  expect(loadFor(roomLoad, 'top1')).toBe(altTreatments)
  expect(loadFor(roomLoad, 'top2')).toBe(altTreatments)
  expect(loadFor(roomLoad, 'unknown')).toBeNull()
})

// ---- classChanges ---------------------------------------------------------------------------

test('classChanges lists product changes in 3 lines or fewer, plus the door/lid line', () => {
  const from = [
    treatment({ supplyId: 'detergent', placement: 'detergent_compartment', stage: 'wash' }),
    treatment({ supplyId: 'lysol', placement: 'softener_compartment', stage: 'rinse', dose: { amount: 2, unit: 'cap', mark: 'Line 2' } }),
  ]
  const to = [
    treatment({ supplyId: 'detergent', placement: 'direct_to_drum', stage: 'wash', timing: 'before loading the clothes', dose: { amount: 2, unit: 'cap', mark: 'Line 1' } }),
    treatment({ supplyId: 'lysol', placement: 'direct_to_drum', stage: 'rinse', timing: 'at the start of the rinse', dose: { amount: 2, unit: 'cap', mark: 'Line 1' } }),
  ]
  const names: Record<string, string> = { detergent: 'Tide', lysol: 'Lysol' }
  const lines = classChanges(from, to, (id) => names[id] ?? null, { doorLocks: false, minutes: 47 })
  expect(lines.length).toBeLessThanOrEqual(3)
  expect(lines[0]).toContain('Tide:')
  expect(lines[0]).toContain('(was:')
  expect(lines[1]).toContain('Lysol:')
  expect(lines[1]).toContain("(I'll remind you)")
  expect(lines.at(-1)).toBe('Lid opens mid-cycle · 47 min')
})

test('classChanges to a locked-door washer reads Door locks, and skips unchanged products', () => {
  const step = treatment({ supplyId: 'detergent', placement: 'detergent_compartment', stage: 'wash' })
  const lines = classChanges([step], [step], () => 'Tide', { doorLocks: true, minutes: 35 })
  // Nothing changed for the only product, so only the door line remains.
  expect(lines).toEqual(['Door locks: everything goes in before Start · 35 min'])
})

// ---- blockReason ----------------------------------------------------------------------------

test('each blockReason cause gives its words', () => {
  const own = classWord('front_load_washer')
  expect(blockReason(alternate({ status: 'too_full' }), () => null, own)).toBe('Too full for a top-loader. Try a front-loader.')
  expect(blockReason(alternate({ status: 'blocked', problems: [{ cause: 'label_row_needed', supplyId: 'detergent' }] }), () => 'Tide', own))
    .toBe('Your Tide label has no line for a standard washer on record. Add it at home, or pick a front-loader.')
  expect(blockReason(alternate({ status: 'blocked', problems: [{ cause: 'unsupported_machine_placement', supplyId: 'bleach' }] }), () => 'Clorox', own))
    .toBe("Clorox needs a slot top-loaders don't have.")
  expect(blockReason(alternate({ status: 'blocked', problems: [{ cause: 'unsupported_machine_cycle' }] }), () => null, own))
    .toBe('No normal cycle on record for top-loaders.')
  expect(blockReason(alternate({ status: 'blocked', problems: [{ cause: 'shared_compartment_conflict', supplyId: 'lysol' }, { cause: 'shared_compartment_conflict', supplyId: 'downy' }] }), (id) => (id === 'lysol' ? 'Lysol' : 'Downy'), own))
    .toBe("Lysol and Downy can't share the rinse on a top-loader.")
  expect(blockReason(alternate({ status: 'blocked', problems: [{ cause: 'insufficient_machine_evidence' }] }), () => null, own))
    .toBe("Top-loaders can't take this load as planned.")
})
