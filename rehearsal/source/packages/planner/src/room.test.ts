import assert from 'node:assert/strict'

import type { ApplicationRule, LoadPlan, MachineEvidence, PlanResult, PlannerInput, SupplyItem, TextileEvidence } from './index'

const { plan, planLoadOn, roomClasses } = (await import(`./index${'.ts'}`)) as typeof import('./index')

const verified = { status: 'verified' as const }
const observed = { status: 'observed' as const, source: 'label_taps' }

/** A Speed Queen top-loader in the shared room: agitator, standard, no dispensers, lid opens mid-cycle. */
export function topLoader(number: number, extra: Partial<MachineEvidence> = {}): MachineEvidence {
  return {
    id: `top-loader-${number}`,
    applianceType: 'top_load_washer',
    highEfficiency: false,
    doorLocksDuringCycle: false,
    capacityUnits: 11.5,
    capacityConfidence: 'verified',
    evidence: verified,
    supportedCycles: ['normal', 'delicate', 'heavy_duty'],
    rinseContact: Object.fromEntries(['normal', 'delicate', 'heavy_duty'].map((cycle) => [cycle, { minutes: 16, source: 'Synthetic program observation', placement: 'direct_to_drum', timing: 'at the start of the rinse' }])),
    dispensing: { placements: ['direct_to_drum'] },
    location: 'shared',
    ...extra,
  }
}

/** A Speed Queen front-loader in the same room: HE, a drawer, and a door that locks. */
export function frontLoader(number: number, extra: Partial<MachineEvidence> = {}): MachineEvidence {
  return {
    id: `front-loader-${number}`,
    applianceType: 'front_load_washer',
    highEfficiency: true,
    doorLocksDuringCycle: true,
    capacityUnits: 13.5,
    capacityConfidence: 'verified',
    evidence: verified,
    supportedCycles: ['normal', 'delicate', 'heavy_duty'],
    rinseContact: Object.fromEntries(['normal', 'delicate', 'heavy_duty'].map((cycle) => [cycle, { minutes: 16, source: 'Synthetic program observation', placement: 'softener_compartment' }])),
    dispensing: { placements: ['detergent_compartment', 'bleach_compartment', 'softener_compartment', 'prewash_compartment'] },
    location: 'shared',
    ...extra,
  }
}

/** Top-loaders 1-8 and front-loaders 1-4, in the order the owner added them. */
export function mixedRoom(): MachineEvidence[] {
  return [
    ...Array.from({ length: 8 }, (_, index) => topLoader(index + 1)),
    ...Array.from({ length: 4 }, (_, index) => frontLoader(index + 1)),
  ]
}

const room = mixedRoom()
const fromFront = roomClasses(room, room.find((machine) => machine.id === 'front-loader-3')!)
assert.equal(fromFront.length, 2, 'the mixed room has two kinds of washer')
assert.deepEqual(fromFront.map((entry) => entry.representative.id), ['front-loader-1', 'top-loader-1'], 'the lowest id stands for each kind')
assert.deepEqual(fromFront[0]!.machineIds, ['front-loader-1', 'front-loader-2', 'front-loader-3', 'front-loader-4'])
assert.deepEqual(fromFront[1]!.machineIds, Array.from({ length: 8 }, (_, index) => `top-loader-${index + 1}`))
assert.deepEqual(roomClasses(room, room[0]!), fromFront, 'the same room from a top-loader')
assert.notEqual(fromFront[0]!.key, fromFront[1]!.key)

const home: MachineEvidence = { ...frontLoader(1), id: 'home-washer', location: 'home' }
assert.deepEqual(roomClasses([home], home).map((entry) => entry.machineIds), [['home-washer']], 'one washer at home is one kind')
const unset: MachineEvidence = { ...frontLoader(1), id: 'in-unit' }
delete (unset as { location?: string }).location
assert.deepEqual(roomClasses([unset], unset).map((entry) => entry.machineIds), [['in-unit']], 'a washer with no location is one kind')
assert.deepEqual(roomClasses([...room, home], home).map((entry) => entry.machineIds), [['home-washer']], 'a washer at home never joins the shared room')
assert.deepEqual(roomClasses([unset, ...room], unset).map((entry) => entry.machineIds), [['in-unit']])

const otherRoom = topLoader(9, { location: 'elsewhere' })
assert.deepEqual(roomClasses([...room, otherRoom], room[0]!).map((entry) => entry.machineIds.length), [4, 8], 'only washers at the same shared location count')
assert.deepEqual(roomClasses(room.filter((machine) => machine.applianceType === 'top_load_washer'), room[0]!).length, 1, 'a room of twins is one kind')

