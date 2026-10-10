import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'

import { authClient } from '@/auth-client'
import { authText, resetText } from '@/copy-account'
import { AccountPage, Banner, FooterLink, TextField, focusFirstInvalid, pageDetailClassName } from '@/account/account-page'

const authPaths = new Set(['/sign-in', '/create-account', '/forgot-password'])
const redirectBase = 'https://redirect.invalid'

/**
 * A same-site path to return to after signing in; anything else (another origin, a scheme) is
 * dropped. An auth page is never a destination: a redirect that points at one (a guard that
 * captured /sign-in?redirect=… mid-navigation) unwraps to the innermost real target, if any.
 */
export function safeRedirect(value: unknown): string | undefined {
  let current = value
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'string' || !current.startsWith('/') || current.startsWith('//') || current.includes('\\')) return undefined
    let url: URL
    try { url = new URL(current, redirectBase) } catch { return undefined }
    // Whitespace the parser strips can still turn a path into another host.
    if (url.origin !== redirectBase) return undefined
    let path: string
    try { path = decodeURIComponent(url.pathname).toLowerCase().replace(/\/+$/, '') } catch { return undefined }
    if (!authPaths.has(path)) return current
    current = url.searchParams.get('redirect') ?? undefined
  }
  return undefined
}

export const authSearch = (search: Record<string, unknown>): { redirect?: string } => {
  const redirect = safeRedirect(search.redirect)
  return redirect === undefined ? {} : { redirect }
}

const emailPattern = /^\S+@\S+\.\S+$/

/** A server problem that can be tried again: said plainly, with the retry beside it. */
export function RetryBanner({ message, onRetry, pending }: { message: string; onRetry?: () => void; pending?: boolean }) {
  return <Banner tone="conflict" role="alert" actions={onRetry === undefined ? undefined : [{ label: authText.errors.retry, onClick: onRetry, disabled: pending }]}>{message}</Banner>
}

/** Once a session exists, leaves for where the person was going (or Home). */
function useLeaveWhenSignedIn(redirect: string | undefined, preview = false) {
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const signedIn = session !== null && session !== undefined
  useEffect(() => {
    if (signedIn && !preview) router.history.replace(redirect ?? '/')
  }, [signedIn, redirect, router, preview])
  return signedIn && !preview
}

type AuthFailure = { status?: number; code?: string; message?: string }

