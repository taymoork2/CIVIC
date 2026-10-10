import { useEffect, useState, type ReactNode } from 'react'
import { useQuery } from 'convex/react'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { clothingTags, outfitGroupKey, usedClothingTags } from '@washcloset/planner'
import { api } from '@/api'
import type { Inventory, Textile } from '@/household/inventory-types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { NativeSelect } from '@/components/ui/native-select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { GarmentIcon } from '@/kit/garment-icon'
import { colourWord } from '@/copy'
import { Sheet } from '@/kit/sheet'
import { TaskFooter } from '@/kit/task-footer'
import { chipClassName } from '@/closet/closet-parts'
import { ErrorNotice, Loading, useConvexCall } from '@/kit/ui'
import { DesignIcon } from '@/kit/design-icons'

export function localOutfitDate(now: number) {
  const day = new Date(now)
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}

/** Reuse pieces already worn today before recording another wear of the same style. */
export function outfitWearPieces(items: FunctionReturnType<typeof api.outfits.today>[number]['items'], textiles: readonly Textile[], date: string) {
  return items.flatMap((item) => textiles.filter((textile) => !textile.guest && textile.status === 'clean' && textile.inLoad === null && outfitGroupKey(textile) === item.key)
    .sort((left, right) => Number(right.lastWornAt !== null && localOutfitDate(right.lastWornAt) === date) - Number(left.lastWornAt !== null && localOutfitDate(left.lastWornAt) === date))
    .slice(0, item.quantity))
}

export function DailyOutfit({ householdId, inventory, now, meWearerId }: {
  householdId: string; inventory: Inventory; now: number; meWearerId: string | null;
}) {
  const [chosenRecipient, setRecipient] = useState<string | null>(null)
  const [day, setDay] = useState<{ date: string } | null>(null)
  useEffect(() => { setDay({ date: localOutfitDate(now) }) }, [now])
  const recipient = chosenRecipient !== null && (chosenRecipient === 'unassigned' || inventory.wearers.some((person) => person.wearerId === chosenRecipient)) ? chosenRecipient : meWearerId ?? inventory.wearers[0]?.wearerId ?? 'unassigned'
  const wearerId = recipient === 'unassigned' ? null : recipient as FunctionArgs<typeof api.outfits.today>['wearerId']
  const hasUnassigned = inventory.wearers.length === 0 || inventory.textiles.some((item) => !item.guest && item.wearerId === null)
  const recipientCount = inventory.wearers.length + (hasUnassigned ? 1 : 0)
  return <section className="daily-outfit grid gap-3" aria-labelledby="today-outfit-title">
    {day === null ? <><h2 id="today-outfit-title" className="m-0 text-[length:var(--step-2)] font-semibold">Today’s outfit</h2><Loading what="today’s outfit" /></> : <>
    <DailyOutfitPick key={`${day.date}:${recipient}`} householdId={householdId} inventory={inventory} date={day.date} wearerId={wearerId}
      recipientControl={recipientCount > 1 ? <span className="max-w-[9rem] [&>div]:w-auto"><label htmlFor="outfit-recipient" className="sr-only">Outfit for</label><NativeSelect id="outfit-recipient" size="sm" value={recipient} onChange={(event) => setRecipient(event.target.value)}>{inventory.wearers.map((person) => <option key={person.wearerId} value={person.wearerId}>{person.wearerId === meWearerId ? 'Me' : person.name}</option>)}{hasUnassigned ? <option value="unassigned">Unassigned clothes</option> : null}</NativeSelect></span> : null} />
    </>}
  </section>
}

