import { useNavigate } from '@tanstack/react-router'
import { useId, useState, type FormEvent, type ReactNode } from 'react'

import { deleteAccount, signOut } from '@/account/account'
import { TextField, focusFirstInvalid, pageDetailClassName } from '@/account/account-page'
import { authClient } from '@/auth-client'
import { settingsText } from '@/copy'
import { accountSheetText, authText, passwordText } from '@/copy-account'
import { RecordList, RecordRow } from '@/kit/record-row'
import { Sheet } from '@/kit/sheet'
import { ErrorNotice, Field } from '@/kit/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DesignIcon } from '@/kit/design-icons'
import { TaskHeading } from '@/laundry/laundry-ui'

type AccountSheet = 'email' | 'password' | 'signout' | 'delete'

export function AccountSettingsPage({ email, back }: { email: string | null; back: ReactNode }) {
  const [sheet, setSheet] = useState<AccountSheet | null>(null)
  const close = () => setSheet(null)
  return <AccountSettingsView email={email} back={back} onOpen={setSheet}>
    {sheet === 'email' ? <ChangeEmailSheet current={email} onClose={close} /> : null}
    {sheet === 'password' ? <ChangePasswordSheet changePassword={authClient.changePassword} onClose={close} /> : null}
    {sheet === 'signout' ? <SignOutSheet onClose={close} /> : null}
    {sheet === 'delete' ? <DeleteSheet onClose={close} /> : null}
  </AccountSettingsView>
}

export function AccountSettingsView({ email, back, onOpen, children }: {
  email: string | null
  back: ReactNode
  onOpen: (sheet: AccountSheet) => void
  children?: ReactNode
}) {
  return <div className="grid gap-5 w-full pb-8">
    <TaskHeading title={accountSheetText.account} back={back} />
    <RecordList>
      <RecordRow media={<DesignIcon name="mail" strokeWidth={1.6} />} title={accountSheetText.email} fact={email ?? accountSheetText.changeEmailHint} onOpen={() => onOpen('email')} />
      <RecordRow media={<DesignIcon name="key" strokeWidth={1.6} />} title={passwordText.title} fact={accountSheetText.changePasswordHint} onOpen={() => onOpen('password')} />
      <RecordRow media={<DesignIcon name="signout" strokeWidth={1.6} />} title={settingsText.signOut} onOpen={() => onOpen('signout')} />
      <RecordRow media={<DesignIcon name="trash" strokeWidth={1.6} />} title={settingsText.deleteAccount} fact={accountSheetText.deleteHint} onOpen={() => onOpen('delete')} />
    </RecordList>
    {children}
  </div>
}

/** Change the sign-in email. No email is sent in this trial, so an unverified address changes straight away. */
function ChangeEmailSheet({ current, onClose }: { current: string | null; onClose: () => void }) {
  const formId = useId()
  const [next, setNext] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = next.trim().toLowerCase()
    const found = !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? authText.errors.email : email === (current ?? '').toLowerCase() ? accountSheetText.sameEmail : null
    setProblem(found)
    setBanner(null)
    if (found !== null) return focusFirstInvalid(event.currentTarget)
    setPending(true)
    try {
      const result = await authClient.changeEmail({ newEmail: email })
      if (result.error) setBanner(result.error.status === 429 ? authText.errors.tooManyAttempts : result.error.status === 422 || result.error.status === 400 ? accountSheetText.emailTaken : accountSheetText.emailFailed)
      else { setSaved(email); setNext('') }
    } catch {
      setBanner(authText.errors.unreachable)
    } finally {
      setPending(false)
    }
  }
  return <Sheet title={accountSheetText.changeEmail} dirty={saved === null && next !== ''} onClose={onClose}
    footer={saved !== null
      ? <Button type="button" onClick={onClose}>{accountSheetText.done}</Button>
      : <Button type="submit" form={formId} disabled={pending}>{pending ? accountSheetText.emailSaving : accountSheetText.emailSave}</Button>}>
    <form id={formId} className="grid gap-4" onSubmit={(event) => void submit(event)} noValidate>
      <p className={pageDetailClassName}>{saved === null ? accountSheetText.changeEmailDetail : accountSheetText.emailSaved(saved)}</p>
      {saved === null ? <TextField label={accountSheetText.newEmail} error={problem ?? undefined}>{(field) => <Input id={field.id} type="email" autoComplete="email" inputMode="email" value={next}
        aria-invalid={field.invalid ? true : undefined} aria-describedby={field.describedBy} onChange={(event) => { setNext(event.target.value); setProblem(null) }} />}</TextField> : null}
      <ErrorNotice error={banner} />
    </form>
  </Sheet>
}

export type PasswordVisualState = 'invalid' | 'error' | 'busy' | 'saved'

