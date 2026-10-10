import { machineRole } from '@washcloset/planner'

import { applianceCopy } from '@/copy-household'
import type { Machine } from '@/household/inventory-types'
import type { MachineGroup } from '@/household/machine-sheet'

/** The drum size as the sticker prints it, or null when none was recorded. Never a "how full" figure. */
export function capacityWords(machine: Pick<Machine, 'drumVolume' | 'capacityUnits'>): string | null {
  if (machine.drumVolume !== null) return `${machine.drumVolume.amount} ${machine.drumVolume.unit === 'cu_ft' ? 'cu. ft.' : 'L'}`
  return machine.capacityUnits === null ? null : applianceCopy.capacityRecorded
}

const same = <Value>(machines: readonly Machine[], read: (machine: Machine) => Value): Value | undefined => {
  const first = read(machines[0]!)
  return machines.every((machine) => read(machine) === first) ? first : undefined
}

const money = (amount: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)

/**
 * The one fact line of an appliance row: loading type, HE, softener compartment and capacity for a
 * washer; the price per time block (or per start) and capacity for a dryer. A fact the siblings
 * disagree on or that is unrecorded is left out or said as not recorded, never averaged.
 */
export function machineFactParts(group: MachineGroup, currency = 'USD'): string[] {
  const machines = group.machines
  const first = machines[0]!
  const role = machineRole(first)
  const parts: string[] = []
  if (role === 'washer') {
    const type = same(machines, (machine) => machine.applianceType)
    if (type === 'front_load_washer') parts.push(applianceCopy.loading.front)
    else if (type === 'top_load_washer') parts.push(applianceCopy.loading.top)
    const he = same(machines, (machine) => machine.highEfficiency)
    parts.push(he === true ? applianceCopy.he : he === null ? applianceCopy.heNotRecorded : he === false ? 'Standard' : 'HE varies')
    if (machines.every((machine) => machine.placements.includes('softener_compartment'))) parts.push(applianceCopy.softenerCompartment)
  } else {
    if (role === 'hanging') parts.push(applianceCopy.hangingFact)
    if (first.location === 'shared') {
      const price = same(machines, (machine) => machine.pricePerStart)
      const block = same(machines, (machine) => machine.blockMinutes ?? null)
      if (typeof price === 'number') parts.push(typeof block === 'number' ? applianceCopy.perBlock(money(price, currency), block) : applianceCopy.perStart(money(price, currency)))
    }
  }
  const capacity = machines.map(capacityWords)
  parts.push(capacity.every((value) => value !== null && value === capacity[0]) ? capacity[0]! : capacity.every((value) => value === null) ? applianceCopy.capacityNotRecorded : 'Capacity varies')
  return parts
}
