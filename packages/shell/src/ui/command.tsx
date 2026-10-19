"use client"

import type { ComponentProps } from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { cn } from 'cn'
import { Search } from '../icons'

// shadcn's Command composition, using CIVIC's Base UI Dialog for its overlay.
export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive data-slot="command" className={cn('civic-command', className)} {...props} />
}
export function CommandInput(props: ComponentProps<typeof CommandPrimitive.Input>) {
  return <div className="civic-command-search"><Search aria-hidden="true" /><CommandPrimitive.Input data-slot="command-input" {...props} /></div>
}
export function CommandList(props: ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List data-slot="command-list" {...props} />
}
export function CommandEmpty(props: ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty data-slot="command-empty" {...props} />
}
export function CommandGroup(props: ComponentProps<typeof CommandPrimitive.Group>) {
  return <CommandPrimitive.Group data-slot="command-group" {...props} />
}
export function CommandItem(props: ComponentProps<typeof CommandPrimitive.Item>) {
  return <CommandPrimitive.Item data-slot="command-item" {...props} />
}
