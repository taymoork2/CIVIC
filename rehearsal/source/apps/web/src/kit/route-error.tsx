import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Link, useCanGoBack, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { RequireHousehold } from '@/account/account'
import { notFoundText, routeErrorText } from '@/copy'
import { errorCode, errorMessage } from '@/kit/ui'
import { DesignIcon } from '@/kit/design-icons'

/**
 * Shown when a page's data cannot be read. Lost access falls back to sign-in or onboarding
 * (which also purges this device's private state); other failures say what went wrong.
 */
const pageClassName = cn(
  "page",
  "[.app-shell.is-focus_&]:max-w-[30rem]",
  "grid gap-6 max-w-[36rem] mx-auto pt-2",
  "md:max-w-[45rem]",
  "[.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:w-full [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:max-w-[none] [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:mx-0 [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:pt-0 [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:content-start [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:gap-4",
)

/**
 * The message page: centered in the space between the header and the dock, so its way out sits where a
 * thumb rests; a quiet symbol, one heading, one plain sentence, the actions full width.
 */
const messageClassName = cn(
  "message-page",
  "grid min-h-[calc(100dvh_-_14rem)] content-center justify-items-center gap-3 px-2 text-center",
)

const messageActionsClassName = cn(
  "message-actions",
  "mt-3 grid w-full max-w-[20rem] gap-2",
)

function MessagePage({ title, detail, actions, symbol }: { title: string; detail: ReactNode; actions: ReactNode; symbol: ReactNode }) {
  return (
    <div className={pageClassName}>
      <section className={messageClassName} role="alert">
        <span className="grid size-14 place-items-center rounded-full bg-muted text-ink-2" aria-hidden="true">{symbol}</span>
        <h1 className="text-[length:var(--step-3)] font-semibold">{title}</h1>
        <p className="max-w-[24rem] text-ink-2">{detail}</p>
        <div className={messageActionsClassName}>{actions}</div>
      </section>
    </div>
  )
}

/** Unknown addresses. Shown to everyone, signed in or not, so a bad link never detours through sign-in. */
export function NotFound() {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  return (
    <MessagePage
      symbol={<DesignIcon name="signpost" size={26}  />}
      title={notFoundText.title}
      detail={notFoundText.detail}
      actions={<>
        <Link className={cn(buttonVariants({ size: 'lg' }), "w-full")} to="/">{notFoundText.home}</Link>
        {canGoBack ? <button className={cn(buttonVariants({ variant: 'ghost' }), "w-full")} type="button" onClick={() => router.history.back()}>{notFoundText.back}</button> : null}
      </>}
    />
  )
}

export function RouteError({ error }: { error: unknown }) {
  const code = errorCode(error)
  // A link with a malformed id fails argument validation before any code runs: treat it like one that no longer exists.
  const malformed = code === null && error instanceof Error && /ArgumentValidationError|does not match validator/i.test(error.message)
  const denied = code === 'forbidden' || code === 'not_found' || code === 'unauthenticated' || malformed
  return (
    <RequireHousehold>
      {() => (
        <MessagePage
          symbol={<DesignIcon name="alert" size={26}  />}
          title={denied ? routeErrorText.denied : routeErrorText.failed}
          detail={denied ? routeErrorText.deniedDetail : errorMessage(error)}
          actions={<Link className={cn(buttonVariants({ size: 'lg' }), "w-full")} to="/">{routeErrorText.home}</Link>}
        />
      )}
    </RequireHousehold>
  )
}
