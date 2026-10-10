import * as React from 'react'
import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible'
import { cn } from '@/lib/utils'

function Collapsible(props: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ className, ...props }: CollapsiblePrimitive.Trigger.Props) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" className={cn('w-full border-0 bg-transparent p-0 text-start text-inherit [font:inherit] cursor-pointer touch-manipulation focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:[transition:transform_var(--dur-step)_var(--ease-out)]', className as string)} {...props} />
}

/** Stays in the page while closed, and the browser's find-in-page opens it on a match. */
function CollapsiblePanel({ keepMounted = true, hiddenUntilFound = true, ...props }: CollapsiblePrimitive.Panel.Props) {
  return <CollapsiblePrimitive.Panel data-slot="collapsible-panel" keepMounted={keepMounted} hiddenUntilFound={hiddenUntilFound} {...props} />
}

export { Collapsible, CollapsibleTrigger, CollapsiblePanel, CollapsiblePanel as CollapsibleContent }
