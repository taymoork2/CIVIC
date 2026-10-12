import { cn } from '@/lib/utils'
import { useDeviceState, useIntakeDraft } from '@/kit/device-state'
import { previousMachineDraftNames, validMachineIntake } from '@/kit/intake-validation'
import { getRouteApi, useNavigate, useRouter } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { RequireHousehold, type CurrentHousehold } from '@/account/account'
import type { Id } from '../../../../convex/_generated/dataModel'
import { api } from '../api'
import { BottleSheet } from '@/products/bottle-sheet'
import { householdText } from '../copy'
import { householdListCopy } from '../copy-household'
import { MachineTile, ProductTile, productGroup } from '@/household/household-tiles'
import { RowSection } from '@/household/household-blocks'
import { MachineArt, ProductArt } from '@/household/household-art'
import { CareEmpty, CareHero, SectionNav, CategoryPhoto } from '@/products/product-ui'
import type { Inventory, Machine, Supply } from '@/household/inventory-types'
import { MachineSheet, machineGroups, washPlace, type MachineGroup } from '@/household/machine-sheet'
import type { HouseholdSection } from '../private-state'
import { ErrorNotice, Loading, useConvexCall } from '@/kit/ui'
import { Button } from '../components/ui/button'
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '../components/ui/collapsible'
import { Members } from '@/household/household-people'
import { useHouseholdData } from '@/household/household-data'
import { WaterSection, WaterSheet } from '@/household/water-sheet'
import { LaundryDaySection } from '@/laundry/plan-pick'
import type { HouseholdWater } from '../../../../convex/waterHardness'
import { dismissItem } from '@/kit/item-navigation'
import { DesignIcon } from '@/kit/design-icons'
import { BrowseSearch } from '@/kit/browse-search'
import { Sheet } from '@/kit/sheet'
import { RecordList, RecordRow } from '@/kit/record-row'

const Route = getRouteApi('/household')

const pageClassName = cn(
  "page",
  "[.app-shell.is-focus_&]:max-w-[30rem]",
  "grid min-w-0 gap-6 max-w-[36rem] mx-auto pt-2",
  "md:max-w-[45rem]",
  "[.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:w-full [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:max-w-[none] [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:mx-0 [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:pt-0 [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:content-start [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:gap-4",
)

const householdPageClassName = cn(
  "household-page",
  "[&_.household-title_h1]:text-[length:var(--step-4)]",
)

const noticeClassName = cn(
  "notice",
  "grid gap-2 p-[var(--space-3)_var(--space-4)] rounded-label",
  "[border:var(--rule-width)_solid_var(--line)]",
  "[background:var(--label)]",
  "text-[length:var(--step-0)]",
)


export function Household() {
  return <RequireHousehold>{(household) => <HouseholdPage household={household} />}</RequireHousehold>
}

const sections: ReadonlyArray<readonly [HouseholdSection, string]> = [['people', householdText.sections.people], ['machines', 'Appliances'], ['bottles', householdText.sections.bottles]]

function HouseholdPage({ household }: { household: CurrentHousehold }) {
  const shared = useHouseholdData(household.householdId)
  const inventory = useQuery(api.inventory.list, { householdId: household.householdId, textileIds: [] }) ?? shared?.inventory
  const search = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const section = search.machine !== undefined ? 'machines' : search.product !== undefined ? 'bottles' : search.section === 'machines' || search.section === 'bottles' ? search.section : 'people'
  const pick = (next: HouseholdSection) => {
    void navigate({ to: '/household', search: { section: next }, resetScroll: false })
  }
  const closeItem = () => dismissItem(router, () => void navigate({ to: '/household', search: { section }, replace: true, resetScroll: false }))
  return (
    <HouseholdView name={household.name} section={section} onSection={pick} detail={inventory === undefined ? undefined : `${inventory.wearers.length} clothing profiles · ${inventory.machines.filter(machine => !machine.archived).length} appliances · ${inventory.supplies.filter(supply => !supply.archived).length} products`}>
      {section === 'people' ? <Members household={household} wearers={inventory?.wearers ?? null} supplies={inventory?.supplies ?? []} /> : inventory === undefined ? <Loading what={section === 'machines' ? householdText.loadingMachines : householdText.loadingProducts} /> : section === 'machines' ? (
        <Machines householdId={household.householdId} savedPlace={household.washPlace} machines={inventory.machines} currency={inventory.planning.currency ?? 'USD'} water={inventory.planning.water} day={inventory.planning.day} selected={search.machine}
          onOpen={(machine) => void navigate({ to: '/household', search: { section: 'machines', machine }, state: { itemReturnTo: router.state.location.href }, resetScroll: false })} onClose={closeItem} />
      ) : (
        <Bottles householdId={household.householdId} supplies={inventory.supplies} selected={search.product}
          onOpen={(product) => void navigate({ to: '/household', search: { section: 'bottles', product }, state: { itemReturnTo: router.state.location.href }, resetScroll: false })} onClose={closeItem} />
      )}
    </HouseholdView>
  )
}

