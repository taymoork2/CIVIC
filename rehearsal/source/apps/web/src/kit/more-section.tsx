import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { DesignIcon } from '@/kit/design-icons'
import { FieldSet, FieldLegend } from '@/components/ui/field'

/**
 * An optional group of fields that stays out of the way until opened, on the Base UI Collapsible:
 * the trigger is a real button and the panel stays in the page, so find-in-page can open it.
 * `card` is a tinted block inside a form; `flat` is a ruled row in a list of them.
 * `section` keeps saved-editor fields visible under their legend.
 */
export function MoreSection({ title, variant = 'card', defaultOpen = false, children }: {
  title: ReactNode
  variant?: 'card' | 'flat' | 'section'
  defaultOpen?: boolean
  children: ReactNode
}) {
  if (variant === 'section') return <FieldSet className="gap-3"><FieldLegend>{title}</FieldLegend>{children}</FieldSet>
  const flat = variant === 'flat'
  return <Collapsible defaultOpen={defaultOpen} className={cn('more-details', flat ? 'border-b border-line' : 'rounded-control bg-surface-2 text-ink')}>
    <CollapsibleTrigger className={cn('group flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 font-semibold active:bg-surface-2 [@media_(hover:_hover)_and_(pointer:_fine)]:hover:bg-surface-2', flat ? 'px-0 text-ink focus-visible:outline-offset-[-3px]' : 'rounded-control px-4')}>
      <span>{title}</span>
      <DesignIcon name="chevronDown" size="1em" strokeWidth={2.2} className="size-4 flex-none group-data-[panel-open]:rotate-180 motion-reduce:transition-none" aria-hidden="true"  />
    </CollapsibleTrigger>
    <CollapsiblePanel>
      <div className={cn('grid gap-3', flat ? 'pb-4' : 'px-4 pb-4')}>{children}</div>
    </CollapsiblePanel>
  </Collapsible>
}
