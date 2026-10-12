import { useId, useRef, useState } from 'react'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { api } from '@/api'
import { garmentKey } from '@washcloset/planner'
import { usePagedInventory, type BrowseArgs } from '@/closet/paged-inventory'
import type { Id } from '@convex/_generated/dataModel'
import type { Inventory, Textile } from '@/household/inventory-types'
import { effectiveWashMethod } from '@/household/inventory-types'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Sheet } from '@/kit/sheet'
import { Field, Stepper, errorMessage } from '@/kit/ui'
import { ClothingTagsEditor } from '@/closet/clothing-tags'
import { FlagSheet, type FlagCall } from '@/closet/flag-sheet'
import { closetState } from '@/closet/closet-groups'
import { colorWord } from '@/copy'
import { SearchField } from '@/closet/closet-parts'
import { PageStatus } from '@/kit/page-status'

export type BulkUpdate = (args: FunctionArgs<typeof api.inventory.bulkUpdateTextiles>) => Promise<FunctionReturnType<typeof api.inventory.bulkUpdateTextiles>>

/** Selection is concrete pieces, not a query that could include newly arriving records. */
export function BulkClosetSheet({ groups: initialGroups, wearers, knownTags, now, update, flag, onClose, onDone, hamperOnly = false, browsing }: {
  groups: readonly { key: string; members: readonly Textile[] }[];
  wearers: Inventory['wearers']; knownTags: readonly string[]; now: number;
  update: BulkUpdate; flag: FlagCall; onClose: () => void; onDone: (message: string | null) => void;
  hamperOnly?: boolean;
  browsing?: { search: string; onSearch: (value: string) => void; person: string; onPerson: (value: string) => void; loading: boolean; more: boolean; loadingMore: boolean; loadMore: () => void; total: number | undefined };
}) {
  const [groups, setGroups] = useState(initialGroups)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const previousGroups = useRef(initialGroups)
  if (browsing !== undefined && previousGroups.current !== initialGroups) {
    previousGroups.current = initialGroups
    setGroups(current => {
      const merged = new Map(current.map(group => [group.key, group]))
      for (const group of initialGroups) if (!counts[group.key]) merged.set(group.key, group)
      return [...merged.values()]
    })
  }
  const ownerId = useId()
  const [localSearch, setLocalSearch] = useState('')
  const [localPerson, setLocalPerson] = useState('everyone')
  const search = browsing?.search ?? localSearch
  const setSearch = browsing?.onSearch ?? setLocalSearch
  const person = browsing?.person ?? localPerson
  const setPerson = browsing?.onPerson ?? setLocalPerson
  const [step, setStep] = useState<'pieces' | 'action' | 'tags' | 'owner' | 'hamper'>('pieces')
  const [tags, setTags] = useState<string[]>([])
  const [owner, setOwner] = useState('shared')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = groups.flatMap((group) => group.members.slice(0, counts[group.key] ?? 0))
  const ids = selected.map((piece) => piece.textileId as Id<'textiles'>)
  const hamperAllowed = selected.every((piece) => closetState(piece) === 'ready')
  const oneCarePath = new Set(selected.map((piece) => effectiveWashMethod(piece) === 'dry_clean_only')).size === 1
  const label = (group: typeof groups[number]) => {
    const piece = group.members[0]!
    return [piece.name, piece.color === null ? null : colorWord(piece.color), wearers.find((wearer) => wearer.wearerId === piece.wearerId)?.name ?? 'Shared'].filter(Boolean).join(' · ')
  }
  const words = search.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
  const matching = browsing === undefined ? groups.filter(group => (person === 'everyone' || (group.members[0]?.wearerId ?? 'shared') === person) && words.every(word => label(group).toLocaleLowerCase().includes(word))) : initialGroups
  const save = async () => {
    if (pending || ids.length === 0 || ids.length > 200) return
    setPending(true); setError(null)
    try {
      const result = await update({ textileIds: ids, ...(step === 'tags' ? { addTags: tags } : { wearerId: owner === 'shared' ? null : owner as Id<'wearers'> }) })
      onDone(`${result.changed} ${result.changed === 1 ? 'piece' : 'pieces'} updated`)
    } catch (caught) { setError(errorMessage(caught)) }
    finally { setPending(false) }
  }
  if (step === 'hamper') return <FlagSheet garments={selected.map((piece) => ({ textileId: piece.textileId, name: piece.name, dryCleanOnly: effectiveWashMethod(piece) === 'dry_clean_only' }))} together={oneCarePath} now={now} flag={flag} onClose={() => setStep(hamperOnly ? 'pieces' : 'action')} onDone={onDone} />
  const count = `${selected.length} ${selected.length === 1 ? 'piece' : 'pieces'} selected`
  return <Sheet title={step === 'pieces' ? 'Choose pieces' : step === 'tags' ? 'Add tags' : step === 'owner' ? 'Belongs to' : 'Update selected pieces'} subtitle={count} dirty={tags.length > 0 || owner !== 'shared'} onClose={onClose} onBack={step === 'pieces' ? undefined : () => { setStep(step === 'action' ? 'pieces' : 'action'); setError(null) }} busy={pending}
    footer={step === 'action' ? undefined : <Button type="button" disabled={pending || selected.length === 0 || selected.length > 200 || (step === 'tags' && tags.length === 0)} onClick={() => step === 'pieces' ? setStep(hamperOnly ? 'hamper' : 'action') : void save()}>{pending ? 'Saving…' : step === 'pieces' ? 'Next' : `Update ${selected.length} ${selected.length === 1 ? 'piece' : 'pieces'}`}</Button>}>
    {step === 'pieces' ? <>
      <p className="m-0 text-ink-2">{hamperOnly ? 'Choose clothes or linens you have used. Nothing moves until you confirm.' : 'Choose how many of each item to update. Your current filters apply.'}</p>
      <SearchField label="Find pieces" placeholder="Search name, color or person" value={search} onChange={setSearch} />
      <Field label="Whose pieces">{id => <NativeSelect id={id} value={person} onChange={event => setPerson(event.target.value)}><option value="everyone">Everyone</option><option value="shared">Shared</option>{wearers.map(wearer => <option key={wearer.wearerId} value={wearer.wearerId}>{wearer.name}</option>)}</NativeSelect>}</Field>
      <p className="m-0 text-ink-2" role="status">{browsing?.loading ? 'Finding pieces…' : `${browsing?.total ?? matching.length} items`} · {count}. Up to 200 pieces at a time.</p>
      {matching.map((group) => <Stepper key={group.key} label={label(group)} value={counts[group.key] ?? 0} min={0} max={Math.min(group.members.length, 200 - selected.length + (counts[group.key] ?? 0))} onChange={(value) => setCounts((current) => ({ ...current, [group.key]: value }))} />)}
      {matching.length === 0 && !browsing?.loading ? <p className="m-0 text-ink-2">No pieces match. Try another name or person.</p> : null}
      {browsing !== undefined && !browsing.loading && matching.length > 0 ? <PageStatus shown={matching.reduce((sum, group) => sum + group.members.length, 0)} total={browsing.total} more={browsing.more} loading={browsing.loadingMore} onMore={browsing.loadMore} label="Show more pieces" /> : null}
    </> : <ul className="m-0 grid list-none gap-2 p-0">{groups.filter((group) => (counts[group.key] ?? 0) > 0).map((group) => <li key={group.key}>{label(group)} ×{Math.min(group.members.length, counts[group.key]!)}</li>)}</ul>}
    {step === 'action' ? <>
      <Button type="button" variant="outline" onClick={() => setStep('tags')}>Add tags</Button>
      <Button type="button" variant="outline" onClick={() => setStep('owner')}>Change who they belong to</Button>
      <Button type="button" variant="outline" disabled={!hamperAllowed} onClick={() => setStep('hamper')}>Move to hamper</Button>
      {!hamperAllowed ? <p className="m-0 text-ink-2">Choose only ready pieces to move them to the hamper.</p> : null}
    </> : step === 'tags' ? <><p className="m-0 text-ink-2">Choose at least one tag to add to every selected piece. Existing tags stay.</p><ClothingTagsEditor values={tags} knownTags={[...knownTags]} onChange={setTags} /></> : step === 'owner' ? <>
      <div className="grid gap-2"><label htmlFor={ownerId} className="font-semibold">Belongs to</label><NativeSelect id={ownerId} value={owner} onChange={(event) => setOwner(event.target.value)}><option value="shared">Shared</option>{wearers.map((wearer) => <option key={wearer.wearerId} value={wearer.wearerId}>{wearer.name}</option>)}</NativeSelect></div>
      <p className="m-0 text-ink-2">This changes the clothing profile. Visibility and care labels stay the same. Pieces in a running load must wait.</p>
    </> : null}
    {error === null ? null : <p role="alert" className="m-0 text-conflict-ink">{error}</p>}
  </Sheet>
}

export function PagedBulkClosetSheet({ args, ...props }: Omit<Parameters<typeof BulkClosetSheet>[0], 'groups' | 'knownTags' | 'browsing'> & { args: BrowseArgs }) {
  const [search, setSearch] = useState(args.search)
  const [person, setPerson] = useState(args.wearer === undefined ? 'everyone' : args.wearer ?? 'shared')
  const paging = usePagedInventory({ ...args, search, wearer: person === 'everyone' ? undefined : person === 'shared' ? null : person as Id<'wearers'> })
  const groups = new Map<string, Textile[]>()
  for (const piece of paging.pieces) {
    const key = JSON.stringify([garmentKey(piece), piece.wearerId])
    const members = groups.get(key)
    if (members === undefined) groups.set(key, [piece]); else members.push(piece)
  }
  const rows = [...groups].map(([key, members]) => ({ key, members }))
  return <BulkClosetSheet {...props} groups={rows} knownTags={paging.summary?.tags ?? []} browsing={{ search, onSearch: setSearch, person, onPerson: setPerson, ...paging, total: paging.summary?.groups }} />
}