/** The connected page and visual fixtures share the same title, tabs and content layout. */
export function HouseholdView({ name, section, onSection, detail, children }: { name: string; section: HouseholdSection; onSection: (section: HouseholdSection) => void; detail?: ReactNode; children: ReactNode }) {
  return <div className={cn(pageClassName, householdPageClassName)}>
    <CareHero variant="feature" title={name} detail={detail} art={<CategoryPhoto src={section === 'machines' ? '/design/laundry-setup.webp' : section === 'people' ? '/welcome-household.webp' : '/design/detergent-pods-photo.webp'} fallback={null} className="block h-20 w-full object-contain" loading="eager" />} />
    <SectionNav label={householdText.show} value={section} onChange={onSection} items={sections.map(([value, label]) => ({ value, label }))} />
    {children}
  </div>
}

/** Removed records remain available below the list for history and restoration. */
function Removed({ count, children }: { count: number; children: ReactNode }) {
  return <Collapsible className="grid gap-2">
    <CollapsibleTrigger className="flex min-h-11 items-center justify-between gap-3 px-1 font-semibold">{householdListCopy.removed(count)}<DesignIcon name="chevronDown" size="1em" strokeWidth={2.2} aria-hidden="true"  /></CollapsibleTrigger>
    <CollapsiblePanel><RowSection>{children}</RowSection></CollapsiblePanel>
  </Collapsible>
}

// ---- Products -----------------------------------------------------------

const productGroupOrder = [...Object.values(householdListCopy.productGroups)]

/**
 * Products: a section per kind of product (Detergents, Softeners, ...), a row per product, which
 * opens the product sheet (Facts / Contents / Directions); a section of its own holds "Add a
 * product". Removed products remain available for restoration.
 */
function Bottles({ householdId, supplies, selected, onOpen, onClose }: { householdId: Id<'households'>; supplies: Supply[]; selected?: string; onOpen: (id: string) => void; onClose: () => void }) {
  const sheet = selected === 'new' ? 'new' : supplies.find((supply) => supply.supplyId === selected) ?? null
  return <BottlesView supplies={supplies} onOpen={onOpen}>
    {sheet === null ? null : (
      <BottleSheet key={selected} householdId={householdId} supplies={supplies} supply={sheet === 'new' ? null : sheet} headerArt={sheet === 'new' ? undefined : <ProductArt supply={sheet} />} onClose={onClose} onSaved={toast.success} />
    )}
    {selected !== undefined && sheet === null ? <p className={noticeClassName} role="status">This product is no longer in this household. <Button variant="ghost" className="min-h-11 px-3 font-semibold text-link" onClick={onClose}>Return to products</Button></p> : null}
  </BottlesView>
}

