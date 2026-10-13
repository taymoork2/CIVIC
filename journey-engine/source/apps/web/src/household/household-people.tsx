import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckboxGroup } from '@base-ui/react/checkbox-group'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useId, useState, type ReactNode } from 'react'

import { RecordRow } from '@/kit/record-row'
import { ConfirmRow, FactsCard, RowSection, SheetText } from '@/household/household-blocks'
import { api } from '@/api'
import type { CurrentHousehold } from '@/account/account'
import type { Id } from '@convex/_generated/dataModel'
import { IngredientTagsEditor } from '@/household/ingredient-tags'
import { householdText, wearerKindWords } from '@/copy'
import { peopleCopy } from '@/copy-household'
import { AddRow } from '@/household/household-tiles'
import { InviteFlow, invitablePeople, type PendingInvite } from '@/household/household-invite'
import type { Inventory } from '@/household/inventory-types'
import { Sheet } from '@/kit/sheet'
import { Choices, ErrorNotice, Field, Loading, useConvexCall } from '@/kit/ui'
import { DesignIcon } from '@/kit/design-icons'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Wearer = Inventory['wearers'][number]
type Member = FunctionReturnType<typeof api.households.members>[number]

/** A list with its heading, or the heading and a loading state until the list is known. */
function PeopleList({ heading, what, ready, children }: { heading: string; what: string; ready: boolean; children: ReactNode }) {
  return ready
    ? <RowSection heading={heading}>{children}</RowSection>
    : <section className="grid gap-3"><h2 className="px-1 text-[length:var(--step-2)] font-semibold">{heading}</h2><Loading what={what} /></section>
}

/**
 * People: who can sign in (household access) and who clothes belong to (clothing profiles) are
 * separate records shown together when linked. Removing access keeps the clothes. Inviting gives
 * someone an account; a clothing profile needs none.
 */
export function Members({ household, wearers, supplies = [] }: { household: CurrentHousehold; wearers: Inventory['wearers'] | null; supplies?: Inventory['supplies'] }) {
  const members = useQuery(api.households.members, { householdId: household.householdId })
  const invites = useQuery(api.households.pendingInvites, { householdId: household.householdId })
  const remove = useConvexCall(api.households.removeMember)
  // 'choose' asks who the invite is for; a person makes their link straight away.
  const [inviting, setInviting] = useState<Wearer | PendingInvite | 'choose' | null>(null)
  const [editing, setEditing] = useState<Wearer | 'new' | null>(null)
  const [memberEditing, setMemberEditing] = useState<Member | null>(null)
  const [removing, setRemoving] = useState<NonNullable<typeof members>[number] | null>(null)
  const linkable = editing !== null && editing !== 'new' && household.role === 'owner'
    && invitablePeople([editing]).length === 1 && invites !== undefined
    && !invites.some((invite) => invite.wearerId === editing.wearerId) ? editing : null
  const memberWearer = wearers?.find((wearer) => wearer.wearerId === memberEditing?.wearerId && wearer.principalKey !== null)
  const accessAction = memberEditing !== null && ((household.role === 'owner' && !memberEditing.isYou) || (memberEditing.isYou && memberEditing.role !== 'owner'))
    ? () => { setMemberEditing(null); remove.clearError(); setRemoving(memberEditing) } : undefined
  const accessLabel = memberEditing?.isYou ? 'Leave household' : 'Remove access'

  return (
    <MembersView role={household.role} members={members ?? null} wearers={wearers} invites={invites ?? null}
      onInvite={setInviting} onEdit={setEditing} onEditMember={setMemberEditing}>
      {editing === null ? null : <WearerSheet householdId={household.householdId} wearer={editing === 'new' ? null : wearers?.find((person) => person.wearerId === editing.wearerId) ?? editing} supplies={supplies} canRemove={household.role === 'owner'} onClose={() => setEditing(null)} onLinkAccount={linkable === null ? undefined : () => { setEditing(null); setInviting(linkable) }} />}
      {memberEditing === null ? null : memberWearer === undefined
        ? <Sheet title={memberEditing.displayName ?? householdText.someone} onClose={() => setMemberEditing(null)} closeAtTop>
          <SheetText>{peopleCopy.memberRole}</SheetText>
          {accessAction === undefined ? null : <Button variant="outline" onClick={accessAction}>{accessLabel}</Button>}
        </Sheet>
        : <WearerSheet key={memberWearer.wearerId} householdId={household.householdId} wearer={memberWearer} supplies={supplies} canRemove={false} onClose={() => setMemberEditing(null)} onAccessAction={accessAction} accessLabel={accessLabel} />}
      {inviting === null || wearers === null ? null : <InviteFlow householdId={household.householdId} householdName={household.name} wearers={wearers}
        person={inviting === 'choose' || 'inviteId' in inviting ? undefined : inviting} invitation={inviting !== 'choose' && 'inviteId' in inviting ? inviting : undefined} onClose={() => setInviting(null)} />}
      {removing === null ? null : <Sheet title={removing.isYou ? 'Leave this household?' : `Remove ${removing.displayName ?? householdText.thisPerson}?`} closeAtTop compactActions onClose={() => setRemoving(null)} footer={<><Button variant="outline" disabled={remove.pending} onClick={() => setRemoving(null)}>Cancel</Button><Button variant="destructive" disabled={remove.pending} onClick={async () => {
        if (await remove.run({ membershipId: removing.membershipId }) !== undefined) setRemoving(null)
      }}>{removing.isYou ? 'Leave household' : 'Remove access'}</Button></>}>
        <p className="rounded-control bg-warn-bg p-4 text-warn-ink">{removing.isYou ? 'You will lose access to this household.' : 'They will lose access to this household immediately.'}</p>
        <p className="text-ink-2">Clothing profiles, clothes and laundry history stay here. Private clothes stay protected. An owner can invite them back later.</p>
        <ErrorNotice error={remove.error} />
      </Sheet>}
    </MembersView>
  )
}

