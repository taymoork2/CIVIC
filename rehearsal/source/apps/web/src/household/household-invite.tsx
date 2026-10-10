import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useId, useState } from 'react'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { toast } from 'sonner'

import { api } from '@/api'
import type { CurrentHousehold } from '@/account/account'
import { wearerKindWords } from '@/copy'
import { inviteCopy } from '@/copy-household'
import { DesignIcon } from '@/kit/design-icons'
import { SheetText } from '@/household/household-blocks'
import type { Inventory } from '@/household/inventory-types'
import { RecordList, RecordRow } from '@/kit/record-row'
import { Sheet } from '@/kit/sheet'
import { ErrorNotice, Field, useConvexCall } from '@/kit/ui'
import { HouseholdInvitation, invitationSheetClassName } from '@/kit/household-invitation'

type Wearer = Inventory['wearers'][number]
type Person = Pick<Wearer, 'wearerId' | 'name'>
export type PendingInvite = FunctionReturnType<typeof api.households.pendingInvites>[number]
type Target = { name: string; wearerId?: Person['wearerId']; inviteId?: PendingInvite['inviteId'] }
type Invite = { code: string; expiresAt: number }
type MadeInvite = FunctionReturnType<typeof api.households.createInvite>

/** Unlinked profiles eligible for linking; age and guardian consent are not modeled here. */
export function invitablePeople<T extends Pick<Wearer, 'principalKey' | 'kind'>>(wearers: readonly T[]): T[] {
  return wearers.filter((wearer) => wearer.principalKey === null && wearer.kind !== 'baby')
}

/**
 * Raw links stay in this session, keyed by linked profile or independent invitation ID.
 */
export const madeInvites = new Map<string, MadeInvite>()

/** The cached link still requires its matching pending server record before display. */
export function liveInvite(key: string, now = Date.now()): MadeInvite | null {
  const invite = madeInvites.get(key)
  return invite !== undefined && invite.expiresAt > now ? invite : null
}

/** What a joiner opens: this app's `/join/<code>` link, built from where the app is served. */
export function inviteLink(code: string, origin: string): string {
  return `${origin}/join/${code}`
}

/** Copies, and says whether it worked; a failed copy leaves the caller to show the text for selecting. */
async function copyText(text: string, done: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(done)
    return true
  } catch {
    toast.error(inviteCopy.copyFailed)
    return false
  }
}

/**
 * Link-first invite: compact art and context, a copyable fallback code, quiet management actions,
 * then Copy and Share together in the footer. The joiner's preview (household, who invited them, role, what members can
 * do) is what they see when they open the link, so it is not repeated here. The invite itself
 * comes from the existing `households.createInvite`.
 */
type InviteSheetProps = {
  householdName: string
  /** The person whose closet the joiner takes over; absent for an invite without one. */
  personName?: string
  linkedProfile?: boolean
  invite: { code: string; expiresAt: number }
  pending: boolean
  error: string | null
  onNew: () => void
  onClose: () => void
  onCancel?: () => void
  visualPreview?: boolean
}

function useInviteContents({ householdName, personName, linkedProfile = true, invite, pending, error, onNew, onCancel, visualPreview = false }: Omit<InviteSheetProps, 'invite' | 'onClose'> & { invite: Invite | null }) {
  const [showLink, setShowLink] = useState(false)
  if (invite === null) return null
  const link = inviteLink(invite.code, typeof window === 'undefined' ? '' : window.location.origin)
  const expires = new Date(invite.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  const copyCode = async () => {
    if (import.meta.env.DEV && visualPreview) return
    if (!await copyText(invite.code, inviteCopy.codeCopied)) setShowLink(true)
  }
  const copyLink = async () => {
    if (import.meta.env.DEV && visualPreview) return
    if (!await copyText(link, inviteCopy.linkCopied)) setShowLink(true)
  }
  const share = async () => {
    if (import.meta.env.DEV && visualPreview) return
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: inviteCopy.shareTitle(householdName), url: link })
        return
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
      }
    }
    await copyLink()
  }
  return {
    footer: <>
      <Button type="button" variant="outline" disabled={pending} onClick={() => void copyLink()}>{inviteCopy.copyLink}</Button>
      <Button type="button" disabled={pending} aria-label={inviteCopy.shareLink} onClick={() => void share()}>{inviteCopy.share}</Button>
    </>,
    children: <>
      <HouseholdInvitation name={householdName}>
        <p className="m-0">{linkedProfile && personName !== undefined ? inviteCopy.introFor(personName) : inviteCopy.memberInvitation}</p>
        <p className="m-0">{inviteCopy.expires} {expires}</p>
      </HouseholdInvitation>
      <Button type="button" variant="ghost" disabled={pending} aria-label={`${inviteCopy.codeFact} ${invite.code}`} onClick={() => void copyCode()} className="h-auto min-h-14 justify-between gap-3 rounded-none border-b border-line px-0 py-2 text-start">
        <span className="grid min-w-0 gap-0.5">
          <span className="text-[length:var(--step--1)] font-normal text-ink-2">{inviteCopy.codeLabel}</span>
          <span className="break-all font-semibold">{invite.code}</span>
        </span>
        <span className="flex-none text-link">{inviteCopy.copy}</span>
      </Button>
      {showLink ? <Input aria-label={inviteCopy.linkLabel} readOnly value={link} onFocus={(event) => event.currentTarget.select()} /> : null}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onNew}>{inviteCopy.another}</Button>
        {onCancel === undefined ? null : <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>{inviteCopy.cancel}</Button>}
      </div>
      <ErrorNotice error={error} />
    </>,
  }
}

