import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Link, useRouter } from '@tanstack/react-router'
import { useConvex, useConvexAuth, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useEffect, useState, type FormEvent } from 'react'

import { api } from '@/api'
import { authClient } from '@/auth-client'
import { joinText } from '@/copy-account'
import { AccountPage, Banner, FieldError, FooterLink, pageDetailClassName } from '@/account/account-page'
import { RetryBanner } from '@/account/auth-pages'
import { formatInviteDate } from '@/account/onboarding-screens'
import { FirstRun } from '@/account/first-run'
import { beginOnboarding, endOnboarding } from '@/account/onboarding-state'
import { HouseholdInvitation } from '@/kit/household-invitation'
import { ErrorNotice, Field, Loading, errorMessage, useConvexCall } from '@/kit/ui'
import { DesignIcon } from '@/kit/design-icons'

type Preview = FunctionReturnType<typeof api.households.invitePreview>
type ValidPreview = Extract<Preview, { status: 'valid' }>
/** `linked` only for an invite made for a person: false when their closet was claimed meanwhile. */
type Joined = { householdId: string; name: string; linked?: boolean }

/** The name to record for the person joining: a real name, never an email address. */
export function knownName(displayName: string | null | undefined): { displayName?: string } {
  const name = displayName?.trim() ?? ''
  return name.length > 0 && !name.includes('@') ? { displayName: name.slice(0, 120) } : {}
}

/** What to tell someone whose code can't be used: expired, already used, or not found. */
export function inviteProblemMessage(preview: Exclude<Preview, ValidPreview>): string {
  if (preview.status === 'expired') return joinText.expired(formatInviteDate(preview.expiresAt))
  if (preview.status === 'used') return joinText.used
  return joinText.unknown
}

const memberCan = [
  { icon: 'closet', text: joinText.can[0] },
  { icon: 'laundry', text: joinText.can[1] },
  { icon: 'washer', text: joinText.can[2] },
] as const

/**
 * Before joining: the household, who invited you, your role and what members can do. Joining
 * starts onboarding, so the celebration is not cut short by Home appearing underneath.
 */
export function InviteConfirm({ code, preview, displayName, via, onJoined, onNotNow, visualPreview = false, previewState }: {
  code: string
  preview: ValidPreview
  displayName: string | null
  via: 'link' | 'code'
  onJoined: (household: Joined) => void
  onNotNow: () => void
  visualPreview?: boolean
  previewState?: 'invalid' | 'error' | 'busy'
}) {
  const join = useConvexCall(api.households.joinWithInvite)
  const visual = import.meta.env.DEV && visualPreview
  const pending = join.pending || (visual && previewState === 'busy')
  const error = visual && previewState === 'error' ? 'We couldn’t join this household. Try again.' : join.error
  const run = async () => {
    if (import.meta.env.DEV && visualPreview) return
    beginOnboarding('joined')
    const joined = await join.run({ code, ...knownName(displayName) })
    if (joined === undefined) endOnboarding()
    else onJoined({ householdId: joined.householdId, name: joined.name, ...(joined.linked === undefined ? {} : { linked: joined.linked }) })
  }
  const title = via === 'link' ? joinText.invitedTitle : joinText.confirmTitle
  return <AccountPage
    title={title}
    center={false}
    onBack={via === 'code' ? onNotNow : undefined}
    focusTitle
    primary={<Button type="button" disabled={pending} aria-label={pending ? undefined : joinText.join(preview.householdName)} onClick={() => void run()}>{pending ? joinText.joining : joinText.joinAction}</Button>}
    secondary={<FooterLink type="button" disabled={pending} onClick={onNotNow}>{joinText.notNow}</FooterLink>}
  >
    <HouseholdInvitation name={preview.householdName}>
      <p className="m-0">{preview.inviterName === null ? null : <>{joinText.invitedBy(preview.inviterName)} · </>}{joinText.expiresInline(formatInviteDate(preview.expiresAt))}</p>
    </HouseholdInvitation>
    {preview.wearerName === null ? null : <p className="m-0 flex min-w-0 items-center gap-2 text-[length:var(--step--1)]"><DesignIcon name="closet" className="flex-none" /><span className="min-w-0 [overflow-wrap:anywhere]">{joinText.linkedProfile(preview.wearerName)}</span></p>}
    <section className="grid min-w-0 gap-3 rounded-card border border-line bg-surface-1 p-[16px]" aria-label={joinText.canTitle}>
      <h2 className="m-0 text-[length:var(--step-1)] font-semibold">{joinText.role}</h2>
      <ul className="m-0 grid list-none gap-2 p-0">
        {memberCan.map(({ icon, text }) => <li key={text} className="flex min-w-0 items-center gap-3 text-[length:var(--step--1)]"><DesignIcon name={icon} className="flex-none text-ink-2" /><span>{text}</span></li>)}
      </ul>
      <p className="m-0 border-t border-line pt-3 text-[length:var(--step--1)] leading-normal text-ink-2">{joinText.ownersOnly}</p>
    </section>
    <ErrorNotice error={error} />
  </AccountPage>
}

