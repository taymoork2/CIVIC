import type { ComponentProps } from 'react'
import { cn } from 'cn'

// Presentational shadcn sidebar parts; the workspace owns its canvas and responsive open state.
export function SidebarHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sidebar-header" className={cn('cv:flex cv:shrink-0 cv:flex-col cv:gap-2 cv:p-2', className)} {...props} />
}
export function SidebarContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sidebar-content" className={cn('cv:flex cv:min-h-0 cv:flex-1 cv:flex-col cv:gap-2 cv:overflow-auto cv:overscroll-contain', className)} {...props} />
}
export function SidebarFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sidebar-footer" className={cn('cv:flex cv:shrink-0 cv:flex-col cv:gap-2 cv:p-2', className)} {...props} />
}
export function SidebarGroup({ className, ...props }: ComponentProps<'section'>) {
  return <section data-slot="sidebar-group" className={cn('cv:flex cv:w-full cv:min-w-0 cv:flex-col cv:gap-1 cv:p-2', className)} {...props} />
}
export function SidebarGroupLabel({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 data-slot="sidebar-group-label" className={cn('cv:flex cv:h-8 cv:shrink-0 cv:items-center cv:px-2 cv:text-xs cv:font-medium cv:text-muted-foreground', className)} {...props} />
}
export function SidebarMenu({ className, ...props }: ComponentProps<'ul'>) {
  return <ul data-slot="sidebar-menu" className={cn('cv:m-0 cv:flex cv:w-full cv:min-w-0 cv:list-none cv:flex-col cv:gap-1 cv:p-0', className)} {...props} />
}
export function SidebarMenuItem({ className, ...props }: ComponentProps<'li'>) {
  return <li data-slot="sidebar-menu-item" className={cn('cv:relative cv:min-w-0', className)} {...props} />
}