/** A linked member opens their clothing profile; managed profiles follow the member list. */
export function MembersView({ role, members, wearers, invites = [], onInvite, onEdit, onEditMember, children }: {
  role: CurrentHousehold['role']; members: readonly Member[] | null; wearers: Inventory['wearers'] | null
  invites?: FunctionReturnType<typeof api.households.pendingInvites> | null
  /** 'choose' asks who the invite is for; a person is invited directly. */
  onInvite: (who: Wearer | PendingInvite | 'choose') => void; onEdit: (wearer: Wearer | 'new') => void; onEditMember: (member: Member) => void; children?: ReactNode
}) {
  const memberWearerIds = new Set(members?.map((member) => member.wearerId).filter((id) => id !== null))
  const profiles = wearers?.filter((wearer) => wearer.principalKey === null || !memberWearerIds.has(wearer.wearerId)) ?? null
  return <>
      <PeopleList heading={peopleCopy.accessTitle} what={householdText.loadingPeople} ready={members !== null}>
        {members?.map((member) => {
          const wearer = wearers?.find((person) => person.wearerId === member.wearerId && person.principalKey !== null)
          return <RecordRow key={member.membershipId} media={<DesignIcon name="me" strokeWidth={1.6} />}
          title={`${member.displayName ?? householdText.someone}${member.isYou ? householdText.youSuffix : ''}`}
          fact={wearer === undefined ? peopleCopy.memberRole : peopleCopy.clothingPreferences}
          mark={member.role === 'owner' ? { tone: 'done', text: peopleCopy.ownerMark } : undefined}
          onOpen={() => onEditMember(member)}
          label={wearer === undefined ? `Open ${member.displayName ?? householdText.someone}. ${peopleCopy.memberRole}` : `Open ${wearer.name}. ${peopleCopy.clothingPreferences}`} />
        })}
        {role === 'owner' ? <RecordRow media={<DesignIcon name="mail" strokeWidth={1.6} />} title={peopleCopy.inviteTitle} fact={peopleCopy.inviteHint} disabled={wearers === null} onOpen={() => onInvite('choose')} label={`${peopleCopy.inviteTitle}. ${peopleCopy.inviteHint}`} /> : null}
      </PeopleList>
      {profiles?.length === 0 ? null : <PeopleList heading={peopleCopy.profilesTitle} what={householdText.loadingPeople} ready={profiles !== null}>
        {profiles?.map((wearer) => {
          const fact = wearer.principalKey !== null && members !== null ? 'Access removed · private clothes stay protected' : wearerKindWords[wearer.kind]
          return <RecordRow key={wearer.wearerId} media={<DesignIcon name="people" strokeWidth={1.6} />}
            title={wearer.name} fact={fact} onOpen={() => onEdit(wearer)} label={`Open ${wearer.name}. ${fact}`} />
        })}
      </PeopleList>}
      <RowSection><AddRow label={peopleCopy.addProfile} hint={peopleCopy.addProfileHint} onClick={() => onEdit('new')} /></RowSection>
      {invites === null || invites.length === 0 ? null : <PeopleList heading={peopleCopy.pendingTitle} what={householdText.loadingPeople} ready>
        {invites.map((invite) => <RecordRow key={invite.inviteId} media={<DesignIcon name="mail" strokeWidth={1.6} />} title={invite.name}
          fact={invite.wearerId === undefined ? peopleCopy.invitePending : `${peopleCopy.invitePending} · Links clothing profile`}
          onOpen={role === 'owner' ? () => onInvite(invite) : undefined} label={peopleCopy.manageInvite(invite.name)} />)}
      </PeopleList>}
      {children}
    </>
}

