import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/api'
import { Button, buttonVariants } from '@/components/ui/button'
import { Sheet } from '@/kit/sheet'
import { DesignIcon } from '@/kit/design-icons'
import { clockTime, useConvexCall } from '@/kit/ui'
import { RecordList, RecordRow } from '@/kit/record-row'
import { SegmentChoice, TextField } from '@/laundry/laundry-ui'
import { TapRow } from '@/laundry/laundry-kit'
import { todayAt } from '@/laundry/day-plan'
import { countWord } from '@/copy'
import { BulkClosetSheet, PagedBulkClosetSheet } from '@/closet/bulk-sheet'
import { groupGarments } from '@/closet/garment-groups'
import type { FlagCall } from '@/closet/flag-sheet'
import type { Inventory, Textile } from '@/household/inventory-types'
import type { Id } from '@convex/_generated/dataModel'
import type { LaundryLink } from '@/laundry/laundry-view'

export const readyForLaundry = (textiles: readonly Textile[]) => textiles.filter(piece => !piece.guest && piece.status === 'clean' && piece.inLoad === null)

/** A planning preference, never a reservation, a care permission or a promised finish. */
export function laundryPace(day: Inventory['planning']['day'], now: number): string {
  const pace = day?.pace === 'spread' ? `${day.loadsPerDay ?? 2} ${(day.loadsPerDay ?? 2) === 1 ? 'load' : 'loads'} a day` : 'All today'
  const at = day?.finishBy === undefined ? null : todayAt(day.finishBy, now)
  return at === null ? pace : `${pace} · aim to finish by ${clockTime(at)}`
}

function LaundryDayPreferences({ householdId, day, onClose, onDone }: { householdId: string; day: Inventory['planning']['day']; onClose: () => void; onDone: () => void }) {
  const save = useConvexCall(api.inventory.setLaundryDay)
  const [pace, setPace] = useState<'all' | 'spread'>(day?.pace ?? 'all')
  const [loads, setLoads] = useState(day?.loadsPerDay ?? 2)
  const [finishBy, setFinishBy] = useState(day?.finishBy ?? '')
  const changed = pace !== (day?.pace ?? 'all') || loads !== (day?.loadsPerDay ?? 2) || finishBy !== (day?.finishBy ?? '')
  return <Sheet title="Laundry day" subtitle="Your usual pace. Change it with each plan." onClose={onClose} dirty={changed} busy={save.pending}
    footer={<Button type="button" disabled={save.pending} onClick={() => void save.run({ householdId: householdId as Parameters<typeof save.run>[0]['householdId'], pace, loadsPerDay: loads, finishBy: finishBy || null }).then(result => { if (result !== undefined) onDone() })}>{save.pending ? 'Saving…' : 'Save preferences'}</Button>}>
    <div className="grid gap-2"><p id="laundry-pace" className="m-0 font-semibold">How would you like to tackle it?</p>
      <SegmentChoice labelledBy="laundry-pace" value={pace} disabled={save.pending} options={[{ value: 'all', label: 'All today' }, { value: 'spread', label: 'Spread out' }]} onChange={value => setPace(value === 'spread' ? 'spread' : 'all')} />
      <p className="m-0 text-ink-2">{pace === 'all' ? 'See which loads fit in the time you have.' : 'Keep the day manageable. Urgent items can still go first.'}</p>
    </div>
    {pace !== 'spread' ? null : <div className="grid gap-2"><p id="laundry-load-count" className="m-0 font-semibold">Loads per day</p><SegmentChoice labelledBy="laundry-load-count" value={String(loads)} disabled={save.pending} options={[1, 2, 3].map(value => ({ value: String(value), label: `${value} ${value === 1 ? 'load' : 'loads'}` }))} onChange={value => setLoads(Number(value))} /></div>}
    <TextField label="Aim to finish by (optional)" type="time" value={finishBy} disabled={save.pending} onChange={event => setFinishBy(event.target.value)} hint="A planning limit, not a reminder. Leave blank to choose when you plan." />
    <p className="m-0 text-ink-2">Once clothes are in the hamper, review their labels and proposed loads. Timing depends on recorded equipment and cycle times.</p>
    {save.error === null ? null : <p role="alert" className="m-0 text-conflict-ink">{save.error}</p>}
  </Sheet>
}

function ReadyLaundryPicker({ inventory, householdId, now, flag, close, done }: { inventory: Inventory; householdId?: string; now: number; flag: FlagCall; close: () => void; done: (message: string | null) => void }) {
  const update = useMutation(api.inventory.bulkUpdateTextiles)
  const ready = readyForLaundry(inventory.textiles)
  const profiles = [...new Set(ready.map(piece => piece.wearerId))]
  const groups = profiles.flatMap(profile => groupGarments(ready.filter(piece => piece.wearerId === profile))).map(group => ({ key: group.members[0]!.textileId, members: group.members }))
  return householdId === undefined ? <BulkClosetSheet hamperOnly groups={groups} wearers={inventory.wearers} knownTags={[]} now={now} update={update} flag={flag} onClose={close} onDone={done} /> : <PagedBulkClosetSheet hamperOnly args={{ householdId: householdId as Id<'households'>, search: '', section: 'ready', tags: [] }} wearers={inventory.wearers} now={now} update={update} flag={flag} onClose={close} onDone={done} />
}

