import { useState } from 'react'
import type { Id } from '@convex/_generated/dataModel'
import { HouseholdView, MachinesView, BottlesView } from '@/routes/household'
import { MembersView, WearerSheetView } from '@/household/household-people'
import { InviteSheet } from '@/household/household-invite'
import type { Inventory, Machine, Supply } from '@/household/inventory-types'
import type { HouseholdSection } from '@/private-state'
import { previewCall, previewUnavailable } from '@/dev/preview-calls'
import { ConvexProvider, type ConvexReactClient } from 'convex/react'
import { lookupWater, type HouseholdWater } from '@convex/waterHardness'
import { WaterSection, WaterSheet } from '@/household/water-sheet'
import { LaundryDaySection } from '@/laundry/plan-pick'

const provenance = { source: 'Synthetic frozen design: visual only', confidence: 'user-supplied' as const }
const rejectSave = async () => false
const invite = { code: 'LC-7Q2M', expiresAt: Date.UTC(2026, 9, 8, 12) }

const machine = (key: string, name: string, patch: Partial<Machine>): Machine => ({
  machineId: `preview-${key}` as Id<'machines'>, name, model: null, applianceType: 'front_load_washer', highEfficiency: true,
  heatSettings: [], capacityUnits: null, capacityConfidence: 'unknown', supportedCycles: [], placements: [], cycleMinutes: {},
  availability: 'available', location: 'shared', pricePerStart: null, blockMinutes: null, drumVolume: null, archived: false, provenance, ...patch,
})

// The real model stores a capacity estimate, not the prototype's kilogram ratings.
const machines = [
  machine('w9', 'Washer 9', { capacityUnits: 8, capacityConfidence: 'user-supplied', placements: ['detergent_compartment', 'softener_compartment'], pricePerStart: 2.75 }),
  machine('w14', 'Washer 14', { applianceType: 'top_load_washer', capacityUnits: 9, capacityConfidence: 'user-supplied', pricePerStart: 2.5 }),
  machine('w3b', 'Washer 3B', { highEfficiency: null, placements: ['detergent_compartment'], pricePerStart: 2.25 }),
  machine('d4', 'Dryer 4', { applianceType: 'tumble_dryer', highEfficiency: null, capacityUnits: 7, capacityConfidence: 'user-supplied', pricePerStart: 1.5, blockMinutes: 30, heatSettings: [{ heat: 'low', label: 'Low' }, { heat: 'medium', label: 'Medium' }, { heat: 'high', label: 'High' }] }),
  machine('d2', 'Dryer 2', { applianceType: 'tumble_dryer', highEfficiency: null, capacityUnits: 2, capacityConfidence: 'user-supplied', pricePerStart: 1, blockMinutes: 30, heatSettings: [{ heat: 'low', label: 'Low' }, { heat: 'medium', label: 'Medium' }] }),
  machine('d7', 'Dryer 7', { applianceType: 'tumble_dryer', highEfficiency: null, pricePerStart: 1.5, blockMinutes: 30, heatSettings: [{ heat: 'low', label: 'Low' }, { heat: 'medium', label: 'Medium' }, { heat: 'high', label: 'High' }] }),
  machine('hang', 'Heated hanging dryer', { applianceType: 'heated_hanging_dryer', highEfficiency: null, location: 'home' }),
]

function supply(key: string, name: string, form: string, use: Supply['use'], bleachKind: NonNullable<Supply['safety']>['bleachKind'], amounts: number[]): Supply {
  return {
    supplyId: `preview-${key}` as Id<'supplies'>, name, kind: form === 'pod' ? 'single_use' : form === 'sheet' ? 'dryer_sheet' : 'chemical', use,
    formulation: { name, form }, measure: null, archived: false, ranOutAt: null, provenance,
    safety: { bleachKind, incompatibleSupplyIds: [], incompatibleMaterials: [] },
    // Only direction counts render here. These synthetic rows never enter a planner or backend.
    rules: amounts.map((amount, index) => ({
      ruleId: `preview-${key}-${index}` as Id<'rules'>, row: index, rowText: 'Synthetic visual reference',
      dose: { amount, unit: form === 'pod' ? 'pod' : form === 'sheet' ? 'sheet' : form === 'spray' ? 'sprays' : 'ml' },
      stage: form === 'sheet' ? 'dry' : 'wash', placement: form === 'sheet' ? 'dryer_drum' : 'direct_to_drum', timing: 'Synthetic visual reference', conditions: {}, provenance,
      incompatibleSupplyIds: undefined, incompatibleMaterials: undefined, sharedCompartmentCompatible: undefined, maximumTemperatureC: undefined,
      stainChemistry: undefined, stainKinds: undefined, safeMaterials: undefined, maximumPH: undefined,
    })),
  }
}

const supplies = [
  supply('tide', 'Tide', 'liquid', 'detergent', 'oxygen', [30, 45, 60, 90]),
  supply('ff', 'Fragrance-free liquid', 'liquid', 'detergent', 'none', [25, 40, 50, 75]),
  supply('pods', 'Free & clear pods', 'pod', 'pods', 'none', [1, 2]),
  supply('spray', 'Stain remover spray', 'spray', 'stain_remover', 'none', [2]),
  supply('soft', 'Fabric softener', 'liquid', 'softener', 'none', [20]),
  supply('sheets', 'Dryer sheets', 'sheet', 'dryer_sheets', 'none', [1]),
]