/** The clothing profile sheet: who the clothes belong to, and what products must meet for their clothes. No reason is asked or stored. */
function WearerSheet({ householdId, wearer, supplies, canRemove, onClose, onLinkAccount, onAccessAction, accessLabel }: { householdId: Id<'households'>; wearer: Wearer | null; supplies: Inventory['supplies']; canRemove: boolean; onClose: () => void; onLinkAccount?: () => void; onAccessAction?: () => void; accessLabel?: string }) {
  const add = useConvexCall(api.inventory.createWearer)
  const update = useConvexCall(api.inventory.updateWearer)
  const remove = useConvexCall(api.inventory.removeWearer)
  const call = wearer === null ? add : update
  return <WearerSheetView wearer={wearer} supplies={supplies} onClose={onClose} onLinkAccount={onLinkAccount} onAccessAction={onAccessAction} accessLabel={accessLabel} onRemove={canRemove && wearer?.principalKey === null ? async () => { remove.clearError(); return await remove.run({ wearerId: wearer.wearerId }) !== undefined } : undefined} pending={call.pending || remove.pending} error={call.error ?? remove.error} onSave={async (draft) => {
    const requirements = { fragranceFree: draft.fragranceFree, dyeFree: draft.dyeFree, avoidIngredients: draft.avoid, acceptedSupplyIds: draft.accepted }
    const saved = wearer === null
      ? await add.run({ householdId, name: draft.name, kind: draft.kind, requirements })
      : await update.run({ wearerId: wearer.wearerId, name: draft.name, kind: draft.kind, requirements })
    return saved !== undefined
  }} />
}

type WearerDraft = { name: string; kind: Wearer['kind']; fragranceFree: boolean; dyeFree: boolean; avoid: string[]; accepted: Id<'supplies'>[] }

type WearerSheetProps = { wearer: Wearer | null; supplies: Inventory['supplies']; onClose: () => void; onRemove?: () => Promise<boolean>; onLinkAccount?: () => void; onAccessAction?: () => void; accessLabel?: string; pending?: boolean; error?: string | null; onSave: (draft: WearerDraft) => Promise<boolean> }

