import { machineRole } from '@washcloset/planner'
import type { ReactNode } from 'react'

import { draftFromSupply, formIcons, type BottleDraft } from '@/products/bottle-sheet'
import { bottleUseWords, productText } from '@/copy'
import { householdListCopy, productContentsCopy } from '@/copy-household'
import { machineFactParts } from '@/household/household-facts'
import type { Supply } from '@/household/inventory-types'
import type { MachineGroup } from '@/household/machine-sheet'
import { RecordRow } from '@/kit/record-row'
import { DesignIcon, type DesignIconName } from '@/kit/design-icons'

// The form's own picture; a liquid softener and a sanitizer get their own bottles once the use is recorded.
const productIcon = (draft: BottleDraft): DesignIconName => draft.form === 'liquid' && draft.use === 'softener' ? 'softener'
  : (draft.form === null || draft.form === 'liquid') && (draft.use === 'sanitizer' || draft.use === 'rinse_sanitizer') ? 'sanitizer'
  : draft.form === null ? 'bottle' : formIcons[draft.form]

/** The heading a product sits under, by what it is for; accessories and unconfirmed uses have their own. */
export function productGroup(supply: Supply): string {
  if (supply.use === 'stain_remover') return householdListCopy.productGroups.stain_remover
  const draft = draftFromSupply(supply)
  if (supply.kind === 'wool_dryer_ball' || supply.kind === 'dispensing_device') return householdListCopy.productGroups.accessories
  return draft.use === null ? householdListCopy.productGroups.other : householdListCopy.productGroups[draft.use]
}

/**
 * A product's row, as the prototype reads it: form, what the pack's label says about bleach and
 * how many label directions are saved. The bleach fact is the record's, never the name's. The
 * status mark only appears when label directions are missing.
 */
export function ProductTile({ supply, onOpen }: { supply: Supply; onOpen: () => void }) {
  const draft = draftFromSupply(supply)
  const accessory = supply.kind === 'wool_dryer_ball' || supply.kind === 'dispensing_device'
  const pretreatment = supply.use === 'stain_remover'
  const form = supply.formulation?.form === 'spray' ? 'Spray' : draft.form === null ? null : productText.forms[draft.form]
  const category = pretreatment ? 'Pretreatment' : draft.use ? bottleUseWords[draft.use] : form ?? 'Laundry product'
  const bleach = draft.form === 'sheets' || accessory ? null : productContentsCopy.rowBleach[supply.safety?.bleachKind ?? 'unknown']
  const directions = accessory ? householdListCopy.productFacts.accessory : supply.rules.length === 0 ? null : householdListCopy.productFacts.directionCount(supply.rules.length)
  const missing = !accessory && supply.rules.length === 0
  const icon = pretreatment || supply.formulation?.form === 'spray' ? 'spray' : productIcon(draft)
  const fact = [form, bleach, directions].filter((part): part is string => part !== null).join(' · ')
  return <RecordRow
    media={<DesignIcon name={icon} strokeWidth={1.6} />}
    title={supply.name.trim()}
    fact={fact}
    mark={supply.ranOutAt !== null && supply.ranOutAt !== undefined ? { tone: 'waiting', text: 'Ran out' } : missing ? { tone: 'confirm', text: householdListCopy.productFacts.directionsMissing } : undefined}
    onOpen={onOpen}
    label={`${supply.name.trim()}, ${category}. ${fact}${supply.archived ? '. Removed' : supply.ranOutAt != null ? '. Ran out' : ''}${missing ? `. ${householdListCopy.productFacts.directionsMissing}` : ''}. Open product`}
  />
}

/** An appliance row: loading type, HE, softener compartment and capacity (or "Capacity not recorded"). Where it is sits in the section heading. */
export function MachineTile({ group, currency, onOpen }: { group: MachineGroup; currency: string; onOpen: () => void }) {
  const first = group.machines[0]!
  const role = machineRole(first)
  const fact = machineFactParts(group, currency).join(' · ')
  const icon = role === 'hanging' ? 'hang' : role === 'dryer' ? 'dryer' : 'washer'
  const title = group.machines.length > 1 ? `${group.name} ×${group.machines.length}` : group.name
  return <RecordRow media={<DesignIcon name={icon} strokeWidth={1.6} />} title={title} fact={fact} onOpen={onOpen} label={`${title}. ${fact}${group.machines.every((machine) => machine.archived) ? '. Removed' : ''}. Open appliance`} />
}

/** The last row of a section: the same 64px row shape as a record, a plus where the picture goes. */
export function AddRow({ label, hint, disabled, onClick }: { label: string; hint?: ReactNode; disabled?: boolean; onClick: () => void }) {
  return <RecordRow media={<DesignIcon name="plus" strokeWidth={1.6} />} title={label} fact={hint} disabled={disabled} onOpen={onClick} />
}