function OutfitItems({ items, unavailableKeys }: { items: FunctionReturnType<typeof api.outfits.today>[number]['items']; unavailableKeys: ReadonlySet<string> }) {
  return <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0" aria-label="Planned outfit">
    {items.map((item) => <li key={item.key} className="grid min-w-0 content-start gap-1.5">
      <span className="relative block h-[140px] overflow-hidden rounded-control bg-surface-2 [&_.garment-icon]:absolute [&_.garment-icon]:inset-0 [&_.garment-icon]:m-auto [&_.garment-icon]:size-16" aria-hidden="true">
        <GarmentIcon kind={item.kind} colorGroup={item.colorGroup} className="size-16" />
      </span>
      <span className="px-1 text-[length:var(--step-0)] font-semibold leading-[1.3]">{item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</span>
      {unavailableKeys.has(item.key) ? <span className="px-1 text-[length:var(--step--1)] text-ink-2">No longer ready — choose a replacement</span> : null}
    </li>)}
  </ul>
}

/** Shared with the inert design preview so populated states use the shipped card. */
export function DailyOutfitCard({ items, unavailableKeys = new Set<string>(), controls, loading = false, emptyTitle, emptyText, emptyAction, by, wearAction }: {
  items: FunctionReturnType<typeof api.outfits.today>[number]['items']; unavailableKeys?: ReadonlySet<string>;
  controls?: ReactNode; loading?: boolean; emptyTitle?: string; emptyText?: string; emptyAction?: ReactNode; by?: string; wearAction?: ReactNode;
}) {
  return <div className="grid gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="today-outfit-title" className="m-0 text-[length:var(--step-2)] font-semibold">Today’s outfit</h2>
      {controls}
    </div>
    <div className="grid gap-3 rounded-card bg-surface p-3 shadow-[var(--e1)]">
      {loading ? <Loading what="today’s outfit" /> : items.length === 0 ? <>
        <div className="flex items-start gap-3 p-1">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-surface-2 text-link"><DesignIcon name="hang" size="1em" className="size-7" aria-hidden="true"  /></span>
          <div className="grid gap-1">
            {emptyTitle ? <h3 className="m-0 text-[length:var(--step-1)] font-semibold leading-[1.3]">{emptyTitle}</h3> : null}
            <p className="m-0 text-[length:var(--step--1)] text-ink-2">{emptyText}</p>
          </div>
        </div>
        {emptyAction}
      </> : <OutfitItems items={items} unavailableKeys={unavailableKeys} />}
      {loading || items.length === 0 ? null : <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-[length:var(--step--1)] text-ink-2">{by}</span>
        {wearAction}
      </div>}
    </div>
  </div>
}

/** The existing picker presentation; its caller owns ready-clothes scope and persistence. */
export function OutfitPickerSheet({ choices, tags, tag, draft, dirty, pending, staleDraft, selectedCount, hasOutfit, error, onClose, onSave, onTag, onChange }: {
  choices: readonly (readonly [string, { textile: Pick<Textile, 'name' | 'color' | 'colorGroup'> & { kind?: Textile['kind'] }; count: number }])[]; tags: readonly string[]; tag: string | null;
  draft: Record<string, number>; dirty: boolean; pending: boolean; staleDraft: boolean; selectedCount: number; hasOutfit: boolean; error: string | null;
  onClose: () => void; onSave: () => void; onTag: (tag: string | null) => void; onChange: (key: string, quantity: number) => void;
}) {
  return <Sheet title="Outfit" onClose={onClose} dirty={dirty}
    footer={<TaskFooter>
      <Button size="lg" disabled={pending || staleDraft || !dirty} onClick={onSave}>{pending ? 'Saving…' : selectedCount === 0 && hasOutfit ? 'Clear outfit' : 'Save outfit'}</Button>
    </TaskFooter>}>
    {tags.length > 0 || tag !== null ? <div className="-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none]" role="group" aria-label="Outfit tags"><button type="button" className={chipClassName} aria-pressed={tag === null} onClick={() => onTag(null)} disabled={pending}>All tags</button>{tags.map((value) => <button key={value} type="button" className={chipClassName} aria-pressed={tag === value} onClick={() => onTag(value)} disabled={pending}>{value}</button>)}</div> : null}
    <ul className="m-0 flex list-none flex-wrap items-start gap-2 p-0" aria-label="Choose ready clothes">
      {choices.map(([key, { textile, count }]) => {
        const quantity = draft[key] ?? 0
        return <li key={key} className="grid max-w-full gap-1">
          <button type="button" className={cn(chipClassName, 'min-w-0 max-w-full whitespace-normal py-2 text-start [overflow-wrap:anywhere]')} aria-pressed={quantity > 0} aria-label={`Choose ${textile.name}, ${textile.color ?? colourWord(textile.colorGroup)}`} disabled={pending} onClick={() => onChange(key, quantity > 0 ? 0 : 1)}>
            <span className="min-w-0 [overflow-wrap:anywhere]"><GarmentIcon kind={textile.kind ?? null} colorGroup={textile.colorGroup} className="me-1.5 size-[1.25em] align-[-0.3em]" /><span>{textile.name}{choices.some(([otherKey, { textile: other }]) => otherKey !== key && other.name === textile.name) ? ` · ${textile.color ?? colourWord(textile.colorGroup)}` : ''}</span></span>
          </button>
          {quantity > 0 && count > 1 ? <div className="flex flex-wrap items-center justify-end gap-1 px-4 pb-3 [@container_(width_<_16rem)]:justify-center [@container_(width_<_16rem)]:px-0"><Button variant="tonal" size="icon" aria-label={`Fewer ${textile.name}, ${textile.color}`} disabled={pending || quantity <= 1} onClick={() => onChange(key, quantity - 1)}><DesignIcon name="minus" size="1em"  /></Button><span className="min-w-14 text-center text-[length:var(--step-1)] font-semibold tabular-nums">{quantity} of {count}</span><Button variant="tonal" size="icon" aria-label={`More ${textile.name}, ${textile.color}`} disabled={pending || quantity >= Math.min(count, 20)} onClick={() => onChange(key, quantity + 1)}><DesignIcon name="plus" size="1em"  /></Button></div> : null}
        </li>
      })}
    </ul>
    {choices.length === 0 ? <p className="m-0 text-[length:var(--step-0)] text-ink-2">No ready clothes{tag ? ` tagged “${tag}”` : ''}.</p> : null}
    {staleDraft ? <p role="alert" className="m-0 text-[length:var(--step--1)] text-ink-2">Some clothes are no longer ready. Close and choose again.</p> : null}
    <ErrorNotice error={error} />
  </Sheet>
}

function DailyOutfitPick({ householdId, inventory, date, wearerId, recipientControl }: {
  householdId: string; inventory: Inventory; date: string; wearerId: FunctionArgs<typeof api.outfits.today>['wearerId']; recipientControl: ReactNode;
}) {
  const args = { householdId: householdId as FunctionArgs<typeof api.outfits.today>['householdId'], wearerId, date }
  const plans = useQuery(api.outfits.today, args)
  const plan = plans?.find((pick) => pick.isYou)
  const save = useConvexCall(api.outfits.save)
  const wear = useConvexCall(api.closet.markWorn)
  const [draft, setDraft] = useState<Record<string, number> | null>(null)
  const [baseline, setBaseline] = useState<Record<string, number>>({})
  const [tag, setTag] = useState<string | null>(null)
  // Ready pieces only: clean, not in a load, not a guest's. Nothing else can be chosen for an outfit.
  const groups = new Map<string, { textile: Textile; count: number }>()
  for (const textile of inventory.textiles) {
    if (textile.guest || textile.status !== 'clean' || textile.inLoad !== null) continue
    const key = outfitGroupKey(textile)
    const group = groups.get(key)
    if (group) group.count += 1
    else groups.set(key, { textile, count: 1 })
  }
  const scoped = [...groups.entries()].filter(([, { textile }]) => textile.wearerId === wearerId)
  const tags = usedClothingTags(scoped.map(([, { textile }]) => textile))
  const choices = scoped.filter(([, { textile }]) => tag === null || clothingTags(textile).some((value) => value.toLowerCase() === tag.toLowerCase()))
  const items = plan?.items ?? []
  const selectedCount = Object.values(draft ?? {}).reduce((sum, count) => sum + count, 0)
  const staleDraft = Object.entries(draft ?? {}).some(([key, quantity]) => quantity > (groups.get(key)?.count ?? 0))
  const chosen = (value: Record<string, number> | null) => JSON.stringify(Object.entries(value ?? {}).filter(([, quantity]) => quantity > 0).sort(([left], [right]) => left.localeCompare(right)))
  const dirty = draft !== null && chosen(draft) !== chosen(baseline)
  const start = () => {
    save.clearError()
    setTag(null)
    const current = Object.fromEntries(items.flatMap((item) => groups.has(item.key) ? [[item.key, Math.min(item.quantity, groups.get(item.key)!.count)]] : []))
    setBaseline(current)
    setDraft(current)
  }
  const close = () => { setDraft(null); save.clearError() }
  const commit = async () => {
    if (draft === null || staleDraft) return
    const result = await save.run({ ...args, items: Object.entries(draft).filter(([, quantity]) => quantity > 0).map(([key, quantity]) => ({ textileId: groups.get(key)!.textile.textileId, quantity })) })
    if (result !== undefined) setDraft(null)
  }
  const change = (key: string, quantity: number) => setDraft((current) => ({ ...current, [key]: quantity }))

  // Mine, or a household member's suggestion: the tabs only exist when someone else has picked.
  const others = plans?.filter((pick) => !pick.isYou) ?? []
  const [view, setView] = useState<'mine' | number>('mine')
  const shown = view === 'mine' ? null : others[view] ?? null
  const mine = shown === null
  const shownItems = mine ? items : shown.items
  const wearPieces = outfitWearPieces(shownItems, inventory.textiles, date)
  const shownUnavailable = wearPieces.length !== shownItems.reduce((sum, item) => sum + item.quantity, 0)
  const wearing = wearPieces.length > 0 && wearPieces.every((piece) => piece.lastWornAt !== null && localOutfitDate(piece.lastWornAt) === date)
  const markWorn = async () => {
    const textileIds = wearPieces.filter((piece) => piece.lastWornAt === null || localOutfitDate(piece.lastWornAt) !== date).map((piece) => piece.textileId)
    if (shownUnavailable) return
    for (let offset = 0; offset < textileIds.length; offset += 200) {
      if (await wear.run({ textileIds: textileIds.slice(offset, offset + 200) }) === undefined) return
    }
  }
  const action = items.length > 0 ? 'Change today’s outfit' : 'Choose today’s outfit'

  return <div className="grid gap-3">
    <DailyOutfitCard items={shownItems} loading={plans === undefined}
      unavailableKeys={new Set(shownItems.filter((item) => (groups.get(item.key)?.count ?? 0) < item.quantity).map((item) => item.key))}
      emptyTitle={scoped.length === 0 ? 'A fresh start for this closet' : 'Your next outfit is already here'}
      emptyText={scoped.length === 0 ? 'No ready clothes yet. Check Laundry or choose another person to see what’s ready.' : 'Choose from your ready clothes now. One less decision when it’s time to get dressed.'}
      emptyAction={mine && plans !== undefined && scoped.length > 0 ? <Button variant="secondary" size="lg" className="w-full" onClick={start}>Choose today’s outfit</Button> : null}
      by={shownUnavailable ? 'Update your outfit before getting dressed.' : wearing ? 'Marked as worn today' : mine ? 'Your pick' : `Suggested by ${shown.authorName} · household`}
      wearAction={<Button variant="outline" size="sm" className="shrink-0 px-3.5 text-[length:var(--step-1)]" aria-pressed={wearing} disabled={wear.pending || shownUnavailable || wearing} onClick={markWorn}>{wear.pending ? 'Recording…' : wearing ? 'Wearing ✓' : 'Wear this'}</Button>}
      controls={<>{recipientControl}{others.length === 0 ? null : <RadioGroup variant="segment" aria-label="Whose outfit" value={mine ? 'mine' : String(view)} onValueChange={(value) => setView(value === 'mine' ? 'mine' : Number(value))} className="max-w-full overflow-x-auto [&_button]:whitespace-nowrap">
        <RadioGroupItem variant="segment" value="mine">Mine</RadioGroupItem>
        {others.map((pick, index) => <RadioGroupItem key={index} variant="segment" value={String(index)}>From {pick.authorName}</RadioGroupItem>)}
      </RadioGroup>}</>} />
    {draft === null ? <><ErrorNotice error={save.error} /><ErrorNotice error={wear.error} /></> : null}
    {mine && plans !== undefined && items.length > 0 ? <Button variant="outline" size="lg" className="w-full" onClick={start}>{action}</Button> : null}
    {draft === null ? null : <OutfitPickerSheet choices={choices} tags={tags} tag={tag} draft={draft} dirty={dirty} pending={save.pending} staleDraft={staleDraft} selectedCount={selectedCount} hasOutfit={items.length > 0} error={save.error} onClose={close} onSave={commit} onTag={setTag} onChange={change} />}
  </div>
}
