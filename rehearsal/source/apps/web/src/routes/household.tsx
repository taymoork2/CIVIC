import { cn } from '@/lib/utils'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { RequireHousehold, type CurrentHousehold } from '@/account/account'
import type { Id } from '../../../../convex/_generated/dataModel'
import { api } from '../api'
import { BottleSheet } from '@/products/bottle-sheet'
import { householdText } from '../copy'
import { householdListCopy } from '../copy-household'
import { RouteError } from '@/kit/route-error'
import { AddRow, MachineTile, ProductTile, productGroup } from '@/household/household-tiles'
import { RowSection, SheetText } from '@/household/household-blocks'
import { MachineArt, ProductArt } from '@/household/household-art'
import { CareHero, SectionNav } from '@/products/product-ui'
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

export { Members }

const pageClassName = cn(
  "page",
  "[.app-shell.is-focus_&]:max-w-[30rem]",
  "grid gap-6 max-w-[36rem] mx-auto pt-2",
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

export const Route = createFileRoute('/household')({
  errorComponent: RouteError,
  validateSearch: (search: Record<string, unknown>): { section?: HouseholdSection; machine?: string; product?: string } => ({
    ...(search.section === 'machines' || search.section === 'bottles' || search.section === 'people' ? { section: search.section } : {}),
    ...(typeof search.machine === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(search.machine) ? { machine: search.machine } : {}),
    ...(typeof search.product === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(search.product) ? { product: search.product } : {}),
  }),
  component: Household,
})

function Household() {
  return <RequireHousehold>{(household) => <HouseholdPage household={household} />}</RequireHousehold>
}

const sections: ReadonlyArray<readonly [HouseholdSection, string]> = [['people', householdText.sections.people], ['machines', 'Appliances'], ['bottles', householdText.sections.bottles]]

function HouseholdPage({ household }: { household: CurrentHousehold }) {
  const shared = useHouseholdData(household.householdId)
  const inventory = useQuery(api.inventory.list, { householdId: household.householdId }) ?? shared?.inventory
  const search = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const section = search.machine !== undefined ? 'machines' : search.product !== undefined ? 'bottles' : search.section === 'machines' || search.section === 'bottles' ? search.section : 'people'
  const pick = (next: HouseholdSection) => {
    void navigate({ to: '/household', search: { section: next }, resetScroll: false })
  }
  const closeItem = () => dismissItem(router, () => void navigate({ to: '/household', search: { section }, replace: true, resetScroll: false }))
  return (
    <HouseholdView name={household.name} section={section} onSection={pick}>
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
export function HouseholdView({ name, section, onSection, children }: { name: string; section: HouseholdSection; onSection: (section: HouseholdSection) => void; children: ReactNode }) {
  return <div className={cn(pageClassName, householdPageClassName)}>
    <CareHero title={name} />
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
 * product". Put-away products fold below.
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
  const active = supplies.filter((supply) => !supply.archived)
  const archived = supplies.filter((supply) => supply.archived)
  const row = (supply: Supply) => <ProductTile key={supply.supplyId} supply={supply} onOpen={() => onOpen(supply.supplyId)} />
  const groups = productGroupOrder.map((heading) => [heading, active.filter((supply) => productGroup(supply) === heading)] as const).filter(([, list]) => list.length > 0)
  return (
    <section className="grid gap-5" aria-label={householdText.productsTitle}>
      {groups.map(([heading, list]) => <RowSection key={heading} heading={heading}>{list.map(row)}</RowSection>)}
      {active.length === 0 ? <SheetText>{householdListCopy.noProducts}</SheetText> : null}
      <RowSection><AddRow label={householdListCopy.addProduct} onClick={() => onOpen('new')} /></RowSection>
      {archived.length > 0 ? <Removed count={archived.length}>{archived.map(row)}</Removed> : null}
      {children}
    </section>
  )
}

// ---- Machines --------------------------------------------------------------

type PlaceKey = keyof typeof householdListCopy.applianceGroups
const placeOf = (group: MachineGroup): PlaceKey => group.machines[0]?.location ?? 'unset'

/**
 * Appliances, grouped the way a shared room has them ("Speed Queen washer ×4") and sectioned by
 * where they are. A row opens the sheet for the whole group; a section of its own holds the Add row.
 */
function Machines({ householdId, savedPlace, machines, currency, water, day, selected, onOpen, onClose }: { householdId: Id<'households'>; savedPlace: CurrentHousehold['washPlace']; machines: Machine[]; currency: string; water: HouseholdWater | undefined; day: Inventory['planning']['day']; selected?: string; onOpen: (id: string) => void; onClose: () => void }) {
  const pair = useConvexCall(api.inventory.createHomePair)
  const [waterOpen, setWaterOpen] = useState(false)
  const groups = machineGroups(machines)
  const sheet = selected === 'new' ? 'new' : groups.find((group) => group.machines.some((machine) => machine.machineId === selected)) ?? null
  const place = washPlace(householdId, savedPlace) ?? (groups.some((group) => !group.machines.every((machine) => machine.archived) && group.machines[0]?.location === 'shared') ? 'shared' : null)
  return <MachinesView machines={machines} currency={currency} place={place} pending={pair.pending} addError={pair.error} onOpen={onOpen} onHomePair={() => void pair.run({ householdId })}>
    <WaterSection water={water} onOpen={() => setWaterOpen(true)} />
    <LaundryDaySection householdId={householdId} day={day} />
    {waterOpen ? <WaterSheet householdId={householdId} water={water} onClose={() => setWaterOpen(false)} /> : null}
    {sheet === null ? null : (
      <MachineSheet key={selected} householdId={householdId} group={sheet === 'new' ? null : sheet} headerArt={sheet === 'new' ? undefined : <MachineArt type={sheet.machines[0]!.applianceType} />} currency={currency} place={place}
        onClose={onClose} onSaved={toast.success} />
    )}
    {selected !== undefined && sheet === null ? <p className={noticeClassName} role="status">This appliance is no longer in this household. <Button variant="ghost" className="min-h-11 px-3 font-semibold text-link" onClick={onClose}>Return to appliances</Button></p> : null}
  </MachinesView>
}

export function MachinesView({ machines, currency, place, pending = false, addError = null, onOpen, onHomePair, children }: { machines: Machine[]; currency: string; place: ReturnType<typeof washPlace>; pending?: boolean; addError?: string | null; onOpen: (id: string) => void; onHomePair: () => void; children?: ReactNode }) {
  const groups = machineGroups(machines)
  const active = groups.filter((group) => !group.machines.every((machine) => machine.archived))
  const archived = groups.filter((group) => group.machines.every((machine) => machine.archived))
  const machineRow = (group: MachineGroup) => <MachineTile key={group.key} group={group} currency={currency} onOpen={() => onOpen(group.machines[0]!.machineId)} />
  const sections = (['shared', 'home', 'unset'] as const).map((key) => [key, active.filter((group) => placeOf(group) === key)] as const).filter(([, list]) => list.length > 0)
  const needsHomePair = place === 'home' && !active.some((group) => placeOf(group) === 'home')
  const add = needsHomePair ? ['Add your washer and dryer', 'The usual setup for a home'] as const
    : place === 'home' ? [householdListCopy.addApplianceHome, householdListCopy.addApplianceHomeHint] as const
    : place === 'shared' ? [householdListCopy.addApplianceShared, householdListCopy.addApplianceSharedHint] as const
    : [householdListCopy.addAppliance, householdListCopy.addApplianceHint] as const
  return (
    <section className="grid gap-5" aria-label={householdText.machinesTitle}>
      {sections.map(([key, list]) => <RowSection key={key} heading={householdListCopy.applianceGroups[key]}>{list.map(machineRow)}</RowSection>)}
      {active.length === 0 ? <SheetText>{place === 'home' ? 'No washer or dryer yet.' : householdListCopy.noAppliances}</SheetText> : null}
      <RowSection><AddRow label={pending ? 'Adding washer and dryer…' : add[0]} hint={add[1]} disabled={pending} onClick={() => needsHomePair ? onHomePair() : onOpen('new')} /></RowSection>
      <ErrorNotice error={addError} />
      {archived.length === 0 ? null : <Removed count={archived.length}>{archived.map(machineRow)}</Removed>}
      {children}
    </section>
  )
}
