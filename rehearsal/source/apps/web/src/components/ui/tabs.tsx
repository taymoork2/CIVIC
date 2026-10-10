import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cn } from '@/lib/utils'

/** shadcn Tabs on Base UI: a real tablist with arrow-key movement, for record tabs inside a sheet. */
function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('grid min-w-0 gap-4', className as string)} {...props} />
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return <TabsPrimitive.List data-slot="tabs-list" className={cn('flex min-w-0 gap-0 overflow-x-auto rounded-control bg-muted p-[3px]', className as string)} {...props} />
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return <TabsPrimitive.Tab data-slot="tabs-trigger" className={cn('inline-flex min-h-11 min-w-max flex-1 shrink-0 items-center justify-center whitespace-nowrap rounded-[.8125rem] border-0 bg-transparent px-3 text-[length:.875rem] font-semibold text-foreground cursor-pointer [transition:background-color_var(--dur-step)_var(--ease-out)] data-active:bg-card data-active:shadow-[var(--e1)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring touch-manipulation', className as string)} {...props} />
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn('grid gap-3 [&[hidden]]:hidden focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring', className as string)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
