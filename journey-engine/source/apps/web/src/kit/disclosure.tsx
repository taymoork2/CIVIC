import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { DesignIcon } from '@/kit/design-icons'

const disclosureTriggerClassName = cn(
  "disclosure-trigger",
  "flex min-h-11 items-center justify-between gap-3 font-semibold",
)

const disclosurePanelClassName = cn(
  "disclosure-panel",
  "grid gap-3 pt-3",
)

/** A folded section: a real disclosure button and a panel that stays in the page while closed. */
export function Disclosure({ summary, className, triggerClassName, triggerId, open, onOpenChange, children }: {
  summary: ReactNode
  className?: string
  /** Extra classes for the trigger, for a place that sets it in a different weight or width. */
  triggerClassName?: string
  /** An id for the trigger, so a caller can send focus back to it. */
  triggerId?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}) {
  return <Collapsible className={className} {...(open === undefined ? {} : { open })} {...(onOpenChange === undefined ? {} : { onOpenChange })}>
    <CollapsibleTrigger id={triggerId} className={cn(disclosureTriggerClassName, triggerClassName)}>{summary}<DesignIcon name="chevronDown" size="1em" strokeWidth={2.2} aria-hidden="true"  /></CollapsibleTrigger>
    <CollapsiblePanel className={disclosurePanelClassName}>{children}</CollapsiblePanel>
  </Collapsible>
}