export function InviteSheet(props: InviteSheetProps) {
  const contents = useInviteContents(props)
  return <Sheet className={invitationSheetClassName} title={props.personName === undefined ? inviteCopy.title : inviteCopy.titleFor(props.personName)} closeAtTop compactActions onClose={props.onClose} {...contents} />
}

/** Invitations create no profile; linking an existing profile is an explicit separate choice. */
export function InviteFlow({ householdId, householdName, wearers, person, invitation, onClose }: {
  householdId: CurrentHousehold['householdId']
  householdName: string
  wearers: readonly Wearer[]
  person?: Person
  invitation?: PendingInvite
  onClose: () => void
}) {
  const make = useConvexCall(api.households.createInvite)
  const cancel = useConvexCall(api.households.cancelInvite)
  const invites = useQuery(api.households.pendingInvites, { householdId })
  const people = invitablePeople(wearers)
  const [step, setStep] = useState<'who' | 'name'>(people.length === 0 ? 'name' : 'who')
  const [chosen, setChosen] = useState<Target | null>(invitation ?? person ?? null)
  const [invite, setInvite] = useState<MadeInvite | null>(invitation !== undefined ? liveInvite(invitation.wearerId ?? invitation.inviteId) : person === undefined ? null : liveInvite(person.wearerId))
  const [name, setName] = useState('')
  const [confirming, setConfirming] = useState<'cancel' | 'replace' | null>(null)
  const formId = useId()
  const create = async (target: Target) => {
    const existing = target.inviteId ?? invites?.find((entry) => target.wearerId !== undefined && entry.wearerId === target.wearerId)?.inviteId
    const created = await make.run(existing === undefined
      ? { householdId, ...(target.wearerId === undefined ? { name: target.name } : { wearerId: target.wearerId }) }
      : { householdId, replacesInviteId: existing })
    if (created === undefined) return
    if (target.inviteId !== undefined) madeInvites.delete(target.wearerId ?? target.inviteId)
    madeInvites.set(target.wearerId ?? created.inviteId, created)
    setChosen({ ...target, inviteId: created.inviteId })
    setInvite(created)
    return created
  }
  // Opening someone shows their unused link; a new one, which stops the old one, takes a tap.
  const open = (target: Person) => {
    setChosen(target)
    setInvite(liveInvite(target.wearerId))
  }
  const pending = make.pending || cancel.pending
  const pendingInvite = chosen === null ? undefined : invites?.find((entry) => chosen.inviteId !== undefined ? entry.inviteId === chosen.inviteId : chosen.wearerId !== undefined && entry.wearerId === chosen.wearerId)
  const currentInvite = invite !== null && pendingInvite?.inviteId === invite.inviteId && pendingInvite.expiresAt === invite.expiresAt ? invite : null
  const confirm = () => { cancel.clearError(); setConfirming('cancel') }
  const replace = () => { make.clearError(); setConfirming('replace') }
  const contents = useInviteContents({ householdName, personName: chosen?.name, linkedProfile: chosen?.wearerId !== undefined, invite: currentInvite, pending, error: make.error, onNew: replace, onCancel: confirm })

  // Keep one drawer mounted so advancing never interrupts its focus or scroll-lock lifecycle.
  if (confirming !== null && chosen !== null && pendingInvite !== undefined) return <Sheet title={confirming === 'cancel' ? inviteCopy.cancelTitle : inviteCopy.replaceTitle} kicker={householdName} closeAtTop compactActions busy={pending} step="confirm" onClose={() => setConfirming(null)}
    footer={<><Button variant="outline" disabled={pending} onClick={() => setConfirming(null)}>{confirming === 'cancel' ? inviteCopy.keep : inviteCopy.keepLink}</Button><Button variant={confirming === 'cancel' ? 'destructive' : 'default'} disabled={pending} onClick={async () => {
      if (confirming === 'replace') {
        if (await create(chosen) !== undefined) setConfirming(null)
        return
      }
      if (await cancel.run({ inviteId: pendingInvite.inviteId }) === undefined) return
      madeInvites.delete(chosen.wearerId ?? pendingInvite.inviteId)
      onClose()
    }}>{confirming === 'cancel' ? inviteCopy.cancel : inviteCopy.another}</Button></>}>
    <SheetText>{confirming === 'cancel' ? inviteCopy.cancelDetail : inviteCopy.anotherNote}</SheetText>
    <ErrorNotice error={confirming === 'cancel' ? cancel.error : make.error} />
  </Sheet>
  if (currentInvite !== null && chosen !== null) return <Sheet className={invitationSheetClassName} title={inviteCopy.titleFor(chosen.name)} closeAtTop compactActions step="link" onClose={onClose} {...contents} />
  if (chosen !== null) return <Sheet className={invitationSheetClassName} title={inviteCopy.titleFor(chosen.name)} closeAtTop busy={make.pending} step="person" onClose={onClose}
    footer={<Button type="button" disabled={pending || invites === undefined} onClick={() => { if (pendingInvite === undefined) void create(chosen); else replace() }}>{make.pending ? inviteCopy.making : inviteCopy.makeLink}</Button>}>
    <HouseholdInvitation name={householdName}>
      <p className="m-0">{pendingInvite !== undefined ? inviteCopy.pending : chosen.wearerId === undefined ? inviteCopy.memberInvitation : inviteCopy.introFor(chosen.name)}</p>
      {pendingInvite === undefined ? null : <p className="m-0">{inviteCopy.expires} {new Date(pendingInvite.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>}
    </HouseholdInvitation>
    {pendingInvite === undefined ? null : <SheetText>{inviteCopy.unavailableLink}</SheetText>}
    {pendingInvite === undefined ? null : <Button type="button" variant="outline" disabled={pending} onClick={confirm}>{inviteCopy.cancel}</Button>}
    <ErrorNotice error={make.error} />
  </Sheet>
  if (step === 'name') {
    return <Sheet title={inviteCopy.nameTitle} kicker={householdName} closeAtTop busy={pending} step="name" onClose={onClose} onBack={people.length === 0 ? undefined : () => setStep('who')}
      footer={<Button type="submit" form={formId} disabled={pending || name.trim().length === 0}>{pending ? inviteCopy.making : inviteCopy.makeLink}</Button>}>
      <form id={formId} className="grid gap-4" onSubmit={async (event) => {
        event.preventDefault()
        await create({ name: name.trim() })
      }}>
        <Field label={inviteCopy.nameLabel}>{(id) => <Input id={id} value={name} disabled={pending} required maxLength={60} autoComplete="off" onChange={(event) => setName(event.target.value)} />}</Field>
        <SheetText>{inviteCopy.someoneNewHint}</SheetText>
        <ErrorNotice error={make.error} />
      </form>
    </Sheet>
  }
  return <Sheet title={inviteCopy.whoTitle} kicker={householdName} closeAtTop step="who" onClose={onClose}>
    <RecordList>
      {people.map((wearer) => <RecordRow key={wearer.wearerId} media={<DesignIcon name="people" strokeWidth={1.6} />} title={wearer.name} fact={wearerKindWords[wearer.kind]} disabled={pending} onOpen={() => open(wearer)} />)}
      <RecordRow media={<DesignIcon name="plus" strokeWidth={1.6} />} title={inviteCopy.someoneNew} fact={inviteCopy.someoneNewHint} disabled={pending} onOpen={() => setStep('name')} />
    </RecordList>
  </Sheet>
}
