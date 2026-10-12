import { compartmentPlacements, type WasherClass } from './vocabulary.ts'

/**
 * The physical sequence at the machine. Products that go in the empty drum, loading the garments,
 * how full the drum looks (the load size for any dose that depends on it), anything that goes in
 * with the garments, closing the door, filling the dispenser (a front-loader's drawer), starting the
 * machine, and only then any mid-cycle additions. Drying follows the wash and is only ever appended:
 * garments that stay out, loading the dryer, how full it looks, its products, starting it, collecting.
 */
export type StepPhase = 'drum' | 'load' | 'drum_fullness' | 'with_load' | 'close' | 'dispenser' | 'start' | 'cycle'
  | 'hold_out' | 'dryer_load' | 'dryer_fullness' | 'dryer_with_load' | 'dryer_start' | 'dryer_unload'
export const phaseOrder: readonly StepPhase[] = [
  'drum', 'load', 'drum_fullness', 'with_load', 'close', 'dispenser', 'start', 'cycle',
  'hold_out', 'dryer_load', 'dryer_fullness', 'dryer_with_load', 'dryer_start', 'dryer_unload',
]

/** Washer steps done before Start; a locked door refuses them once the machine runs. */
export const washerPrepPhases: ReadonlySet<StepPhase> = new Set<StepPhase>(['drum', 'load', 'drum_fullness', 'with_load', 'close', 'dispenser'])
/** Steps that happen only once the wash has finished. */
export const dryerPhases: ReadonlySet<StepPhase> = new Set<StepPhase>(['hold_out', 'dryer_load', 'dryer_fullness', 'dryer_with_load', 'dryer_start', 'dryer_unload'])

export function isDryerPhase(phase: string): boolean {
  return dryerPhases.has(phase as StepPhase)
}

/** The phases a product can occupy; the others are tasks a person performs. */
export type TreatmentPhase = Extract<StepPhase, 'drum' | 'with_load' | 'dispenser' | 'cycle' | 'dryer_with_load'>

export type MachineDoor = { readonly doorLocksDuringCycle?: boolean; readonly applianceType?: string } | null | undefined

/** Front-loaders lock the door for the whole cycle, so nothing can be added by hand once it starts. */
export function doorLocksDuringCycle(machine: MachineDoor): boolean {
  if (machine?.applianceType === 'tumble_dryer') return false
  if (typeof machine?.doorLocksDuringCycle === 'boolean') return machine.doorLocksDuringCycle
  return machine?.applianceType === 'front_load_washer'
}

export type MachineFacts = { readonly highEfficiency?: boolean; readonly applianceType?: string | null } | null | undefined

/**
 * HE or standard only as recorded. Unset is unknown for every washer type, so a label that doses
 * HE and standard washers differently asks instead of assuming.
 */
export function washerClass(machine: MachineFacts): WasherClass | null {
  if (machine?.highEfficiency === true) return 'he'
  if (machine?.highEfficiency === false) return 'standard'
  return null
}

/** What a rule's `machineClasses` condition is matched against: the appliance type and the washer class. */
export function machineClasses(machine: MachineFacts): string[] {
  const classes: string[] = []
  if (typeof machine?.applianceType === 'string' && machine.applianceType.length > 0) classes.push(machine.applianceType)
  const known = washerClass(machine)
  if (known !== null) classes.push(known)
  return classes
}

export type MachineCapacity = {
  readonly capacityUnits?: number
  readonly capacity?: number
  readonly capacityMassKg?: number
}

/** The recorded drum capacity in load units, or null when none is recorded. */
export function machineCapacity(machine: MachineCapacity): number | null {
  const capacity = machine.capacityUnits ?? machine.capacity ?? machine.capacityMassKg
  return typeof capacity === 'number' && Number.isFinite(capacity) && capacity > 0 ? capacity : null
}

const beforeLoadingPattern = /before (?:(loading|adding|putting in) )?(the )?(garments|clothes|laundry|items)\b/i
const beforeStartPattern = /before (the )?(cycle|wash|start|loading)|before starting/i

function beforeLoadingGarments(timing: string | null | undefined): boolean {
  return typeof timing === 'string' && beforeLoadingPattern.test(timing)
}

function beforeMachineStart(timing: string | null | undefined): boolean {
  return typeof timing === 'string' && (beforeLoadingPattern.test(timing) || beforeStartPattern.test(timing))
}

export type TreatmentTiming = { readonly placement?: string | null; readonly timing?: string | null }

/**
 * Where the label says a product goes, ignoring the machine: dispenser slots are filled after the
 * door closes, a dispensing ball and anything "before the cycle" go in with the load, a product
 * added "before loading" goes in the empty drum, and everything else is added during the cycle.
 */
