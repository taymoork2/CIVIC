"use client"

import type { ComponentProps } from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { cn } from 'cn'
import { Search } from '../icons'

// shadcn's Command composition, using CIVIC's Base UI Dialog for its overlay.
export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive data-slot="command" className={cn('cv:flex cv:h-full cv:w-full cv:flex-col cv:overflow-hidden cv:rounded-lg cv:bg-popover cv:text-popover-foreground', className)} {...props} />
}
export function CommandInput({ className, ...props }: ComponentProps<typeof CommandPrimitive.Input>) {
  return <div className="cv:flex cv:items-center cv:gap-2 cv:border-b cv:border-border cv:px-4"><Search aria-hidden="true" className="cv:size-4 cv:shrink-0 cv:text-muted-foreground" /><CommandPrimitive.Input data-slot="command-input" className={cn('cv:flex cv:h-12 cv:w-full cv:rounded-md cv:border-0 cv:bg-transparent cv:py-3 cv:text-sm cv:outline-none cv:placeholder:text-muted-foreground cv:disabled:opacity-50', className)} {...props} /></div>
}
export function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List data-slot="command-list" className={cn('cv:max-h-[min(440px,calc(100dvh-140px))] cv:overflow-y-auto cv:overflow-x-hidden cv:overscroll-contain cv:p-1', className)} {...props} />
}
export function CommandEmpty({ className, ...props }: ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty data-slot="command-empty" className={cn('cv:py-6 cv:text-center cv:text-sm cv:text-muted-foreground', className)} {...props} />
}
export function CommandGroup({ className, ...props }: ComponentProps<typeof CommandPrimitive.Group>) {
  return <CommandPrimitive.Group data-slot="command-group" className={cn('cv:overflow-hidden cv:p-1 cv:text-foreground cv:[&_[cmdk-group-heading]]:px-2 cv:[&_[cmdk-group-heading]]:py-1.5 cv:[&_[cmdk-group-heading]]:text-xs cv:[&_[cmdk-group-heading]]:font-medium cv:[&_[cmdk-group-heading]]:text-muted-foreground', className)} {...props} />
}
export function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return <CommandPrimitive.Item data-slot="command-item" className={cn('cv:relative cv:flex cv:min-h-10 cv:max-[600px]:min-h-11 cv:cursor-default cv:items-center cv:gap-2 cv:rounded-sm cv:px-2 cv:py-1.5 cv:text-sm cv:outline-hidden cv:select-none cv:data-[selected=true]:bg-accent cv:data-[selected=true]:text-accent-foreground cv:data-[disabled=true]:pointer-events-none cv:data-[disabled=true]:opacity-50 cv:[&>span]:min-w-0 cv:[&>span]:flex-1 cv:[&>span]:truncate cv:[&_svg]:pointer-events-none cv:[&_svg]:size-4 cv:[&_svg]:shrink-0 cv:[&_small]:text-xs cv:[&_small]:text-muted-foreground', className)} {...props} />
}