// Alternates: each load in a mixed room is also planned on the other kind of washer.
const drawerAndDrum = { dispensing: { placements: ['detergent_compartment', 'bleach_compartment', 'softener_compartment', 'prewash_compartment', 'direct_to_drum'] } }
const twoAndTwo = (): MachineEvidence[] => [topLoader(1), topLoader(2), frontLoader(1, drawerAndDrum), frontLoader(2, drawerAndDrum)]

function capRule(id: string, extra: Partial<ApplicationRule>): ApplicationRule {
  return { id, dose: { amount: 1, unit: 'cap', mark: '1' }, stage: 'wash', placement: 'detergent_compartment', timing: 'before starting', evidence: observed, ...extra }
}

/** Liquid detergent whose HE and standard rows both go by how full the drum is. */
function detergent(placement: string, timing: string): SupplyItem {
  const row = (washer: string, size: string, mark: string) => capRule(`detergent-${washer}-${size}`, { placement, timing, dose: { amount: 1, unit: 'cap', mark }, conditions: { machineClasses: [washer], loadSizes: size === 'small' ? ['small', 'medium'] : ['large', 'extra_large'] } })
  return {
    id: 'detergent',
    kind: 'detergent',
    labelEvidence: observed,
    formulation: { form: 'liquid' },
    measurement: { kind: 'cap', marks: [{ label: '1' }, { label: '3' }, { label: '5' }] },
    applicationRules: [row('he', 'small', '1'), row('he', 'large', '3'), row('standard', 'small', '3'), row('standard', 'large', '5')],
  }
}

/** Lysol Laundry Sanitizer in the rinse: 2 caps to line 1 in a standard washer, to line 2 in an HE one. */
function lysol(placement: string, timing: string, washers: readonly string[] = ['standard', 'he']): SupplyItem {
  return {
    id: 'lysol',
    kind: 'sanitizer',
    sanitizing: { route: 'rinse', minimumContactMinutes: 16, formulation: 'Synthetic placement-test pack', source: 'Synthetic label' },
    labelEvidence: observed,
    formulation: { form: 'liquid' },
    measurement: { kind: 'cap', marks: [{ label: '1' }, { label: '2' }] },
    applicationRules: washers.map((washer) => capRule(`lysol-${washer}`, { stage: 'rinse', placement, timing, dose: { amount: 2, unit: 'cap', mark: washer === 'standard' ? '1' : '2' }, conditions: { machineClasses: [washer] } })),
  }
}

const oxiClean: SupplyItem = {
  id: 'oxiclean',
  kind: 'chemical_consumable',
  bleachKind: 'oxygen',
  labelEvidence: observed,
  formulation: { form: 'powder' },
  measurement: { kind: 'scoop', marks: [{ label: '1' }] },
  applicationRules: [capRule('oxiclean-any', { dose: { amount: 1, unit: 'scoop', mark: '1' }, placement: 'direct_to_drum', timing: 'before loading the clothes' })],
}

const bleach: SupplyItem = {
  id: 'bleach',
  kind: 'bleach',
  bleachKind: 'chlorine',
  labelEvidence: observed,
  formulation: { form: 'liquid' },
  applicationRules: [capRule('bleach-any', { dose: { amount: 1, unit: 'cap', mark: '1' }, placement: 'bleach_compartment' })],
}

const tees: TextileEvidence[] = Array.from({ length: 4 }, (_, index) => ({
  id: `tee-${index + 1}`,
  colorGroup: 'white',
  bulkUnits: 1,
  soilLevel: 'normal',
  care: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, dryMethod: 'tumble_dry', status: 'confirmed', evidence: observed },
}))

const frontRows = [detergent('detergent_compartment', 'before starting'), lysol('softener_compartment', 'before starting'), oxiClean]
function roomInput(supplies: readonly SupplyItem[], preferredMachineId = 'front-loader-1', extra: Partial<PlannerInput> = {}): PlannerInput {
  // This room-placement scenario deliberately requests these additions.
  return { textiles: tees, supplies, optionalSupplyIds: ['lysol', 'oxiclean', 'bleach'], machines: twoAndTwo(), preferences: { preferredMachineId }, ...extra }
}
const stepOf = (treatments: readonly LoadPlan['treatments'][number][], supplyId: string) => treatments.find((treatment) => treatment.supplyId === supplyId)
const where = (treatments: readonly LoadPlan['treatments'][number][], supplyId: string) => {
  const found = stepOf(treatments, supplyId)
  return [found?.stage, found?.placement, found?.timing]
}

