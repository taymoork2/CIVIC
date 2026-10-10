import { doorLocksDuringCycle, labelTreatmentPhase, type LoadAlternate, type TreatmentStep } from '@washcloset/planner'

import type { Machine } from '@/household/inventory-types'
import { cycleWord, roomText } from '@/copy'
import type { PlanLoad } from '@/laundry/laundry-pass'
import { machineGroupLine, machineGroups } from '@/household/machine-sheet'
import { slotName } from '@/kit/ui'
import { doseParts, money, type UnitSystem } from '@/kit/units'

/**
 * Pure "which washer?" choices for a mixed shared room: what the sheet shows (one group per washer
 * kind, its price and door words, whether it can start), what a load's steps look like on a washer of
 * another kind, and the plain words for a kind that can't take it. No React, no network: everything
 * here reads the plan and the household's machines exactly as they already sit in memory.
 */

/** A supply's display name, or null when the product is gone or unknown. */
export type SupplyNamer = (supplyId: string) => string | null

export type ClassWord = { readonly singular: string; readonly plural: string }

/** "top-loader"/"Top-loaders", "front-loader"/"Front-loaders", or a generic fallback. */
export function classWord(applianceType: string | null): ClassWord {
  if (applianceType === 'top_load_washer') return roomText.classes.top
  if (applianceType === 'front_load_washer') return roomText.classes.front
  return roomText.classes.washer
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')

/**
 * Why another kind of washer can't take this load, in plain words. `ownKind` is the load's own
 * (planned) kind, named as the fallback the person can go back to. Some causes name the product from
 * `alt.problems`; a pair conflict names both when the planner recorded both sides of it.
 */
export function blockReason(alt: LoadAlternate, supplyNames: SupplyNamer, ownKind: ClassWord): string {
  const altKind = classWord(alt.applianceType)
  if (alt.status === 'too_full') return roomText.tooFull(`${article(altKind.singular)} ${altKind.singular}`, `${article(ownKind.singular)} ${ownKind.singular}`)
  const causes = new Set(alt.problems.map((problem) => problem.cause))
  const namedBy = (cause: string) => alt.problems
    .filter((problem) => problem.cause === cause && problem.supplyId !== undefined)
    .map((problem) => supplyNames(problem.supplyId!) ?? roomText.product)
  if (causes.has('label_row_needed')) {
    const product = namedBy('label_row_needed')[0] ?? roomText.productBare
    const washer = alt.washerClass === 'he' ? roomText.he : alt.washerClass === 'standard' ? roomText.standard : altKind.singular
    return roomText.noLabelLine(product, washer, `${article(ownKind.singular)} ${ownKind.singular}`)
  }
  if (causes.has('shared_compartment_conflict')) {
    const [first, second] = namedBy('shared_compartment_conflict')
    const pair = first === undefined ? roomText.products : second === undefined ? first : `${first} and ${second}`
    return roomText.rinseConflict(pair, `${article(altKind.singular)} ${altKind.singular}`)
  }
  if (causes.has('unsupported_machine_cycle')) return roomText.noCycle((cycleWord(alt.cycle) ?? roomText.matching).toLowerCase(), altKind.plural.toLowerCase())
  if (causes.has('unsupported_machine_placement')) {
    const product = namedBy('unsupported_machine_placement')[0] ?? roomText.product
    return roomText.noSlot(product, altKind.plural.toLowerCase())
  }
  return roomText.cannotTake(altKind.plural)
}

/** The treatments to show for a load on a given washer: the base for its own class, an alternate's for its class, else null. */
export function loadFor(load: Pick<PlanLoad, 'machineId' | 'roomMachineIds' | 'alternates' | 'treatments'>, machineId: string): readonly TreatmentStep[] | null {
  if (machineId === load.machineId || (load.roomMachineIds ?? []).includes(machineId)) return load.treatments
  const alternate = (load.alternates ?? []).find((entry) => entry.machineIds.includes(machineId))
  return alternate === undefined ? null : alternate.treatments
}

/** At most 3 lines: how, up to 2 products, changes going in and doses when the class changes. */
export function classChanges(
  fromTreatments: readonly TreatmentStep[],
  toTreatments: readonly TreatmentStep[],
  supplyNames: SupplyNamer,
  toMachine: { readonly doorLocks: boolean; readonly minutes: number | null },
): string[] {
  const system: UnitSystem = 'imperial'
  const fromBySupply = new Map(fromTreatments.map((step) => [step.supplyId, step] as const))
  const lines: string[] = []
  for (const to of toTreatments) {
    if (lines.length >= 2) break
    const from = fromBySupply.get(to.supplyId)
    if (from !== undefined && from.placement === to.placement && from.stage === to.stage) continue
    const product = supplyNames(to.supplyId) ?? roomText.thisProduct
    const toSlot = slotName(to.placement, false)
    const fromSlot = from === undefined ? null : slotName(from.placement, false)
    const reminder = to.stage === 'rinse' && labelTreatmentPhase(to) === 'cycle'
    const doseWords = to.atMachine !== undefined || to.dose.unit === 'unknown'
      ? null
      : doseParts({ ...to.dose, mark: to.dose.mark ?? null, equivalent: to.equivalent ?? null }, system).spoken
    const middle = [toSlot, doseWords].filter((part): part is string => part !== null).join(', ')
    lines.push(`${product}: ${middle}${reminder ? roomText.remind : ''}${fromSlot === null ? '' : roomText.was(fromSlot)}`)
  }
  const minutes = toMachine.minutes === null ? '' : roomText.minutes(toMachine.minutes)
  lines.push(toMachine.doorLocks ? roomText.doorLocks(minutes) : roomText.lidOpens(minutes))
  return lines
}

export type RoomGroup = {
  readonly key: string
  readonly title: string
  readonly meta: string
  /** Sorted by the number painted on the machine, physical order, never by which is free. */
  readonly machines: readonly Machine[]
  readonly own: boolean
  readonly alternate?: LoadAlternate
  readonly startable: boolean
  readonly reason: string | null
}

/** The washers a load can start on, its planned kind and siblings ("Speed Queen washer 1…4"). */
function siblingIds(plannedId: string, machines: readonly Machine[]): string[] {
  const washers = machines.filter((machine) => !machine.archived && machine.applianceType !== 'tumble_dryer')
  const group = machineGroups(washers).find((entry) => entry.machines.some((machine) => machine.machineId === plannedId))
  return group === undefined || group.machines.length < 2 ? [] : group.machines.map((machine) => machine.machineId as string)
}

/** Arrival shortcuts include a lone recorded washer, even when this load has unresolved facts. */
export function roomArrivalMachines(load: Pick<PlanLoad, 'machineId'>, machines: readonly Machine[], groups: readonly RoomGroup[]): Machine[] {
  if (groups.length > 0) return groups.flatMap((group) => group.machines).filter((machine) => !machine.archived)
  if (load.machineId === null) return []
  const ids = new Set([load.machineId, ...siblingIds(load.machineId, machines)])
  return machines.filter((machine) => ids.has(machine.machineId) && !machine.archived && machine.applianceType !== 'tumble_dryer')
}

const trailingNumber = /\s#?(\d{1,2})$/

/** Physical order from the number painted on each machine's name; unnumbered machines keep their place, last. */
function byPaintedNumber(machines: readonly Machine[]): Machine[] {
  const numberOf = (machine: Machine) => { const match = trailingNumber.exec(machine.name); return match === null ? null : Number(match[1]) }
  return [...machines].sort((left, right) => {
    const a = numberOf(left)
    const b = numberOf(right)
    if (a !== null && b !== null) return a - b
    if (a !== null) return -1
    if (b !== null) return 1
    return 0
  })
}

function hasDrawer(machine: Machine): boolean {
  return machine.placements.some((placement) => placement.endsWith('_compartment'))
}

function groupMeta(machines: readonly Machine[]): string {
  const first = machines[0]
  if (first === undefined) return ''
  const locks = doorLocksDuringCycle({ applianceType: first.applianceType ?? undefined })
  const price = first.pricePerStart === null ? null : money(first.pricePerStart, 'USD')
  return [price, `${locks ? roomText.meta.doorLocks : roomText.meta.lid}, ${hasDrawer(first) ? roomText.meta.drawer : roomText.meta.noDrawer}`].filter((part): part is string => part !== null).join(' · ')
}

function groupTitle(applianceType: string | null, machines: readonly Machine[]): string {
  if (applianceType === 'top_load_washer') return roomText.classes.top.plural
  if (applianceType === 'front_load_washer') return roomText.classes.front.plural
  if (machines.length === 0) return classWord(applianceType).plural
  return machineGroupLine(machineGroups(machines)[0]!).title
}

/**
 * "Which washer?" groups: [] when the planned washer is not shared or the room has fewer than 2
 * washers total. Otherwise one group per class, the load's own first, then each alternate in order.
 */
export function roomGroups(
  load: Pick<PlanLoad, 'machineId' | 'roomMachineIds' | 'alternates'>,
  machines: readonly Machine[],
  startableIds: readonly string[],
  supplyNames: SupplyNamer = () => null,
): RoomGroup[] {
  if (load.machineId === null) return []
  const own = machines.find((machine) => machine.machineId === load.machineId)
  if (own === undefined || own.location !== 'shared') return []
  const alternates = load.alternates ?? []
  const ownIds = load.roomMachineIds !== undefined ? [...load.roomMachineIds] : siblingIds(load.machineId, machines)
  if (alternates.length === 0 && ownIds.length < 2) return []
  const lookup = (ids: readonly string[]) => byPaintedNumber(ids.flatMap((id) => {
    const machine = machines.find((entry) => entry.machineId === id)
    return machine === undefined ? [] : [machine]
  }))
  const ownMachines = lookup(ownIds.length > 0 ? ownIds : [load.machineId])
  const ownKind = classWord(own.applianceType)
  const ownGroup: RoomGroup = {
    key: 'own',
    title: groupTitle(own.applianceType, ownMachines),
    meta: groupMeta(ownMachines),
    machines: ownMachines,
    own: true,
    startable: ownMachines.some((machine) => startableIds.includes(machine.machineId)),
    reason: null,
  }
  const altGroups: RoomGroup[] = alternates.map((alternate) => {
    const altMachines = lookup(alternate.machineIds)
    const startable = altMachines.some((machine) => startableIds.includes(machine.machineId))
    return {
      key: alternate.machineId,
      title: groupTitle(alternate.applianceType, altMachines),
      meta: groupMeta(altMachines),
      machines: altMachines,
      own: false,
      alternate,
      startable,
      reason: startable ? null : blockReason(alternate, supplyNames, ownKind),
    }
  })
  return [ownGroup, ...altGroups]
}