export function BottlesView({ supplies, onOpen, children }: { supplies: Supply[]; onOpen: (id: string) => void; children?: ReactNode }) {
  const [search, setSearch] = useDeviceState('product-search', '', (value): value is string => typeof value === 'string' && value.length <= 500)
  const matching = supplies.filter((supply) => matchesHouseholdSearch(search, [supply.name, supply.formulation?.form, supply.use, productGroup(supply)]))
  const active = matching.filter((supply) => !supply.archived)
  const archived = matching.filter((supply) => supply.archived)
  const row = (supply: Supply) => <ProductTile key={supply.supplyId} supply={supply} onOpen={() => onOpen(supply.supplyId)} />
  const groups = productGroupOrder.map((heading) => [heading, active.filter((supply) => productGroup(supply) === heading)] as const).filter(([, list]) => list.length > 0)
  return (
    <section className="grid min-w-0 grid-cols-1 gap-5" aria-label={householdText.productsTitle}>
      {supplies.length === 0 ? <CareEmpty icon="bottle" art={<CategoryPhoto src="/design/detergent-photo.webp" fallback={null} className="mx-auto block h-28 w-full object-contain" />} title="Add the product you use" description="Copy its type and name from the pack. You can add directions when you have the label.">
        <Button onClick={() => onOpen('new')}>{householdListCopy.addProduct}</Button>
      </CareEmpty> : <>
        <BrowseSearch label="Search products" value={search} placeholder="Search name, type or purpose" onChange={setSearch}
          summary={<p className="m-0 text-[length:var(--step--1)] text-ink-2" role="status">{active.length} {active.length === 1 ? 'product' : 'products'}{archived.length === 0 ? '' : ` · ${archived.length} removed`}</p>}
          actions={<Button variant="outline" onClick={() => onOpen('new')}><DesignIcon name="plus" size="1em" aria-hidden="true" />{householdListCopy.addProduct}</Button>} />
      </>}
      {groups.map(([heading, list]) => <RowSection key={heading} heading={heading}>{list.map(row)}</RowSection>)}
      {supplies.length > 0 && active.length === 0 ? <p className="m-0 text-ink-2" role="status">{search.trim() ? 'No active products match this search.' : 'No products in use. Removed products are below.'}</p> : null}
      {supplies.length > 0 && search.trim() ? <Button variant="ghost" className="justify-self-start" onClick={() => setSearch('')}>Clear product search</Button> : null}
      {archived.length > 0 ? <Removed count={archived.length}>{archived.map(row)}</Removed> : null}
      {children}
    </section>
  )
}

// ---- Machines --------------------------------------------------------------

type PlaceKey = keyof typeof householdListCopy.applianceGroups
const placeOf = (group: MachineGroup): PlaceKey => group.machines[0]?.location ?? 'unset'

export function matchesHouseholdSearch(search: string, values: readonly (string | null | undefined)[]): boolean {
  const words = search.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
  const text = values.filter(Boolean).join(' ').replaceAll('_', ' ').toLocaleLowerCase()
  return words.every((word) => text.includes(word))
}

/**
 * Appliances, grouped the way a shared room has them ("Speed Queen washer ×4") and sectioned by
 * where they are. A row opens the sheet for the whole group; a section of its own holds the Add row.
 */