const fromFrontLoaders = plan(roomInput(frontRows))
const base = fromFrontLoaders.loads[0]!
assert.equal(fromFrontLoaders.loads.length, 1)
assert.equal(base.status, 'ready')
assert.equal(base.machineId, 'front-loader-1')
assert.deepEqual(base.roomMachineIds, ['front-loader-1', 'front-loader-2'], 'the load knows the washers of its own kind')
assert.deepEqual(where(base.treatments, 'detergent'), ['wash', 'detergent_compartment', 'before starting'], 'the planned front-loader keeps the drawer')
assert.deepEqual(where(base.treatments, 'lysol'), ['rinse', 'softener_compartment', 'before starting'])
assert.deepEqual(stepOf(base.treatments, 'lysol')?.dose, { amount: 2, unit: 'cap', mark: '2' }, 'the HE row: line 2')

assert.equal(base.alternates?.length, 1)
const topAlternate = base.alternates![0]!
assert.deepEqual({ ...topAlternate, treatments: [] }, {
  machineId: 'top-loader-1',
  machineIds: ['top-loader-1', 'top-loader-2'],
  applianceType: 'top_load_washer',
  washerClass: 'standard',
  capacityUnits: 11.5,
  cycle: base.cycle,
  temperatureC: base.temperatureC,
  treatments: [],
  status: 'ready',
  problems: [],
}, 'the top-loaders can take it')
assert.deepEqual(where(topAlternate.treatments, 'detergent'), ['wash', 'direct_to_drum', 'before loading the clothes'], 'detergent goes in the empty tub')
const topDetergent = stepOf(topAlternate.treatments, 'detergent')!
assert.ok(topDetergent.atMachine?.context.machineClasses.includes('top_load_washer') && topDetergent.atMachine.context.machineClasses.includes('standard'), 'its size is read with the top-loader rows')
assert.deepEqual(topDetergent.atMachine?.candidates.map((candidate) => [candidate.size, candidate.dose.mark]), [['small', '3'], ['medium', '3'], ['large', '5'], ['extra_large', '5']], 'the standard rows')
assert.deepEqual(where(topAlternate.treatments, 'lysol'), ['rinse', 'direct_to_drum', 'at the start of the rinse'], 'Lysol goes in the rinse water when the lid opens')
assert.deepEqual(stepOf(topAlternate.treatments, 'lysol')?.dose, { amount: 2, unit: 'cap', mark: '1' }, 'the standard row: line 1')
assert.deepEqual(where(topAlternate.treatments, 'oxiclean'), ['wash', 'direct_to_drum', 'before loading the clothes'], 'OxiClean shares the empty tub with the detergent')
assert.ok(fromFrontLoaders.reasons.every((reason) => reason.code !== 'shared_compartment_conflict'), 'no false conflict')
assert.equal(fromFrontLoaders.status, 'ready')

const direct = planLoadOn(roomInput(frontRows), base, 'top-loader-2')
assert.equal(direct.status, 'ready', 'planLoadOn on any top-loader')
assert.ok(direct.status === 'ready' && direct.load.machineId === 'top-loader-2')

// Rows written for a top-loader move to the drawer on a front-loader: the rinse goes in the softener slot before Start.
const topRows = [detergent('direct_to_drum', 'before loading the clothes'), lysol('direct_to_drum', 'at the start of the rinse'), oxiClean]
const fromTopLoaders = plan(roomInput(topRows, 'top-loader-1'))
const topBase = fromTopLoaders.loads[0]!
assert.equal(topBase.machineId, 'top-loader-1')
assert.equal(topBase.status, 'ready')
assert.deepEqual(where(topBase.treatments, 'lysol'), ['rinse', 'direct_to_drum', 'at the start of the rinse'])
assert.deepEqual(topBase.alternates?.map((alternate) => [alternate.machineId, alternate.status]), [['front-loader-1', 'ready']])
const frontLysol = stepOf(topBase.alternates![0]!.treatments, 'lysol')
assert.deepEqual([frontLysol?.stage, frontLysol?.placement, frontLysol?.timing], ['rinse', 'softener_compartment', 'before starting'], 'the locked door takes Lysol in the softener slot')
assert.deepEqual(frontLysol?.dose, { amount: 2, unit: 'cap', mark: '2' }, 'at the HE row')