/** Saved profiles open for reading; the existing editor owns all draft and access actions. */
export function WearerSheetView(props: WearerSheetProps) {
  const [editing, setEditing] = useState(false)
  const { wearer, supplies, pending, onClose, onRemove } = props
  if (wearer === null) return <WearerEditorView {...props} />
  const requirements = wearer.requirements
  const needs = [requirements?.fragranceFree ? peopleCopy.fragranceFree : null, requirements?.dyeFree ? peopleCopy.dyeFree : null].filter((need) => need !== null)
  const accepted = supplies.filter((supply) => requirements?.acceptedSupplyIds?.includes(supply.supplyId)).map((supply) => supply.name)
  return <Sheet title={wearer.name} onClose={onClose} closeAtTop compactActions busy={pending}
    onEdit={() => setEditing(true)} editLabel="Edit clothing profile"
    footer={<Button disabled={pending} onClick={onClose}>Done</Button>}>
    <FactsCard rows={[[householdText.person, wearerKindWords[wearer.kind]],
      ...(needs.length === 0 ? [] : [[peopleCopy.requirementsTitle, needs.join(' · ')] as const]),
      ...(requirements?.avoidIngredients?.length ? [['Ingredients to avoid', requirements.avoidIngredients.join(' · ')] as const] : []),
      ...(accepted.length === 0 ? [] : [[peopleCopy.accepted, accepted.join(' · ')] as const]),
    ]} />
    {editing ? <WearerEditorView {...props} onClose={() => setEditing(false)} onRemove={onRemove === undefined ? undefined : async () => { const removed = await onRemove(); if (removed) onClose(); return removed }} /> : null}
  </Sheet>
}

