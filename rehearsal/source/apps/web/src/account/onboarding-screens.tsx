import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RadioGroup } from '@/components/ui/radio-group'
import { useQuery } from 'convex/react'
import { toast } from 'sonner'
import { useState, type FormEvent, type ReactNode } from 'react'

import type { CurrentHousehold } from '@/account/account'
import { AccountPage, Banner, FooterLink, pageDetailClassName } from '@/account/account-page'
import { api } from '@/api'
import { CompletionMark } from '@/kit/completion-mark'
import { onboardingText } from '@/copy-account'
import { saveWashPlace, type WashPlace } from '@/private-state'
import { RecordList, RecordRow } from '@/kit/record-row'
import { Sheet } from '@/kit/sheet'
import { ErrorNotice, Field, useConvexCall } from '@/kit/ui'
import { WelcomeArt } from '@/kit/welcome-art'
import { DesignIcon, type DesignIconName } from '@/kit/design-icons'
import { ChoiceCard } from '@/laundry/question-parts'
import { MachineSheet, machineGroups, washPlace } from '@/household/machine-sheet'
import { InviteFlow } from '@/household/household-invite'
import { BottleSheet } from '@/products/bottle-sheet'
import { finishOnboardingCelebration } from '@/account/onboarding-state'

/** A date for the person reading it, in their own locale ("Oct 8"). */
export function formatInviteDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Step 1: create a household or join one. */
export function ChooseScreen({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  const text = onboardingText.household
  return <AccountPage title={text.title} art="household" focusTitle>
    <RecordList>
      <RecordRow media={<DesignIcon name="home" strokeWidth={1.6} />} title={text.create} fact={text.createHint} onOpen={onCreate} />
      <RecordRow media={<DesignIcon name="key" strokeWidth={1.6} />} title={text.join} fact={text.joinHint} onOpen={onJoin} />
    </RecordList>
  </AccountPage>
}

/** Step 1, create: name the household. Create stays off until there is a name. First run owns the draft. */
export function NameScreen({ value: name, onChange, pending, error, onSubmit, onBack }: {
  value: string
  onChange: (name: string) => void
  pending: boolean
  error: string | null
  onSubmit: (name: string) => void
  onBack: () => void
}) {
  const text = onboardingText.name
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim().length > 0) onSubmit(name.trim())
  }
  return <AccountPage
    title={text.title}
    art="name"
    onBack={onBack}
    backLabel={text.back}
    onSubmit={submit}
    focusTitle
    primary={<Button type="submit" disabled={pending || name.trim().length === 0}>{pending ? text.pending : text.action}</Button>}
  >
    <Field label={text.label}>
      {(id) => <Input id={id} disabled={pending} value={name} placeholder={text.placeholder} maxLength={120} autoComplete="off" onChange={(event) => onChange(event.target.value)} />}
    </Field>
    <ErrorNotice error={error} />
  </AccountPage>
}

/** The one-time celebration, for a household just created or just joined. */
export function CelebrationScreen({ kind, householdName, onPrimary, primaryLabel, note }: {
  kind: 'created' | 'joined'
  householdName: string
  /** Said once, plainly, under the detail: e.g. the closet in the invite was already claimed. */
  note?: string
  onPrimary: () => void
  primaryLabel?: string
}) {
  const text = onboardingText.celebrate
  const created = kind === 'created'
  return <AccountPage
    title={created ? text.createdTitle : text.joinedTitle}
    sub={created ? text.createdKicker(householdName) : text.joinedKicker(householdName)}
    subRole="status"
    focusTitle
    primary={<Button type="button" onClick={onPrimary}>{primaryLabel ?? (created ? text.setUp : text.goHome)}</Button>}
  >
    <WelcomeArt view="welcome" faded>
      <CompletionMark className="pointer-events-none absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2" />
    </WelcomeArt>
    {created ? <p className={pageDetailClassName}>{text.createdDetail}</p> : null}
    {note === undefined ? null : <Banner tone="waiting" role="note">{note}</Banner>}
  </AccountPage>
}

/** Optional next steps after household setup; joiners and people leaving invites see only Add clothes. */
export function NextStepsScreen({ onClothes, onSkip, onInvite, pending = false, error = null }: {
  onClothes: () => void; onSkip: () => void; onInvite?: () => void
  pending?: boolean; error?: string | null
}) {
  const text = onboardingText.next
  return <AccountPage title={onInvite === undefined ? text.clothesTitle : text.title} art="setup" focusTitle
    primary={<FooterLink type="button" disabled={pending} onClick={onSkip}>{text.skip}</FooterLink>}>
    <RecordList>
      <RecordRow media={<DesignIcon name="tee" strokeWidth={1.6} />} title={text.clothes} fact={text.clothesHint} onOpen={onClothes} disabled={pending} />
      {onInvite === undefined ? null : <RecordRow media={<DesignIcon name="mail" strokeWidth={1.6} />} title={text.invite} fact={text.inviteHint} onOpen={onInvite} disabled={pending} />}
    </RecordList>
    <ErrorNotice error={error} />
  </AccountPage>
}

type SetupHousehold = Pick<CurrentHousehold, 'householdId' | 'name' | 'washPlace'>