// A missing standard row blocks only the top-loaders, and never adds to the plan's own reasons.
const heOnly = [detergent('detergent_compartment', 'before starting'), lysol('softener_compartment', 'before starting', ['he']), oxiClean]
const noStandardRow = plan(roomInput(heOnly))
assert.equal(noStandardRow.loads[0]!.status, 'ready', 'the front-loader load stays ready')
assert.equal(noStandardRow.status, 'ready')
assert.deepEqual(noStandardRow.loads[0]!.alternates?.map((alternate) => [alternate.status, alternate.problems, alternate.treatments]), [['blocked', [{ cause: 'label_row_needed', supplyId: 'lysol' }], []]])
const withoutAlternates = plan({ ...roomInput(heOnly), adaptPlacements: true })
assert.equal(withoutAlternates.loads[0]!.alternates, undefined)
assert.deepEqual(noStandardRow.reasons, withoutAlternates.reasons, 'the alternates add no reasons')
assert.deepEqual(noStandardRow.warnings, withoutAlternates.warnings)

// Bleach never falls back to the drum.
const withBleach = plan(roomInput([...frontRows, bleach]))
assert.equal(withBleach.loads[0]!.status, 'ready')
assert.deepEqual(withBleach.loads[0]!.alternates?.map((alternate) => [alternate.status, alternate.problems]), [['blocked', [{ cause: 'unsupported_machine_placement', supplyId: 'bleach' }]]])

// A load bigger than a top-loader takes is too full for one.
const comforter: TextileEvidence = { ...tees[0]!, id: 'comforter', bulkUnits: 12 }
const bigLoad = plan(roomInput(frontRows, 'front-loader-1', { textiles: [comforter] })).loads[0]!
assert.equal(bigLoad.machineId, 'front-loader-1')
assert.deepEqual(bigLoad.alternates?.map((alternate) => [alternate.status, alternate.problems, alternate.treatments]), [['too_full', [], []]])
assert.deepEqual([bigLoad.bulkUnits, bigLoad.capacityUnits], [12, 13.5], 'a lone garment past the top-loaders is weighed against its own front-loader')
assert.equal(plan(roomInput(frontRows)).loads[0]!.capacityUnits, 11.5, 'a load that fits packs to the smallest kind')

// Two rinse products name both when they cannot share the rinse on a top-loader.
const downy: SupplyItem = {
  id: 'downy',
  kind: 'chemical_consumable',
  bleachKind: 'none',
  labelEvidence: observed,
  formulation: { form: 'liquid' },
  applicationRules: [capRule('downy-any', { stage: 'rinse', placement: 'softener_compartment', timing: 'before starting' })],
}
const twoRinses = plan(roomInput([...frontRows, downy], 'front-loader-1', { optionalSupplyIds: ['lysol', 'oxiclean', 'downy'] })).loads[0]!
assert.equal(twoRinses.status, 'needs_confirmation', 'Lysol and Downy share the softener slot')
assert.deepEqual(twoRinses.alternates?.map((alternate) => [alternate.status, alternate.problems]), [['blocked', [{ cause: 'shared_compartment_conflict', supplyId: 'downy' }, { cause: 'shared_compartment_conflict', supplyId: 'lysol' }]]])
assert.ok(plan(roomInput([...frontRows, downy], 'front-loader-1', { optionalSupplyIds: ['lysol', 'oxiclean', 'downy'] })).reasons.filter((reason) => reason.details.cause === 'shared_compartment_conflict').every((reason) => !('supplyIds' in reason.details)), 'the plan itself names no products, as before')

// One washer, or one kind of washer, gets neither field.
const inUnit: MachineEvidence = { ...frontLoader(1, drawerAndDrum), id: 'in-unit' }
delete (inUnit as { location?: string }).location
for (const machines of [[inUnit], [frontLoader(1, drawerAndDrum), frontLoader(2, drawerAndDrum)]]) {
  const single = plan({ ...roomInput(frontRows), machines, preferences: {} })
  assert.ok(single.loads.length > 0)
  for (const load of single.loads) assert.ok(!('alternates' in load) && !('roomMachineIds' in load), 'no alternates for one kind of washer')
}

// The same input plans the same way, and the load's own washer gives back its own steps.
const deterministic = (result: PlanResult) => JSON.stringify(result)
assert.equal(deterministic(plan(roomInput(frontRows))), deterministic(fromFrontLoaders), 'identical output twice')
const own = planLoadOn(roomInput(frontRows), base, 'front-loader-1')
assert.equal(own.status, 'ready')
assert.deepEqual(own.status === 'ready' ? own.load.treatments : null, base.treatments, 'planning the load on its own washer changes nothing')

console.log('room checks passed')