export function labelTreatmentPhase(step: TreatmentTiming): TreatmentPhase {
  if (step.placement === 'dryer_drum') return 'dryer_with_load'
  if ((compartmentPlacements as readonly string[]).includes(step.placement ?? '')) return 'dispenser'
  if (step.placement === 'downy_ball') return 'with_load'
  if (step.placement === 'direct_to_drum' && beforeLoadingGarments(step.timing)) return 'drum'
  if (beforeMachineStart(step.timing)) return 'with_load'
  return 'cycle'
}

/**
 * Where a product goes on this machine. A mid-cycle addition is impossible once a locked door
 * closes, so on such a machine it must go in with the load before Start.
 */
export function treatmentPhase(step: TreatmentTiming, machine: MachineDoor): TreatmentPhase {
  const phase = labelTreatmentPhase(step)
  return phase === 'cycle' && doorLocksDuringCycle(machine) ? 'with_load' : phase
}

export type DispensingFacts = {
  readonly placements?: readonly string[]
  readonly supportedPlacements?: readonly string[]
  readonly compartments?: readonly (string | { readonly id: string })[]
  readonly directToDrum?: boolean
  readonly centerAgitator?: boolean
  readonly downyBall?: boolean
}

export type WasherShape = MachineCapacity & {
  readonly rinseContact?: Readonly<Record<string, { readonly minutes: number; readonly source: string; readonly placement: string; readonly timing?: string }>>
  readonly applianceType?: string
  readonly highEfficiency?: boolean
  readonly doorLocksDuringCycle?: boolean
  readonly supportedCycles?: readonly string[]
  readonly dispensing?: DispensingFacts | null
  readonly dispensingProfile?: DispensingFacts | null
}

/** Placements a washer supports, whether recorded as a list or as compartments and flags. */
export function placementsOf(machine: WasherShape): string[] {
  const profile = machine.dispensing ?? machine.dispensingProfile ?? null
  if (!profile) return []
  const listed = profile.placements ?? profile.supportedPlacements
  if (listed !== undefined) return [...listed]
  return [
    ...(profile.compartments ?? []).map((compartment) => (typeof compartment === 'string' ? compartment : compartment.id)),
    ...(profile.directToDrum === true ? ['direct_to_drum'] : []),
    ...(profile.centerAgitator === true ? ['center_agitator'] : []),
    ...(profile.downyBall === true ? ['downy_ball'] : []),
  ]
}

/**
 * Washers that take the same steps share a key: the same type, HE or standard, placements, door,
 * cycles and drum size. Numbered twins in a shared room are one class.
 */
export function washerClassKey(machine: WasherShape): string {
  return JSON.stringify([
    machine.applianceType ?? null,
    washerClass(machine) ?? 'unknown',
    [...placementsOf(machine)].sort(),
    doorLocksDuringCycle(machine),
    [...(machine.supportedCycles ?? [])].sort(),
    machine.capacityUnits ?? 'default',
    ...(machine.rinseContact === undefined ? [] : [Object.entries(machine.rinseContact).sort(([left], [right]) => left.localeCompare(right))]),
  ])
}

export type Direction = { readonly placement?: string | null; readonly stage?: string | null; readonly timing?: string | null }

/** A rinse or post-wash product the label has a person add by hand while the machine runs. */
export function addedByHandMidCycle(rule: Direction): boolean {
  const byHand = rule.placement === 'direct_to_drum' || rule.placement === 'manual'
  const midCycle = rule.stage === 'rinse' || rule.stage === 'postwash'
  return byHand && midCycle && labelTreatmentPhase(rule) === 'cycle'
}

/**
 * Where a product goes on a washer of another kind than the one its label row was written for:
 * the direction unchanged when the washer takes it, a rinse product in the softener slot behind a
 * locked door or in the drum at the rinse when the lid opens, a wash product from a slot into the
 * empty drum, and null otherwise. Bleach never falls back to the drum.
 */
export function adaptedPlacement<T extends Direction>(placements: readonly string[], direction: T, doorLocks: boolean): T | null {
  const placement = direction.placement ?? ''
  const listed = (candidate: string) => placements.includes(candidate)
  if (listed(placement) && !(doorLocks && addedByHandMidCycle(direction))) return direction
  if (placement === 'bleach_compartment') return null
  if (direction.stage === 'rinse' || placement === 'softener_compartment' || placement === 'downy_ball') {
    if (doorLocks && listed('softener_compartment')) return { ...direction, placement: 'softener_compartment', stage: 'rinse', timing: 'before starting' } as T
    if (!doorLocks && listed('direct_to_drum')) return { ...direction, placement: 'direct_to_drum', stage: 'rinse', timing: 'at the start of the rinse' } as T
    return null
  }
  const inSlot = (compartmentPlacements as readonly string[]).includes(placement)
  if ((direction.stage === 'wash' || direction.stage === 'prewash') && inSlot && listed('direct_to_drum')) {
    return { ...direction, placement: 'direct_to_drum', timing: 'before loading the clothes' } as T
  }
  return null
}