/** The setup page, shared by first run and the development-only visual sample. */
export function SetupScreen({ place, machines, products, onWhere, onMachines, onProducts, onDone, created = false, pending = false, children }: {
  place: WashPlace | null
  machines: readonly { name: string; location: string | null }[]
  products: number
  onWhere: () => void
  onMachines: () => void
  onProducts: () => void
  onDone: () => void
  created?: boolean
  pending?: boolean
  children?: ReactNode
}) {
  const text = onboardingText.setup
  const home = machines.filter((machine) => machine.location === 'home')
  return <AccountPage title={text.title} sub={created ? onboardingText.celebrate.createdTitle : undefined} subRole={created ? 'status' : undefined} art="setup" focusTitle
    primary={<Button type="button" disabled={pending} onClick={onDone}>{text.done}</Button>}
  >
    <p className={pageDetailClassName}>{text.detail}</p>
    <RecordList>
      <RecordRow media={<DesignIcon name="pin" strokeWidth={1.6} />} title={text.where} fact={place === null ? text.whereNotSet : text.washPlaces[place]} onOpen={onWhere} />
      <RecordRow media={<DesignIcon name="washer" strokeWidth={1.6} />} title={place === 'home' ? text.appliances : 'Machines'} fact={place === 'home' ? home.length > 0 ? `${home.map((machine) => machine.name).join(' + ')} · add details anytime` : 'Most homes have one of each' : machines.length > 0 ? `${machines.length} recorded` : 'Added as you use them, by their labels'} mark={(place === 'home' ? home : machines).length > 0 ? { tone: 'done' } : undefined} onOpen={onMachines} />
      <RecordRow media={<DesignIcon name="bottle" strokeWidth={1.6} />} title={text.products} fact={`${products} saved`} mark={products > 0 ? { tone: 'done' } : undefined} onOpen={onProducts} />
    </RecordList>
    {children}
  </AccountPage>
}

/**
 * Optional household setup, followed by clothes or invite choices. Editors return to the
 * checklist; leaving the invite offers Add clothes. Nothing is recorded until an editor saves.
 */
export function SetupFlow({ household, onDone, onClothes, created = false, pending = false, error = null }: {
  household: SetupHousehold
  onDone: () => void
  onClothes: () => void
  created?: boolean
  pending?: boolean
  error?: string | null
}) {
  const text = onboardingText.setup
  const [view, setView] = useState<'setup' | 'next' | 'invite' | 'closet'>('setup')
  const [choosing, setChoosing] = useState(false)
  const [place, setPlace] = useState<WashPlace | null>(household.washPlace)
  const save = useConvexCall(api.households.setWashPlace)
  const inventory = useQuery(api.inventory.list, { householdId: household.householdId })
  const [adding, setAdding] = useState<'machine' | 'product' | null>(null)
  const [machineId, setMachineId] = useState<string | null>(null)
  const current = place
  const machines = inventory?.machines.filter((machine) => !machine.archived) ?? []
  const home = machines.filter((machine) => machine.location === 'home')

  const choose = async (next: WashPlace) => {
    const before = place
    setPlace(next)
    const saved = await save.run({ householdId: household.householdId, washPlace: next })
    if (saved === undefined) setPlace(before)
    else { saveWashPlace(household.householdId, next); setChoosing(false) }
  }
  const supplies = inventory?.supplies.filter((supply) => !supply.archived) ?? []
  if (view !== 'setup') return <>
    <NextStepsScreen onClothes={onClothes} onSkip={onDone} pending={pending || inventory === undefined} error={error} onInvite={view === 'closet' ? undefined : () => setView('invite')} />
    {view === 'invite' && inventory !== undefined ? <InviteFlow householdId={household.householdId} householdName={household.name} wearers={inventory.wearers} onClose={() => setView('closet')} /> : null}
  </>
  return <SetupScreen place={current} machines={machines} products={supplies.length} created={created}
    onWhere={() => setChoosing(true)}
    onMachines={() => { if (current === 'home' && home.length > 0) setMachineId(home[0]!.machineId); else setAdding('machine') }}
    onProducts={() => setAdding('product')} onDone={() => { finishOnboardingCelebration(); setView('next') }} pending={pending}
  >
    <ErrorNotice error={error} />
    {choosing ? <Sheet title={text.where} onClose={() => setChoosing(false)}>
      <RadioGroup aria-label={text.where} value={current ?? ''} onValueChange={(value) => void choose(value as WashPlace)}>
        {(['shared', 'home', 'laundromat', ...(current === 'both' ? ['both' as const] : [])] as const).map((value) => <ChoiceCard key={value} value={value} title={text.washPlaces[value]} lead={<DesignIcon name={washPlaceIcon[value]} size={24} />} disabled={save.pending} />)}
      </RadioGroup>
      <ErrorNotice error={save.error} />
    </Sheet> : null}
    {adding === 'machine' || machineId !== null ? <MachineSheet householdId={household.householdId} group={machineId === null ? null : machineGroups(machines).find((group) => group.machines.some((machine) => machine.machineId === machineId))} place={washPlace(household.householdId, current)} onClose={() => { setAdding(null); setMachineId(null) }} onSaved={toast.success} /> : null}
    {adding === 'product' ? <BottleSheet householdId={household.householdId} supplies={supplies} onClose={() => setAdding(null)} onSaved={toast.success} /> : null}
  </SetupScreen>
}

const washPlaceIcon = { home: 'home', shared: 'people', laundromat: 'washer', both: 'home' } as const satisfies Record<WashPlace, DesignIconName>