const wearers: Inventory['wearers'] = [
  { wearerId: 'preview-alex' as Id<'wearers'>, name: 'Alex', kind: 'adult', principalKey: 'preview-alex' },
  { wearerId: 'preview-sam' as Id<'wearers'>, name: 'Sam', kind: 'adult', principalKey: 'preview-sam' },
  { wearerId: 'preview-mia' as Id<'wearers'>, name: 'Mia', kind: 'child', principalKey: null, requirements: { fragranceFree: true, dyeFree: true, avoidIngredients: ['Optical brighteners'] } },
]
const members = [
  { membershipId: 'preview-alex' as Id<'memberships'>, displayName: 'Alex Rivera', role: 'owner' as const, isYou: true, wearerId: wearers[0]!.wearerId },
  { membershipId: 'preview-sam' as Id<'memberships'>, displayName: 'Sam Rivera', role: 'member' as const, isYou: false, wearerId: wearers[1]!.wearerId },
]

// A typed ZIP, the EBMUD bill and Oakland, classified by the same lookup the backend saves.
const waterAnswers = { zip: '94610', utility: 'ebmud' as const, area: 'oakland' }
const waterSetAt = Date.UTC(2026, 9, 6, 12)
const water: HouseholdWater = { ...waterAnswers, source: 'lookup', ...lookupWater(waterAnswers, waterSetAt), setAt: waterSetAt }
export { machines as reviewMachines, supplies as reviewSupplies, wearers as reviewWearers, water as reviewWater }
// The Water sheet saves through its own Convex hook; this client refuses every save locally, so nothing reaches the backend.
const refusingClient = { mutation: previewUnavailable('save the water setting') } as unknown as ConvexReactClient
const refusingLaundryDayClient = { mutation: previewUnavailable('save the laundry day setting') } as unknown as ConvexReactClient

export type HouseholdPreviewState = 'index' | 'people' | 'people-member' | 'people-long' | 'invite' | 'profile' | 'water' | 'water-sheet' | 'laundry-day'

/** Same page/list/sheet presenters; callbacks never persist preferences, share or mutate records. */
export function HouseholdPreview({ variant, state }: { variant: HouseholdPreviewState; state?: 'invalid' | 'error' | 'busy' }) {
  const [section, setSection] = useState<HouseholdSection>(variant === 'water' || variant === 'water-sheet' || variant === 'laundry-day' ? 'machines' : 'people')
  const [sheet, setSheet] = useState<'invite' | null>(variant === 'invite' ? 'invite' : null)
  const [waterOpen, setWaterOpen] = useState(variant === 'water-sheet')
  const [wearer, setWearer] = useState<Inventory['wearers'][number] | 'new' | null>(variant === 'profile' ? wearers[2]! : null)
  return <HouseholdView name="Our apartment" section={section} onSection={setSection}>
    {section === 'machines' ? <MachinesView machines={machines} currency="USD" place="shared" onOpen={previewCall('open the machine')} onHomePair={previewCall('pair a home machine')}>
      {variant === 'water' || variant === 'water-sheet' ? <>
        <WaterSection water={water} onOpen={() => setWaterOpen(true)} />
        {waterOpen ? <ConvexProvider client={refusingClient}><WaterSheet householdId={'preview-household' as Id<'households'>} water={water} onClose={() => setWaterOpen(false)} /></ConvexProvider> : null}
      </> : null}
      {/* As Appliances shows it now: the Water row, then Laundry day at its defaults. Its chips save through a client that refuses. */}
      {variant === 'laundry-day' ? <>
        <WaterSection water={water} onOpen={previewCall('open the water setting')} />
        <ConvexProvider client={refusingLaundryDayClient}><LaundryDaySection householdId="preview-household" day={undefined} /></ConvexProvider>
      </> : null}
    </MachinesView>
      : section === 'bottles' ? <BottlesView supplies={supplies} onOpen={previewCall('open the product')} />
        : <MembersView role={variant === 'people-member' ? 'member' : 'owner'} members={variant === 'people-member' ? members.map((member) => ({ ...member, isYou: member.role === 'member' })) : variant === 'people-long' ? members.map((member) => ({ ...member, displayName: `${member.displayName} Alexandria-Montgomery-WithAnUnusuallyLongFamilyName` })) : members} wearers={variant === 'people-long' ? wearers.map((person) => ({ ...person, name: `${person.name} Alexandria-Montgomery-WithAnUnusuallyLongFamilyName` })) : wearers} onInvite={() => setSheet('invite')} onEdit={setWearer} onEditMember={(member) => setWearer(wearers.find((person) => person.wearerId === member.wearerId) ?? null)}>
          {sheet === null ? null : <InviteSheet householdName="Our apartment" invite={invite} pending={state === 'busy'} error={state === 'error' ? 'We couldn’t make a new invite link. Try again.' : null} onNew={previewCall('make a new invite link')} onClose={() => setSheet(null)} visualPreview />}
          {wearer === null ? null : <WearerSheetView key={wearer === 'new' ? 'new' : wearer.wearerId} wearer={wearer === 'new' ? null : wearer} supplies={supplies} onClose={() => setWearer(null)} onLinkAccount={variant !== 'people-member' && wearer !== 'new' && wearer.principalKey === null && wearer.kind !== 'baby' ? () => { setWearer(null); setSheet('invite') } : undefined} onAccessAction={wearer !== 'new' && wearer.wearerId === wearers[1]!.wearerId ? previewCall(variant === 'people-member' ? 'leave the household' : 'remove household access') : undefined} accessLabel={variant === 'people-member' ? 'Leave household' : 'Remove access'} onSave={rejectSave} />}
        </MembersView>}
  </HouseholdView>
}
