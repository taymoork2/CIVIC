export {}

const { adaptedPlacement, labelTreatmentPhase, placementsOf, washerClassKey } = (await import(`./physical${'.ts'}`)) as typeof import('./physical')

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`)
}

function deepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: values differ`)
}

const topLoader = {
  id: 'top-1',
  applianceType: 'top_load_washer',
  highEfficiency: false,
  capacityUnits: 11.5,
  supportedCycles: ['normal', 'delicate'],
  dispensingProfile: { directToDrum: true },
}
const frontLoader = {
  id: 'front-1',
  applianceType: 'front_load_washer',
  highEfficiency: true,
  doorLocksDuringCycle: true,
  capacityUnits: 13.5,
  supportedCycles: ['normal', 'delicate'],
  dispensingProfile: { placements: ['detergent_compartment', 'bleach_compartment', 'softener_compartment', 'direct_to_drum'] },
}

deepEqual(placementsOf(topLoader), ['direct_to_drum'], 'placements come from compartments and flags when no list is recorded')
deepEqual(placementsOf({ dispensingProfile: { compartments: ['detergent_compartment', { id: 'softener_compartment' }], downyBall: true } }), ['detergent_compartment', 'softener_compartment', 'downy_ball'], 'compartments by name or id both count')
deepEqual(placementsOf(frontLoader), frontLoader.dispensingProfile.placements, 'a recorded list is used as is')
deepEqual(placementsOf({}), [], 'a washer with no dispensing profile lists nothing')

equal(washerClassKey(topLoader), washerClassKey({ ...topLoader, id: 'top-2', supportedCycles: ['delicate', 'normal'] }), 'numbered twins share a class')
equal(washerClassKey(frontLoader) === washerClassKey({ ...frontLoader, highEfficiency: false }), false, 'HE and standard are different classes')
equal(washerClassKey(topLoader) === washerClassKey({ ...topLoader, applianceType: 'front_load_washer' }), false, 'front and top are different classes')
equal(washerClassKey(topLoader) === washerClassKey({ ...topLoader, capacityUnits: 9 }), false, 'a different drum size is a different class')
equal(washerClassKey(topLoader) === washerClassKey(frontLoader), false, 'the owner room has two classes')

const drawerDetergent = { placement: 'detergent_compartment', stage: 'wash', timing: 'before starting', measurementCue: 'line 2' }
const onTop = adaptedPlacement(['direct_to_drum'], drawerDetergent, false)
deepEqual(onTop, { ...drawerDetergent, placement: 'direct_to_drum', timing: 'before loading the clothes' }, 'drawer detergent goes in the empty tub before the clothes')
equal(labelTreatmentPhase(onTop!), 'drum', 'the adapted detergent is a drum step')
for (const timing of ['Dry hands; intact pacs directly in drum before clothes; close container', 'powder before laundry', 'add detergent before the garments']) equal(labelTreatmentPhase({ placement: 'direct_to_drum', stage: 'wash', timing }), 'drum', 'explicit before-clothes source wording precedes loading')
equal(onTop!.measurementCue, 'line 2', 'the cap line carries through')

const softenerSlot = { placement: 'softener_compartment', stage: 'rinse', timing: 'before starting' }
const rinseOnTop = adaptedPlacement(['direct_to_drum'], softenerSlot, false)
deepEqual(rinseOnTop, { placement: 'direct_to_drum', stage: 'rinse', timing: 'at the start of the rinse' }, 'a softener-slot product goes in the drum at the rinse when the lid opens')
equal(labelTreatmentPhase(rinseOnTop!), 'cycle', 'the rinse addition happens during the cycle')

const drumRinse = { placement: 'direct_to_drum', stage: 'rinse', timing: 'at the start of the rinse' }
const rinseInFront = adaptedPlacement(placementsOf(frontLoader), drumRinse, true)
deepEqual(rinseInFront, { placement: 'softener_compartment', stage: 'rinse', timing: 'before starting' }, 'a drum rinse product goes in the softener slot behind a locked door')
equal(labelTreatmentPhase(rinseInFront!), 'dispenser', 'the softener slot is filled at the drawer')
equal(adaptedPlacement(['direct_to_drum'], drumRinse, true), null, 'a locked door with no softener slot cannot take a rinse product')
equal(adaptedPlacement(['detergent_compartment', 'direct_to_drum'], { placement: 'downy_ball', stage: 'rinse', timing: 'with the clothes' }, true), null, 'a locked door without a softener slot gives null')

equal(adaptedPlacement(['direct_to_drum'], { placement: 'bleach_compartment', stage: 'wash', timing: 'before starting' }, false), null, 'bleach never falls back to the drum')
equal(adaptedPlacement(['direct_to_drum'], { placement: 'bleach_compartment', stage: 'rinse', timing: 'before starting' }, false), null, 'bleach in the rinse never falls back to the drum either')
equal(adaptedPlacement(['detergent_compartment'], drawerDetergent, false) === drawerDetergent, true, 'a listed placement is unchanged')
equal(adaptedPlacement(['softener_compartment'], { ...drawerDetergent, placement: 'bleach_compartment' }, true), null, 'an unlisted bleach slot gives null')
equal(adaptedPlacement(['softener_compartment', 'center_agitator'], drawerDetergent, false), null, 'a washer without a drum placement cannot take a slot product in the wash')
equal(adaptedPlacement(['detergent_compartment'], { placement: 'manual', stage: 'wash', timing: 'during the wash' }, false), null, 'anything else gives null')
equal(adaptedPlacement(['direct_to_drum'], drumRinse, false) === drumRinse, true, 'a drum rinse on a lid washer is unchanged')
console.log('physical checks passed')
