import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Link } from '@tanstack/react-router'
import { offlineText } from './copy'

import { offlineSessionCopies, type SessionProjection } from './private-state'
import { OfflineSessionView, washerName } from '@/laundry/session-view'

/** With no signal and no sign-in check: this load's saved copy (or the newest, off a load's page), and the others to open. */
const pageClassName = cn(
  "page",
  "[.app-shell.is-focus_&]:max-w-[30rem]",
  "grid gap-6 max-w-[36rem] mx-auto pt-2",
  "md:max-w-[45rem]",
  "[.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:w-full [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:max-w-[none] [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:mx-0 [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:pt-0 [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:content-start [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:gap-4",
)

const labelCardClassName = cn(
  "label-card",
  "bg-surface rounded-card overflow-hidden",
  "[.household-page_>_&]:overflow-hidden [.household-page_>_&]:rounded-[1.25rem] [.household-page_>_&]:bg-transparent [.household-page_>_&]:border-0 [.household-page_>_&]:shadow-none",
  "[.household-page_>_&_h2]:font-text [.household-page_>_&_h2]:font-semibold [.household-page_>_&_h2]:leading-[1.3]",
  "[.household-page_>_&_h2]:text-[length:var(--step-2)]",
  "[.settings-page_&_h2]:font-text [.settings-page_&_h2]:font-semibold [.settings-page_&_h2]:leading-[1.3]",
  "[.settings-page_&_h2]:text-[length:var(--step-2)]",
  "[.settings-page_&]:border-0 [.settings-page_&]:shadow-[var(--shadow-sm)] [.settings-page_&]:rounded-[1.25rem]",
)

const paddedClassName = cn(
  "padded",
  "[.label-card&]:p-4 [.label-card&]:grid [.label-card&]:gap-3",
  "[.settings-page_.label-card&]:gap-4",
)

const offlineNoticeClassName = cn(
  "offline-notice",
  "[justify-items:start]",
  "gap-4 max-w-[42rem]",
  "[&_h1]:text-[length:var(--step-3)]",
  "[&_p]:max-w-[52ch] [&_p]:leading-[1.55]",
)

const mutedClassName = cn(
  "muted",
  "text-ink-2",
)

const sectionTitleClassName = cn(
  "section-title",
  "flex items-baseline justify-between gap-3 mb-2",
)

export function OfflineNotice({ sessionId }: { sessionId?: string }) {
  const { projection, others } = offlineSessionCopies(sessionId)
  if (projection !== null) {
    return (
      <>
        <OfflineSessionView projection={projection} />
        {others.length === 0 ? null : <div className={pageClassName}><OtherLoads loads={others} /></div>}
      </>
    )
  }
  return (
    <div className={pageClassName}>
      <section className={cn(labelCardClassName, paddedClassName, offlineNoticeClassName)} role="status">
        <h1>{offlineText.title}</h1>
        <p className={mutedClassName}>{offlineText.explanation}</p>
        <Link className={cn(buttonVariants(), "secondary")} to="/">{offlineText.retry}</Link>
      </section>
      <OtherLoads loads={others} />
    </div>
  )
}

/** The other running loads saved on this phone, each opening its own checklist. */
function OtherLoads({ loads }: { loads: readonly SessionProjection[] }) {
  if (loads.length === 0) return null
  return (
    <section className={cn(labelCardClassName, paddedClassName)} aria-labelledby="other-loads-title">
      <h2 id="other-loads-title" className={sectionTitleClassName}>{offlineText.otherLoads(loads.length)}</h2>
      {loads.map((load) => (
        <Link key={load.sessionId} className={cn(buttonVariants(), "secondary")} to="/session/$sessionId" params={{ sessionId: load.sessionId }}>{washerName(load.machineName)}</Link>
      ))}
    </section>
  )
}