/** Joining from first run without a link: type the code, see the preview, then join. First run passes its code draft so Back keeps it. */
export function JoinWithCode({ displayName, initialCode = '', onCodeChange, onBack, onJoined, visualPreview = false, previewState }: {
  displayName: string | null
  initialCode?: string
  onCodeChange?: (code: string) => void
  onBack: () => void
  onJoined: (household: Joined) => void
  visualPreview?: boolean
  previewState?: 'invalid' | 'error' | 'busy'
}) {
  const convex = useConvex()
  const visual = import.meta.env.DEV && visualPreview
  const [code, setCode] = useState(initialCode)
  const [problem, setProblem] = useState<string | null>(visual && previewState === 'invalid' ? joinText.unknown : null)
  const [error, setError] = useState<string | null>(visual && previewState === 'error' ? 'We couldn’t check this invite. Try again.' : null)
  const [checking, setChecking] = useState(visual && previewState === 'busy')
  const [preview, setPreview] = useState<ValidPreview | null>(null)

  const check = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (code.trim().length === 0) return setProblem(joinText.codeMissing)
    setProblem(null)
    if (import.meta.env.DEV && visualPreview) return
    setChecking(true)
    try {
      const found = await convex.query(api.households.invitePreview, { code })
      if (found.status === 'valid') setPreview(found)
      else setProblem(inviteProblemMessage(found))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setChecking(false)
    }
  }

  if (preview !== null) return <InviteConfirm code={code} preview={preview} displayName={displayName} via="code" onJoined={onJoined} onNotNow={() => setPreview(null)} />
  return <AccountPage
    title={joinText.title}
    art="invite"
    onBack={onBack}
    backLabel={joinText.back}
    onSubmit={check}
    focusTitle
    primary={<Button type="submit" disabled={checking || code.trim().length === 0}>{checking ? joinText.checking : joinText.check}</Button>}
  >
    <Field label={joinText.codeLabel}>
      {(id) => <>
        <Input id={id} disabled={checking} value={code} placeholder={joinText.codePlaceholder} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-invalid={problem === null ? undefined : true} aria-describedby={problem === null ? undefined : `${id}-error`}
          onChange={(event) => { const next = event.target.value.toUpperCase(); setCode(next); onCodeChange?.(next); setProblem(null) }} />
        <FieldError id={`${id}-error`} message={problem ?? undefined} />
      </>}
    </Field>
    {error === null ? null : <RetryBanner message={error} />}
  </AccountPage>
}

/** /join/<code>: the link a member shares. Opens to a preview; joining needs an account. */
export function JoinInvite({ code }: { code: string }) {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const status = useQuery(api.households.onboardingStatus, isAuthenticated ? {} : 'skip')
  const preview = useQuery(api.households.invitePreview, isAuthenticated ? { code } : 'skip')
  const [joined, setJoined] = useState<Joined | null>(null)
  // Leaving this page for any reason ends the celebration hold.
  useEffect(() => endOnboarding, [])
  const goHome = () => {
    endOnboarding()
    router.history.push('/')
  }

  // After joining: the celebration, then the same first-run choices the creator gets, minus household setup.
  if (joined !== null) {
    const household = status?.households.find((entry) => entry.householdId === joined.householdId)
    return household === undefined
      ? <Loading what={joinText.loading} startup />
      : <FirstRun displayName={status?.displayName ?? null} household={household} closetTaken={joined.linked === false} />
  }
  if (isPending || (session !== null && (isLoading || (isAuthenticated && (status === undefined || preview === undefined))))) return <Loading what={joinText.loading} startup />
  if (session === null || !isAuthenticated) return <SignedOutInvite code={code} />
  if (status !== undefined && status.households.length > 0) {
    return <InviteLinkNotice problem={null} onHome={goHome} />
  }
  if (preview === undefined) return <Loading what={joinText.loading} startup />
  if (preview.status !== 'valid') {
    return <InviteLinkNotice problem={preview} onHome={goHome} />
  }
  return <InviteConfirm code={code} preview={preview} displayName={status?.displayName ?? session.user.name ?? null} via="link" onJoined={setJoined} onNotNow={goHome} />
}

/** Existing link outcomes; a null problem means the account already belongs to a household. */
export function InviteLinkNotice({ problem, onHome }: { problem: Exclude<Preview, ValidPreview> | null; onHome: () => void }) {
  return <AccountPage title={problem === null ? joinText.alreadyIn : joinText.invalidTitle} art="join" focusTitle primary={<Button type="button" onClick={onHome}>{joinText.goHome}</Button>}>
    {problem === null
      ? <p className={pageDetailClassName}>{joinText.alreadyInDetail}</p>
      : <Banner tone="conflict" role="alert">{inviteProblemMessage(problem)}</Banner>}
  </AccountPage>
}

/** Someone opens an invite link before they have an account: ask them in, then bring them back here. */
export function SignedOutInvite({ code }: { code: string }) {
  const search = { redirect: `/join/${encodeURIComponent(code)}` }
  return <AccountPage
    title={joinText.signedOutTitle}
    art="invite"
    primary={<Button render={<Link to="/create-account" search={search} />}>{joinText.createAccount}</Button>}
    secondary={<FooterLink render={<Link to="/sign-in" search={search} />}>{joinText.signIn}</FooterLink>}
  >
    <p className={pageDetailClassName}>{joinText.signedOutDetail}</p>
  </AccountPage>
}
