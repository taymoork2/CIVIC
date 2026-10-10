import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

import { helpTipText } from '@/copy'
import { CareSymbol } from '@/closet/care-symbols'
import { HelpTip } from '@/kit/help-tip'
import { listWords, midCheckText } from '@/copy-drying'
import type { EarlyCheck } from '@/home/hub-state'
import { minutesLeft, TimeCard } from '@/laundry/session-view'
import { DesignIcon } from '@/kit/design-icons'

const cardClassName = cn(
  "early-check-card",
  "grid min-w-0 gap-3 rounded-card bg-card p-4 shadow-[var(--shadow-sm)]",
)

const rowClassName = cn(
  "early-check-row",
  "-mx-4 -mb-4 flex min-h-16 items-center gap-3.5 rounded-b-card bg-accent px-4 py-3.5 text-ink no-underline focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring",
)

const detailClassName = cn(
  "early-check-detail",
  "m-0 max-w-none text-[length:var(--step-0)] leading-normal text-ink-2 [overflow-wrap:anywhere]",
)

/** "Blue tee, Gray polo" as a sentence part: "Blue tee and Gray polo". */
const sentence = (names: string) => listWords(names.split(', ').filter((name) => name.length > 0))

/**
 * A running dryer whose early check is coming: the same countdown card the washer and dryer pages use,
 * counting to the check, then one tap row "Take out the Blue tee now" that opens the check. A reminder
 * for it was set when the dryer started. `skipDue`: Home's own hero already carries the due action.
 */
export function EarlyChecks({ checks, now, skipDue = false, renderOpen }: {
  checks: readonly EarlyCheck[]
  now: number
  skipDue?: boolean
  /** The link to that run's check: a router link where there is one. */
  renderOpen: (runId: string, props: { className: string; children: ReactNode }) => ReactNode
}) {
  return <>{checks.map((check) => {
    const names = sentence(check.names.length > 0 ? check.names : check.dryer)
    if (check.at > now) {
      const total = check.at - check.startedAt
      return <div key={check.runId} className="grid gap-2">
        <TimeCard label={midCheckText.cardTitle(check.dryer)} big={minutesLeft(check.at, now)} sub={`${midCheckText.cardLeft(names)}. ${midCheckText.cardKeepsGoing(check.dryer)}`} tone="drying"
          progress={total > 0 ? Math.min(1, Math.max(0, (now - check.startedAt) / total)) : null} />
      </div>
    }
    if (skipDue) return null
    return <section key={check.runId} className={cardClassName} aria-label={midCheckText.takeOutNow(names)}>
      <p className={detailClassName}>{midCheckText.cardKeepsGoing(check.dryer)}<HelpTip topic={helpTipText.earlyCheck.topic}>{helpTipText.earlyCheck.words}</HelpTip></p>
      {renderOpen(check.runId, { className: rowClassName, children: <>
        <span className="grid size-11 flex-none place-items-center rounded-field bg-surface text-[var(--sig-ink)]" aria-hidden="true"><CareSymbol kind="tumble_dry" size={24} decorative /></span>
        <span className="min-w-0 flex-1 text-[length:1.0625rem] font-semibold [overflow-wrap:anywhere]">{midCheckText.takeOutNow(names)}</span>
        <DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-[18px] flex-none text-ink-2" aria-hidden="true"  />
      </> })}
    </section>
  })}</>
}
