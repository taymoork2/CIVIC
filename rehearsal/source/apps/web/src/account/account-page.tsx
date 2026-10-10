import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react'

import { TaskFooter } from '@/kit/task-footer'
import { Field } from '@/kit/ui'
import { WelcomeArt, type WelcomeArtView } from '@/kit/welcome-art'
import { productName } from '@/kit/app-shell'
import { DesignIcon } from '@/kit/design-icons'

/** Page title and muted facts follow the shared type roles. */
export const pageTitleClassName = 'm-0 font-text text-[length:var(--step-4)] font-semibold leading-[1.2] text-balance [overflow-wrap:anywhere]'
export const pageSubClassName = 'm-0 text-[length:var(--step--1)] leading-[1.45] text-ink-2'
/** Explanatory prose uses body type; captions and field details stay compact. */
export const pageDetailClassName = 'm-0 min-w-0 max-w-[52ch] text-[length:var(--step-1)] leading-normal text-balance text-ink-2 [overflow-wrap:anywhere]'
export const fieldErrorClassName = 'm-0 text-[length:var(--step--1)] leading-[1.45] font-semibold text-warn-ink'

const toneClassName = {
  conflict: 'bg-conflict-bg text-conflict-ink',
  waiting: 'bg-hamper-bg text-hamper-ink',
  washing: 'bg-washing-bg text-washing-ink',
  ready: 'bg-ready-bg text-ready-ink',
} as const

/** A tinted notice with body text and optional pill actions beneath. Status vocabulary, never colour alone. */
export function Banner({ tone, role = 'status', actions, children }: {
  tone: keyof typeof toneClassName
  role?: 'status' | 'alert' | 'note'
  /** The same shape as the record-row Banner's actions ("Try again"), as translucent pills. */
  actions?: readonly { readonly label: string; readonly onClick: () => void; readonly disabled?: boolean }[]
  children: ReactNode
}) {
  const hasActions = actions !== undefined && actions.length > 0
  return <div role={role} className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5 rounded-control px-3.5 pt-3 text-[length:var(--step-1)] leading-normal [overflow-wrap:anywhere]', toneClassName[tone], hasActions ? 'pb-1' : 'pb-3')}>
    <p className={cn('m-0 max-w-none', hasActions ? 'pb-2' : '')}>{children}</p>
    {hasActions ? <div className="flex flex-wrap gap-x-2 gap-y-3 pb-1">
      {actions.map((action) => <Button key={action.label} type="button" variant="alert" disabled={action.disabled} onClick={action.onClick}>{action.label}</Button>)}
    </div> : null}
  </div>
}

/** A text action in the task footer, in the accent colour, 44px tall. */
export function FooterLink({ children, className, ...props }: Parameters<typeof Button>[0]) {
  return <Button variant="ghost" className={cn('min-h-11 px-3 text-[length:var(--step-1)] font-semibold leading-snug text-link', className)} {...props}>{children}</Button>
}

/**
 * One account or first-run screen, in the prototype's order: an icon Back (when there is one), the
 * title with its muted line, the art, the blocks, and an opaque footer holding the one primary
 * action with quieter text actions. With `onSubmit` the whole page is the form, so Enter submits
 * and the footer button is its submit button.
 */
export function AccountPage({ title, sub, subRole, art, wordmark = false, center = true, onBack, backLabel, onSubmit, primary, secondary, footerNote, focusTitle = false, titleKey, children }: {
  title: string
  sub?: ReactNode
  /** `status` makes the muted line a live announcement (the celebration). */
  subRole?: 'status'
  art?: WelcomeArtView
  wordmark?: boolean
  /**
   * Centres the picture and inputs vertically so they sit under a thumb. A page taller than the
   * screen (create account on a short phone) simply starts at the top, with its action in the footer.
   */
  center?: boolean
  onBack?: () => void
  backLabel?: string
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  primary?: ReactNode
  secondary?: ReactNode
  footerNote?: ReactNode
  /** Moves focus to the title when a new screen appears, so it is read first. */
  focusTitle?: boolean
  /** Changing this re-focuses the title (a step within the same page). */
  titleKey?: string
  children?: ReactNode
}) {
  const titleId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!focusTitle) return
    // The shell removes its hydration-time inert state before the next frame.
    const frame = requestAnimationFrame(() => {
      // A person may start typing before the hydration frame runs.
      if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return
      heading.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [focusTitle, titleKey ?? title])
  const body = <>
    <div key={titleKey ?? title} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
    <div className="flex min-h-[50px] shrink-0 items-center gap-1 px-2 pt-[calc(env(safe-area-inset-top)_+_2px)]">
      {onBack === undefined ? null : <Button variant="ghost" size="icon" type="button" className="text-ink [&_svg]:size-[22px]" aria-label={backLabel ?? 'Back'} onClick={onBack}><DesignIcon name="arrowLeft" size="1em" aria-hidden="true"  /></Button>}
      {wordmark ? <span className="ms-auto inline-block min-w-0 pe-3 text-[length:var(--type-wordmark)] font-normal leading-[1.2] first-letter:italic text-link [font-family:var(--font-brand)] [overflow-wrap:anywhere]">{productName}</span> : null}
    </div>
    {/* The title stays at the top where people look first; the picture and the inputs sit in the middle, under a thumb. */}
    <div className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 px-4 pt-2 pb-6', center ? 'flex-1 grid-rows-[auto_minmax(0,1fr)]' : 'content-start')}>
    <header className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <h1 id={titleId} ref={heading} tabIndex={focusTitle ? -1 : undefined} className={cn(pageTitleClassName, focusTitle ? 'outline-none' : '')}>{title}</h1>
      {sub === undefined ? null : <p role={subRole} className={pageSubClassName}>{sub}</p>}
    </header>
    <div className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5', center ? 'content-center' : 'content-start')}>
    {art === undefined ? null : <WelcomeArt view={art} />}
    {children}
    </div>
    </div>
    </div>
    {primary === undefined ? null : <TaskFooter placement="inline" note={footerNote} secondary={secondary}>{primary}</TaskFooter>}
  </>
  const className = 'account-page flex h-[100dvh] w-full flex-col'
  return onSubmit === undefined
    ? <section aria-labelledby={titleId} className={className}>{body}</section>
    : <form aria-labelledby={titleId} className={className} onSubmit={onSubmit} noValidate>{body}</form>
}

/** Per-field text under an input; `aria-describedby` points at it so the problem is read with the field. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  return message === undefined ? null : <p id={id} className={fieldErrorClassName} role="alert">{message}</p>
}

type AuthField = { id: string; hintId?: string; error?: string }
const describedBy = ({ id, hintId, error }: AuthField) => [hintId, error === undefined ? undefined : `${id}-error`].filter(Boolean).join(' ') || undefined

export function TextField({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (props: { id: string; invalid: boolean; describedBy: string | undefined }) => ReactNode }) {
  return <Field label={label} hint={hint}>
    {(id, hintId) => <>
      {children({ id, invalid: error !== undefined, describedBy: describedBy({ id, hintId, error }) })}
      <FieldError id={`${id}-error`} message={error} />
    </>}
  </Field>
}

/** Moves to the first field that failed, as a native form would. */
export function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
}