function Machines({ householdId, savedPlace, machines, currency, water, day, selected, onOpen, onClose }: { householdId: Id<'households'>; savedPlace: CurrentHousehold['washPlace']; machines: Machine[]; currency: string; water: HouseholdWater | undefined; day: Inventory['planning']['day']; selected?: string; onOpen: (id: string) => void; onClose: () => void }) {
  const pair = useConvexCall(api.inventory.createHomePair)
  const [waterOpen, setWaterOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const groups = machineGroups(machines)
  const sheet = selected === 'new' ? 'new' : groups.find((group) => group.machines.some((machine) => machine.machineId === selected)) ?? null
  const place = washPlace(householdId, savedPlace) ?? (groups.some((group) => !group.machines.every((machine) => machine.archived) && group.machines[0]?.location === 'shared') ? 'shared' : null)
  const unfinished = useIntakeDraft('machine-intake', validMachineIntake, previousMachineDraftNames)
  return <MachinesView machines={machines} currency={currency} place={place} unfinished={unfinished} pending={pair.pending} addError={pair.error} onOpen={onOpen} onHomePair={() => void pair.run({ householdId })}>
    <RecordList><RecordRow media={<DesignIcon name="gear" strokeWidth={1.6} />} title="Laundry setup" fact="Water and laundry-day preferences" onOpen={() => setSetupOpen(true)} /></RecordList>
    {setupOpen ? <Sheet title="Laundry setup" closeAtTop onClose={() => setSetupOpen(false)} footer={<Button onClick={() => setSetupOpen(false)}>Done</Button>}>
      <WaterSection water={water} onOpen={() => setWaterOpen(true)} />
      <LaundryDaySection householdId={householdId} day={day} />
      {waterOpen ? <WaterSheet householdId={householdId} water={water} onClose={() => setWaterOpen(false)} /> : null}
    </Sheet> : null}
    {sheet === null ? null : (
      <MachineSheet key={selected} householdId={householdId} group={sheet === 'new' ? null : sheet} headerArt={sheet === 'new' ? undefined : <MachineArt type={sheet.machines[0]!.applianceType} />} currency={currency} place={place}
        onClose={onClose} onSaved={toast.success} />
    )}
    {selected !== undefined && sheet === null ? <p className={noticeClassName} role="status">This appliance is no longer in this household. <Button variant="ghost" className="min-h-11 px-3 font-semibold text-link" onClick={onClose}>Return to appliances</Button></p> : null}
  </MachinesView>
}

export function MachinesView({ machines, currency, place, unfinished = false, pending = false, addError = null, onOpen, onHomePair, children }: { machines: Machine[]; currency: string; place: ReturnType<typeof washPlace>; unfinished?: boolean; pending?: boolean; addError?: string | null; onOpen: (id: string) => void; onHomePair: () => void; children?: ReactNode }) {
  const [search, setSearch] = useDeviceState('appliance-search', '', (value): value is string => typeof value === 'string' && value.length <= 500)
  const groups = machineGroups(machines)
  const matching = groups.filter((group) => matchesHouseholdSearch(search, [group.name, householdListCopy.applianceGroups[placeOf(group)], ...group.machines.flatMap((machine) => [machine.name, machine.model, machine.applianceType])]))
  const active = matching.filter((group) => !group.machines.every((machine) => machine.archived))
  const archived = matching.filter((group) => group.machines.every((machine) => machine.archived))
  const machineRow = (group: MachineGroup) => <MachineTile key={group.key} group={group} currency={currency} onOpen={() => onOpen(group.machines[0]!.machineId)} />
  const sections = (['shared', 'home', 'unset'] as const).map((key) => [key, active.filter((group) => placeOf(group) === key)] as const).filter(([, list]) => list.length > 0)
  const needsHomePair = place === 'home' && !groups.some((group) => placeOf(group) === 'home' && !group.machines.every((machine) => machine.archived))
  const add = unfinished ? ['Continue adding an appliance', 'Your unfinished answers are on this device'] as const
    : needsHomePair ? ['Add your washer and dryer', 'The usual setup for a home'] as const
    : place === 'home' ? [householdListCopy.addApplianceHome, householdListCopy.addApplianceHomeHint] as const
    : place === 'shared' ? [householdListCopy.addApplianceShared, householdListCopy.addApplianceSharedHint] as const
    : [householdListCopy.addAppliance, householdListCopy.addApplianceHint] as const
  const addMachine = () => needsHomePair && !unfinished ? onHomePair() : onOpen('new')
  const count = active.reduce((total, group) => total + group.machines.length, 0)
  return (
    <section className="grid min-w-0 grid-cols-1 gap-5" aria-label={householdText.machinesTitle}>
      {machines.length === 0 ? <CareEmpty icon="washer" art={<CategoryPhoto src="/design/laundry-setup.webp" fallback={null} className="block h-auto w-full object-contain" />} title="Add the machines you use" description={needsHomePair ? 'Start with your washer and dryer. You can record model and program details later.' : 'Copy the type and label from your washer or dryer. Add checked program details when you have the manual.'}>
        <Button disabled={pending} onClick={addMachine}>{pending ? 'Adding washer and dryer…' : add[0]}</Button>
      </CareEmpty> : <>
        <BrowseSearch label="Search appliances" value={search} placeholder="Search name, model or location" onChange={setSearch}
          summary={<p className="m-0 text-[length:var(--step--1)] text-ink-2" role="status">{count} {count === 1 ? 'appliance' : 'appliances'}{archived.length === 0 ? '' : ` · ${archived.reduce((total, group) => total + group.machines.length, 0)} removed`}</p>}
          actions={<Button variant="outline" disabled={pending} onClick={addMachine}><DesignIcon name="plus" size="1em" aria-hidden="true" />{pending ? 'Adding washer and dryer…' : add[0]}</Button>} />
      </>}
      {sections.map(([key, list]) => <RowSection key={key} heading={householdListCopy.applianceGroups[key]}>{list.map(machineRow)}</RowSection>)}
      {machines.length > 0 && active.length === 0 ? <p className="m-0 text-ink-2" role="status">{search.trim() ? 'No active appliances match this search.' : 'No appliances in use. Removed appliances are below.'}</p> : null}
      {machines.length > 0 && search.trim() ? <Button variant="ghost" className="justify-self-start" onClick={() => setSearch('')}>Clear appliance search</Button> : null}
      <ErrorNotice error={addError} />
      {archived.length === 0 ? null : <Removed count={archived.length}>{archived.map(machineRow)}</Removed>}
      {children}
    </section>
  )
}