export function ChangePasswordSheet({ changePassword, onClose, visualState }: { changePassword: typeof authClient.changePassword; onClose: () => void; visualState?: PasswordVisualState }) {
  const preview = import.meta.env.DEV ? visualState : undefined
  const formId = useId()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>(preview === 'invalid' ? { current: authText.errors.passwordCurrentMissing, next: authText.errors.passwordShort, confirm: authText.errors.passwordMismatch } : {})
  const [banner, setBanner] = useState<string | null>(preview === 'error' ? authText.errors.unreachable : null)
  const [saved, setSaved] = useState(preview === 'saved')
  const [pending, setPending] = useState(preview === 'busy')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (preview !== undefined) return
    const form = event.currentTarget
    const found = {
      ...(current.length === 0 ? { current: authText.errors.passwordCurrentMissing } : {}),
      ...(next.length < 8 ? { next: authText.errors.passwordShort } : {}),
      ...(confirm !== next ? { confirm: authText.errors.passwordMismatch } : {}),
    }
    setErrors(found)
    setBanner(null)
    setSaved(false)
    if (Object.keys(found).length > 0) return focusFirstInvalid(form)
    setPending(true)
    try {
      const result = await changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true })
      if (result.error) setBanner(result.error.status === 429 ? authText.errors.tooManyAttempts : passwordText.failed)
      else { setSaved(true); setCurrent(''); setNext(''); setConfirm('') }
    } catch {
      setBanner(authText.errors.unreachable)
    } finally {
      setPending(false)
    }
  }
  const clear = () => setErrors({})
  const invalid = (message: string | undefined) => message === undefined ? undefined : true
  const dirty = !saved && (preview === 'invalid' || current !== '' || next !== '' || confirm !== '')
  return <Sheet title={passwordText.title} dirty={dirty} onClose={onClose} closeAtTop
    footer={saved
      ? <Button type="button" onClick={onClose}>{accountSheetText.done}</Button>
      : <Button type="submit" form={formId} disabled={pending || current.length === 0 || next.length < 8 || confirm !== next}>{pending ? passwordText.saving : passwordText.save}</Button>}>
    <form id={formId} className="grid gap-4" onSubmit={(event) => void submit(event)} noValidate>
      {!saved ? <>
        <TextField label={authText.fields.passwordCurrent} error={errors.current}>{(field) => <Input id={field.id} type="password" value={current} disabled={pending} readOnly={preview !== undefined} onChange={(event) => { setCurrent(event.target.value); clear() }} autoComplete="current-password" aria-invalid={invalid(errors.current)} aria-describedby={field.describedBy} />}</TextField>
        <TextField label={authText.fields.passwordNew} error={errors.next}>{(field) => <Input id={field.id} type="password" value={next} disabled={pending} readOnly={preview !== undefined} placeholder={authText.fields.passwordPlaceholder} onChange={(event) => { setNext(event.target.value); clear() }} autoComplete="new-password" aria-invalid={invalid(errors.next)} aria-describedby={field.describedBy} />}</TextField>
        <TextField label={authText.fields.passwordConfirm} error={errors.confirm}>{(field) => <Input id={field.id} type="password" value={confirm} disabled={pending} readOnly={preview !== undefined} onChange={(event) => { setConfirm(event.target.value); clear() }} autoComplete="new-password" aria-invalid={invalid(errors.confirm)} aria-describedby={field.describedBy} />}</TextField>
      </> : null}
      {!saved ? <p className={pageDetailClassName}>{passwordText.detail}</p> : null}
      <ErrorNotice error={banner} />
      {saved ? <p role="status" className="m-0 text-[length:var(--step-0)] font-semibold text-ready-ink">{passwordText.saved}</p> : null}
    </form>
  </Sheet>
}

function SignOutSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  // Leaves explicitly once signed out, so the route guard never captures a transitional URL as the
  // sign-in redirect. Plain /sign-in: the next person starts at Home, not on this account's page.
  const leave = async () => {
    setPending(true)
    try {
      await signOut()
      await navigate({ to: '/sign-in', replace: true })
    } catch {
      setPending(false)
    }
  }
  return <Sheet title={accountSheetText.signOutTitle} onClose={onClose}
    footer={<Button type="button" disabled={pending} onClick={() => void leave()}><DesignIcon name="signout" size="1em" strokeWidth={2.2} aria-hidden="true"  />{settingsText.signOut}</Button>}>
  </Sheet>
}

/** Delete account: the password and an explicit acknowledgement, then a destructive action. */
function DeleteSheet({ onClose }: { onClose: () => void }) {
  const formId = useId()
  const [password, setPassword] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  return <Sheet title={settingsText.deleteAccount} dirty={password !== '' || acknowledged} onClose={onClose}
    footer={<Button type="submit" form={formId} variant="destructive" disabled={pending || !acknowledged || password === ''}>{pending ? accountSheetText.deleting : settingsText.deleteAccount}</Button>}>
    <form id={formId} className="grid gap-4" onSubmit={async (event) => {
      event.preventDefault()
      setPending(true)
      setError(await deleteAccount(password))
      setPending(false)
    }}>
      <p className={pageDetailClassName}>{accountSheetText.deleteDetail}</p>
      <Field label={accountSheetText.confirmPassword}>{(id) => <Input id={id} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />}</Field>
      <label className="flex min-h-11 items-center gap-3 text-[length:var(--step-1)] font-semibold">
        <Input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
        {accountSheetText.deleteAcknowledge}
      </label>
      <ErrorNotice error={error} />
    </form>
  </Sheet>
}