export function WearerEditorView({ wearer, supplies, onClose, onRemove, onLinkAccount, onAccessAction, accessLabel = 'Remove access', pending = false, error = null, onSave }: WearerSheetProps) {
  const saved = wearer?.requirements ?? undefined
  const initial: WearerDraft = {
    name: wearer?.name ?? '',
    kind: wearer?.kind ?? 'child' as Wearer['kind'],
    fragranceFree: saved?.fragranceFree === true,
    dyeFree: saved?.dyeFree === true,
    avoid: saved?.avoidIngredients ?? [],
    accepted: saved?.acceptedSupplyIds ?? [],
  }
  const [draft, setDraft] = useState(initial)
  const [ingredientName, setIngredientName] = useState('')
  const unaddedIngredient = ingredientName.trim().length > 0
  const [removing, setRemoving] = useState(false)
  const [tab, setTab] = useState('person')
  const set = (patch: Partial<typeof initial>) => setDraft((current) => ({ ...current, ...patch }))
  const formId = useId()
  const dirty = unaddedIngredient || JSON.stringify(draft) !== JSON.stringify(initial)
  const products = supplies.filter((supply) => !supply.archived && supply.kind !== 'dispensing_device' && supply.kind !== 'wool_dryer_ball')
  return <Sheet title={removing && wearer !== null ? peopleCopy.removePersonTitle(wearer.name) : wearer === null ? peopleCopy.addProfile : wearer.name} closeAtTop={removing} closeLabel="Cancel" compactActions step={removing ? 'remove' : 'edit'} dirty={!removing && dirty} busy={pending} onClose={removing ? () => setRemoving(false) : onClose}
    footer={removing ? <><Button variant="outline" disabled={pending} onClick={() => setRemoving(false)}>Keep person</Button><Button variant="destructive" disabled={pending} onClick={async () => { if (await onRemove?.()) onClose() }}>{peopleCopy.removePerson}</Button></> : <Button type="submit" form={formId} disabled={pending || unaddedIngredient || draft.name.trim().length === 0 || (wearer !== null && !dirty)}>{householdText.savePerson}</Button>}>
    {removing ? <><SheetText>{peopleCopy.removePersonDetail}</SheetText><ErrorNotice error={error} /></> : <form id={formId} className="grid gap-4" onSubmit={async (event) => {
      event.preventDefault()
      if (pending || unaddedIngredient) return
      if (await onSave(draft)) onClose()
    }}>
      <fieldset disabled={pending} className="m-0 grid min-w-0 gap-4 border-0 p-0">
      <Tabs value={tab} onValueChange={(value) => { if (!pending && value !== null) setTab(String(value)) }}>
      <TabsList aria-label="Profile editor sections"><TabsTrigger value="person" disabled={pending}>Person</TabsTrigger><TabsTrigger value="products" disabled={pending}>Products</TabsTrigger>{onLinkAccount || onAccessAction || onRemove ? <TabsTrigger value="access" disabled={pending}>Access</TabsTrigger> : null}</TabsList>
      <TabsContent value="person" keepMounted>
      <Field label={householdText.name}>{(id) => <Input id={id} value={draft.name} onChange={(event) => set({ name: event.target.value })} required maxLength={60} autoComplete="off" />}</Field>
      <Choices label={householdText.person} options={['adult', 'child', 'baby'] as const} value={draft.kind} onPick={(kind) => set({ kind })} words={(kind) => wearerKindWords[kind]} />
      </TabsContent>
      <TabsContent value="products" keepMounted>
      <CheckboxGroup render={<section />} disabled={pending} className="grid min-w-0 gap-4" aria-labelledby={`${formId}-needs`}>
        <div className="grid gap-1">
          <h3 id={`${formId}-needs`} className="text-[length:var(--step-2)] font-semibold">{peopleCopy.requirementsTitle}</h3>
          <SheetText>{peopleCopy.requirementsDetail}</SheetText>
        </div>
        <div className="grid grid-cols-2 gap-2 [@container_(width_<_20rem)]:grid-cols-1">
          <ConfirmRow checked={draft.fragranceFree} onCheckedChange={(fragranceFree) => set({ fragranceFree })}>{peopleCopy.fragranceFree}</ConfirmRow>
          <ConfirmRow checked={draft.dyeFree} onCheckedChange={(dyeFree) => set({ dyeFree })}>{peopleCopy.dyeFree}</ConfirmRow>
        </div>
        <IngredientTagsEditor values={draft.avoid} onChange={(avoid) => set({ avoid })} inputValue={ingredientName} onInputChange={setIngredientName} />
        <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
          <legend className="mb-1 text-[length:var(--step-1)] font-semibold">{peopleCopy.accepted}</legend>
          {products.length === 0 ? <SheetText>{peopleCopy.noProducts}</SheetText> : null}
          <div className="grid grid-cols-2 gap-2 [@container_(width_<_20rem)]:grid-cols-1">
            {products.map((supply) => <ConfirmRow key={supply.supplyId} checked={draft.accepted.includes(supply.supplyId)} onCheckedChange={(checked) => set({ accepted: checked ? [...draft.accepted, supply.supplyId] : draft.accepted.filter((entry) => entry !== supply.supplyId) })}>{supply.name}</ConfirmRow>)}
          </div>
        </fieldset>
      </CheckboxGroup>
      </TabsContent>
      {onLinkAccount || onAccessAction || onRemove ? <TabsContent value="access" keepMounted>
      <div className="flex flex-wrap gap-2">
        {onLinkAccount === undefined ? null : <Button type="button" variant="outline" disabled={pending || dirty} aria-describedby={dirty ? `${formId}-link` : undefined} onClick={onLinkAccount}>Link account</Button>}
        {onAccessAction === undefined ? null : <Button type="button" variant="outline" disabled={pending || dirty} aria-describedby={dirty ? `${formId}-access` : undefined} onClick={onAccessAction}>{accessLabel}</Button>}
        {onRemove === undefined ? null : <Button type="button" variant="ghost" disabled={pending} onClick={() => setRemoving(true)}>{peopleCopy.removePerson}</Button>}
      </div>
      {onLinkAccount !== undefined && dirty ? <SheetText id={`${formId}-link`}>Save your changes to link an account.</SheetText> : null}
      {onAccessAction !== undefined && dirty ? <SheetText id={`${formId}-access`}>Save your changes before changing household access.</SheetText> : null}
      </TabsContent> : null}
      </Tabs>
      </fieldset>
      {unaddedIngredient ? <SheetText>Finish adding or clear the ingredient in Products before saving.</SheetText> : null}
      <ErrorNotice error={error} />
    </form>}
  </Sheet>
}