/** A root-page workspace survives an empty hamper; it prepares the next real plan. */
export function LaundryWorkspace({ householdId, inventory, now, waiting, empty, active, pending, renderLink, onAdd, flag, onDone, counts }: {
  householdId: string; inventory: Inventory; now: number; waiting: number; empty: boolean; active: boolean; pending: boolean;
  renderLink: LaundryLink; onAdd: () => void; flag: FlagCall; onDone: (message: string | null) => void;
  counts?: { ready: number; total: number };
}) {
  const [editing, setEditing] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const ready = counts?.ready ?? readyForLaundry(inventory.textiles).length
  const first = (counts?.total ?? inventory.textiles.length) === 0
  const machines = inventory.machines
  const supplies = inventory.supplies
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6" data-laundry-workspace>
    {!empty ? null : <section aria-label="Your hamper" className="overflow-hidden rounded-card bg-surface shadow-[var(--e1)]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 px-5 pt-5 pb-4 [overflow-wrap:anywhere]">
        <img src="/design/empty-hamper.webp" alt="" width={960} height={480} loading="eager" decoding="async" className="mx-auto block h-auto w-full max-w-[18rem] object-contain [mask-image:linear-gradient(to_bottom,_#000_65%,_transparent_100%)]" />
        <h2 className="m-0 text-[length:var(--step-3)] font-semibold leading-tight">{first ? 'Start with what needs washing.' : 'Nothing waiting to wash.'}</h2>
        <p className="m-0 max-w-prose text-ink-2">{first ? 'Add the clothes or linens you want to wash. We’ll help you make loads and work through their care.' : 'When something needs a wash, choose it from your closet. Your next plan starts here.'}</p>
      </div>
      <div className="border-0 border-t border-solid border-line">
        <TapRow media={<DesignIcon name={ready > 0 ? 'closet' : 'plus'} />} title={ready > 0 ? 'Choose from closet' : 'Add clothes to wash'} fact={ready > 0 ? `${countWord(ready, 'piece')} ready · choose what you’ve used` : 'Start with a towel, sheets or everyday clothes'} onClick={ready > 0 ? () => setChoosing(true) : onAdd} disabled={pending} highlight />
        {ready === 0 ? null : <TapRow media={<DesignIcon name="plus" />} title="Add something else" fact="Record an item you haven’t added yet" onClick={onAdd} disabled={pending} />}
      </div>
    </section>}
    <section aria-label="Laundry day setup" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1"><h2 className="m-0 text-[length:var(--step-2)] font-semibold">{active ? 'Your laundry day' : 'Plan your laundry day'}</h2><span className="text-[length:var(--step--1)] text-ink-2">{empty ? 'Ready when you are' : countWord(waiting, 'piece') + ' waiting'}</span></div>
      <RecordList>
        <RecordRow media={<DesignIcon name="clock" />} title="Your usual pace" fact={laundryPace(inventory.planning.day, now)} label="Set up your laundry day" disabled={pending} onOpen={() => setEditing(true)} />
        {empty || ready === 0 ? null : <RecordRow media={<DesignIcon name="closet" />} title="Choose more from closet" fact={`${countWord(ready, 'piece')} ready · choose what you’ve used`} label="Choose more from closet" disabled={pending} onOpen={() => setChoosing(true)} />}
      </RecordList>
      {!empty || machines.length > 0 && supplies.length > 0 ? null : <div className="grid gap-1">
        <p className="m-0 px-1 text-[length:var(--step--1)] text-ink-2">A few details make your first plan more useful.</p>
        {machines.length > 0 ? null : renderLink({ to: 'household', section: 'machines' }, { className: buttonVariants({ variant: 'ghost', className: 'h-auto min-h-11 justify-start whitespace-normal text-start' }), children: <><DesignIcon name="washer" />Add your washer or dryer<DesignIcon name="chevronRight" className="ms-auto flex-none" /></> })}
        {supplies.length > 0 ? null : renderLink({ to: 'household', section: 'bottles' }, { className: buttonVariants({ variant: 'ghost', className: 'h-auto min-h-11 justify-start whitespace-normal text-start' }), children: <><DesignIcon name="bottle" />Add your laundry products<DesignIcon name="chevronRight" className="ms-auto flex-none" /></> })}
      </div>}
    </section>
    {!editing ? null : <LaundryDayPreferences householdId={householdId} day={inventory.planning.day} onClose={() => setEditing(false)} onDone={() => { setEditing(false); onDone('Laundry day saved') }} />}
    {!choosing ? null : <ReadyLaundryPicker inventory={inventory} householdId={counts === undefined ? undefined : householdId} now={now} flag={flag} close={() => setChoosing(false)} done={message => { setChoosing(false); onDone(message) }} />}
  </div>
}
