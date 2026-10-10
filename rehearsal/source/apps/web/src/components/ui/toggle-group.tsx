import * as React from 'react'
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group'
import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { cn } from '@/lib/utils'

/** Base UI's value is always a list; pass `multiple` for more than one pressed item. */
function ToggleGroup({ className, ...props }: ToggleGroupPrimitive.Props) {
  return <ToggleGroupPrimitive data-slot="toggle-group" className={cn('flex gap-0 rounded-control bg-muted p-[3px]', className as string)} {...props} />
}

function ToggleGroupItem({ className, ...props }: TogglePrimitive.Props) {
  return <TogglePrimitive data-slot="toggle-group-item" className={cn('inline-flex min-h-[2.625rem] min-w-11 items-center justify-center gap-2 rounded-[.8125rem] border-0 bg-transparent px-3 text-[length:.875rem] font-semibold text-foreground cursor-pointer [transition:background-color_var(--dur-step)_var(--ease-out)] data-pressed:bg-card data-pressed:shadow-[var(--e1)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring data-disabled:opacity-50 touch-manipulation', className as string)} {...props} />
}

export { ToggleGroup, ToggleGroupItem }