function failureMessage(error: AuthFailure, mode: 'sign-in' | 'create'): string {
  if (error.status === 429) return authText.errors.tooManyAttempts
  if (error.code === 'USER_ALREADY_EXISTS' || error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') return authText.errors.emailTaken
  if (error.status === 401 || error.status === 400 || error.code === 'INVALID_EMAIL_OR_PASSWORD') return mode === 'sign-in' ? authText.errors.incorrectCredentials : authText.errors.createFailed
  if (error.status === undefined || error.status === 0 || error.status >= 500) return authText.errors.unreachable
  return mode === 'sign-in' ? authText.errors.incorrectCredentials : authText.errors.createFailed
}

type Fields = { name?: string; email?: string; password?: string }

function validate(mode: 'sign-in' | 'create', values: { name: string; email: string; password: string }): Fields {
  const errors: Fields = {}
  if (mode === 'create' && values.name.trim().length === 0) errors.name = authText.errors.name
  if (!emailPattern.test(values.email.trim())) errors.email = authText.errors.email
  if (mode === 'create' ? values.password.length < 8 : values.password.length === 0) errors.password = mode === 'create' ? authText.errors.passwordShort : authText.errors.passwordMissing
  return errors
}

/** Sign in, or create an account. Two routes (so Back works) sharing one form. */
export function AccountForm({ mode, redirect, visualPreview = false, previewState }: { mode: 'sign-in' | 'create'; redirect?: string; visualPreview?: boolean; previewState?: 'invalid' | 'error' | 'busy' }) {
  const preview = import.meta.env.DEV && visualPreview
  const create = mode === 'create'
  const copy = create ? authText.createAccount : authText.signIn
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Fields>(preview && previewState === 'invalid' ? validate(mode, { name: '', email: '', password: '' }) : {})
  const [banner, setBanner] = useState<string | null>(preview && previewState === 'error' ? authText.errors.unreachable : null)
  const [pending, setPending] = useState(preview && previewState === 'busy')
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  const signedIn = useLeaveWhenSignedIn(redirect, preview)
  const search = redirect === undefined ? undefined : { redirect }

  const run = async (form: HTMLFormElement | null) => {
    if (preview) return
    const found = validate(mode, { name, email, password })
    setErrors(found)
    setBanner(null)
    if (Object.keys(found).length > 0) return focusFirstInvalid(form)
    setPending(true)
    try {
      const result = create
        ? await authClient.signUp.email({ email: email.trim(), password, name: name.trim() })
        : await authClient.signIn.email({ email: email.trim(), password })
      if (result.error) setBanner(failureMessage(result.error, mode))
    } catch {
      setBanner(authText.errors.unreachable)
    } finally {
      setPending(false)
    }
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(event.currentTarget)
  }
  const clear = (field: keyof Fields) => setErrors((current) => ({ ...current, [field]: undefined }))
  const busy = pending || signedIn

  return <AccountPage
    title={copy.title}
    wordmark
    center={!create}
    art={create ? 'register' : 'signin'}
    onSubmit={submit}
    primary={<Button type="submit" disabled={busy || !hydrated}>{busy ? copy.pending : copy.action}</Button>}
    secondary={<>
      {create ? null : <FooterLink render={<Link to="/forgot-password" />}>{authText.signIn.forgot}</FooterLink>}
      <FooterLink render={<Link to={create ? '/sign-in' : '/create-account'} search={search} replace />}>{create ? authText.createAccount.toSignIn : authText.signIn.toCreate}</FooterLink>
    </>}
  >
    {banner === null ? null : <RetryBanner message={banner} pending={busy} onRetry={() => void run(null)} />}
    {create ? <TextField label={authText.fields.name} error={errors.name}>
      {(field) => <Input id={field.id} aria-invalid={field.invalid || undefined} aria-describedby={field.describedBy} disabled={busy || !hydrated} value={name} onChange={(event) => { setName(event.target.value); clear('name') }} autoComplete="name" maxLength={120} />}
    </TextField> : null}
    <TextField label={authText.fields.email} error={errors.email}>
      {(field) => <Input id={field.id} aria-invalid={field.invalid || undefined} aria-describedby={field.describedBy} disabled={busy || !hydrated} type="email" inputMode="email" value={email} onChange={(event) => { setEmail(event.target.value); clear('email') }} autoComplete="email" autoCapitalize="none" spellCheck={false} />}
    </TextField>
    <TextField label={authText.fields.password} error={errors.password}>
      {(field) => <Input id={field.id} aria-invalid={field.invalid || undefined} aria-describedby={field.describedBy} disabled={busy || !hydrated} type="password" placeholder={create ? authText.fields.passwordPlaceholder : undefined} value={password} onChange={(event) => { setPassword(event.target.value); clear('password') }} autoComplete={create ? 'new-password' : 'current-password'} />}
    </TextField>
  </AccountPage>
}

/**
 * What the server can do for a forgotten password. Better Auth's reset needs an email sender on
 * the server, and none is configured for this trial, so the screens stay honest about it instead
 * of pretending a code was sent. When a sender exists, implement this against it.
 */
export type ResetApi = {
  /** Whether this deployment can email a code at all. */
  readonly available: boolean
  sendCode: (email: string) => Promise<void>
  verifyCode: (email: string, code: string) => Promise<void>
  setPassword: (email: string, code: string, password: string) => Promise<void>
}

const unavailable = (): Promise<never> => Promise.reject(new Error(resetText.notSetUp))

export const resetApi: ResetApi = { available: false, sendCode: unavailable, verifyCode: unavailable, setPassword: unavailable }

export type ResetStep = 'email' | 'code' | 'password'
export const resetSearch = (search: Record<string, unknown>): { step?: ResetStep } => (
  search.step === 'code' || search.step === 'password' ? { step: search.step } : {}
)

/** Forgot password in three steps: email, the 6-digit code, then a new password. Other devices are signed out. */
export function ForgotPassword({ step = 'email', api = resetApi, visualPreview = false, previewState }: { step?: ResetStep; api?: ResetApi; visualPreview?: boolean; previewState?: 'invalid' | 'error' | 'busy' }) {
  const preview = import.meta.env.DEV && visualPreview
  const router = useRouter()
  const [email, setEmail] = useState(preview && !(step === 'email' && previewState === 'invalid') ? 'alex@example.com' : '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ email?: string; code?: string; password?: string; confirm?: string }>(preview && previewState === 'invalid'
    ? step === 'email' ? { email: authText.errors.email } : step === 'code' ? { code: resetText.codeShort } : { password: authText.errors.passwordShort }
    : {})
  const [banner, setBanner] = useState<string | null>(preview && previewState === 'error' ? authText.errors.unreachable : null)
  const [pending, setPending] = useState(preview && previewState === 'busy')
  const [done, setDone] = useState(false)

  // A later step without the earlier answers (a reload, a pasted link) starts again at the first.
  const effective: ResetStep = step !== 'email' && email === '' ? 'email' : step
  const go = (next: ResetStep) => void router.navigate({ to: '/forgot-password', search: next === 'email' ? {} : { step: next } })

  const attempt = async (work: () => Promise<void>, next?: ResetStep) => {
    if (preview) return
    setPending(true)
    setBanner(null)
    try {
      await work()
      if (next !== undefined) go(next)
    } catch (error) {
      setBanner(error instanceof Error && error.message === resetText.notSetUp ? resetText.notSetUp : authText.errors.unreachable)
    } finally {
      setPending(false)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    if (effective === 'email') {
      if (!emailPattern.test(email.trim())) { setErrors({ email: authText.errors.email }); return focusFirstInvalid(form) }
      setErrors({})
      void attempt(() => api.sendCode(email.trim()), 'code')
    } else if (effective === 'code') {
      if (!/^\d{6}$/.test(code)) { setErrors({ code: resetText.codeShort }); return focusFirstInvalid(form) }
      setErrors({})
      void attempt(() => api.verifyCode(email.trim(), code), 'password')
    } else {
      const found = { ...(password.length < 8 ? { password: authText.errors.passwordShort } : {}), ...(confirm !== password ? { confirm: authText.errors.passwordMismatch } : {}) }
      setErrors(found)
      if (Object.keys(found).length > 0) return focusFirstInvalid(form)
      void attempt(async () => { await api.setPassword(email.trim(), code, password); setDone(true) })
    }
  }

  if (done) return <AccountPage
    title={resetText.newTitle}
    wordmark
    primary={<Button render={<Link to="/sign-in" replace />}>{authText.signIn.action}</Button>}
  >
    <Banner tone="ready">{resetText.done}</Banner>
  </AccountPage>

  const title = effective === 'email' ? resetText.title : effective === 'code' ? resetText.codeTitle : resetText.newTitle
  const unavailableEmail = effective === 'email' && !api.available
  return <AccountPage
    title={title}
    wordmark
    onBack={effective === 'email' ? undefined : () => go(effective === 'password' ? 'code' : 'email')}
    art={effective === 'email' ? 'signin' : undefined}
    onSubmit={submit}
    primary={unavailableEmail ? <Button render={<Link to="/sign-in" replace />}>{resetText.backToSignIn}</Button> : <Button type="submit" disabled={pending || (effective === 'code' && code.length < 6)}>
      {effective === 'email' ? pending ? resetText.sending : resetText.sendCode : effective === 'code' ? pending ? resetText.checking : resetText.codeContinue : pending ? resetText.saving : resetText.save}
    </Button>}
    secondary={<>
      {effective === 'code' ? <FooterLink type="button" disabled={pending} onClick={() => void attempt(() => api.sendCode(email.trim()))}>{resetText.sendNew}</FooterLink> : null}
      {effective === 'code' || unavailableEmail ? null : <FooterLink render={<Link to="/sign-in" replace />}>{resetText.backToSignIn}</FooterLink>}
    </>}
  >
    {/* Without a sender the screen is only directions: no code promise, no email to type. */}
    {unavailableEmail ? <>
      <Banner tone="waiting" role="note">
        <strong className="block">{resetText.emailUnavailableTitle}</strong>
        {resetText.emailUnavailable}
      </Banner>
      <p className={pageDetailClassName}>{resetText.newAccountEmpty}</p>
    </> : effective === 'password' ? null : <p className={pageDetailClassName}>{effective === 'email' ? resetText.emailDetail : resetText.codeDetail(email)}</p>}
    {banner === null ? null : <RetryBanner message={banner} />}
    {effective === 'email' && !unavailableEmail ? <TextField label={authText.fields.email} error={errors.email}>
      {(field) => <Input id={field.id} aria-invalid={field.invalid || undefined} aria-describedby={field.describedBy} disabled={pending} type="email" inputMode="email" value={email} onChange={(event) => { setEmail(event.target.value); setErrors({}) }} autoComplete="email" autoCapitalize="none" spellCheck={false} />}
    </TextField> : null}
    {effective === 'code' ? <TextField label={resetText.codeLabel} error={errors.code}>
      {(field) => <Input id={field.id} aria-invalid={field.invalid || undefined} aria-describedby={field.describedBy} disabled={pending} inputMode="numeric" autoComplete="one-time-code" placeholder={resetText.codePlaceholder} maxLength={6} value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setErrors({}) }} />}
    </TextField> : null}
    {effective === 'password' ? <>
      <TextField label={authText.fields.passwordNew} error={errors.password}>
        {(field) => <Input id={field.id} aria-invalid={field.invalid || undefined} aria-describedby={field.describedBy} disabled={pending} type="password" autoComplete="new-password" placeholder={authText.fields.passwordPlaceholder} value={password} onChange={(event) => { setPassword(event.target.value); setErrors({}) }} />}
      </TextField>
      <TextField label={authText.fields.passwordConfirm} error={errors.confirm}>
        {(field) => <Input id={field.id} aria-invalid={field.invalid || undefined} aria-describedby={field.describedBy} disabled={pending} type="password" autoComplete="new-password" value={confirm} onChange={(event) => { setConfirm(event.target.value); setErrors({}) }} />}
      </TextField>
      <p className={pageDetailClassName}>{resetText.signedOutElsewhere}</p>
    </> : null}
  </AccountPage>
}
