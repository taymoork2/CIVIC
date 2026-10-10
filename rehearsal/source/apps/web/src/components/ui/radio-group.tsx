import * as React from 'react'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'
import { Radio as RadioPrimitive } from '@base-ui/react/radio'
import { cn } from '@/lib/utils'

/** One choice out of a few. `segment` draws it as a segmented control; the semantics stay a radio group. */
function RadioGroup({ className, variant = 'default', ...props }: RadioGroupPrimitive.Props & { variant?: 'default' | 'segment' }) {
  return <RadioGroupPrimitive data-slot="radio-group" data-variant={variant} className={cn(variant === 'segment' ? 'flex gap-0 rounded-control bg-muted p-[3px]' : 'grid gap-2', className as string)} {...props} />
}

/** `card`: a full-width choice with its own title and description, the whole card one radio. */
function RadioGroupItem({ className, variant = 'default', children, ...props }: RadioPrimitive.Root.Props & { variant?: 'default' | 'segment' | 'card' }) {
  if (variant === 'card') {
    return <RadioPrimitive.Root data-slot="radio-group-item" data-variant="card" nativeButton render={<button type="button" />} className={cn('grid w-full min-h-[3.75rem] gap-0.5 rounded-control border border-border bg-surface px-4 py-2.5 text-start text-foreground cursor-pointer [transition:transform_var(--dur-press)_var(--ease-out),background-color_var(--dur-step)_var(--ease-out)] active:scale-[.98] motion-reduce:active:scale-100 data-checked:border-[var(--accent)] data-checked:bg-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring data-disabled:cursor-not-allowed data-disabled:opacity-60 touch-manipulation', className as string)} {...props}>{children}</RadioPrimitive.Root>
  }
  if (variant === 'segment') {
    return <RadioPrimitive.Root data-slot="radio-group-item" nativeButton render={<button type="button" />} className={cn('flex-1 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[.8125rem] border-0 bg-transparent px-3 text-[length:.875rem] font-semibold text-foreground cursor-pointer [transition:background-color_var(--dur-step)_var(--ease-out)] active:not-data-disabled:brightness-95 data-checked:bg-card data-checked:shadow-[var(--e1)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring data-disabled:opacity-50 touch-manipulation', className as string)} {...props}>{children}</RadioPrimitive.Root>
  }
  return (
    <RadioPrimitive.Root data-slot="radio-group-item" className={cn('grid size-[22px] shrink-0 place-items-center rounded-full bg-surface cursor-pointer [box-shadow:inset_0_0_0_2px_var(--line)] data-checked:[box-shadow:inset_0_0_0_2px_var(--accent)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring data-disabled:opacity-50', className as string)} {...props}>
      <RadioPrimitive.Indicator data-slot="radio-group-indicator" className="size-2.5 rounded-full bg-link" />
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem }
