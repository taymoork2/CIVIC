"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "cv:group/tabs cv:flex cv:gap-2 cv:data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "cv:group/tabs-list cv:inline-flex cv:w-fit cv:items-center cv:justify-center cv:rounded-lg cv:p-[3px] cv:text-muted-foreground cv:group-data-horizontal/tabs:h-8 cv:group-data-vertical/tabs:h-fit cv:group-data-vertical/tabs:flex-col cv:data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "cv:bg-muted",
        line: "cv:gap-1 cv:bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "cv:relative cv:inline-flex cv:h-[calc(100%-1px)] cv:flex-1 cv:items-center cv:justify-center cv:gap-1.5 cv:rounded-md cv:border cv:border-transparent cv:px-1.5 cv:py-0.5 cv:text-sm cv:font-medium cv:whitespace-nowrap cv:text-foreground/60 cv:transition-all cv:group-data-vertical/tabs:w-full cv:group-data-vertical/tabs:justify-start cv:hover:text-foreground cv:focus-visible:border-ring cv:focus-visible:ring-[3px] cv:focus-visible:ring-ring/50 cv:focus-visible:outline-1 cv:focus-visible:outline-ring cv:disabled:pointer-events-none cv:disabled:opacity-50 cv:has-data-[icon=inline-end]:pr-1 cv:has-data-[icon=inline-start]:pl-1 cv:aria-disabled:pointer-events-none cv:aria-disabled:opacity-50 cv:dark:text-muted-foreground cv:dark:hover:text-foreground cv:group-data-[variant=default]/tabs-list:data-active:shadow-sm cv:group-data-[variant=line]/tabs-list:data-active:shadow-none cv:[&_svg]:pointer-events-none cv:[&_svg]:shrink-0 cv:[&_svg:not([class*=size-])]:size-4",
        "cv:group-data-[variant=line]/tabs-list:bg-transparent cv:group-data-[variant=line]/tabs-list:data-active:bg-transparent cv:dark:group-data-[variant=line]/tabs-list:data-active:border-transparent cv:dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "cv:data-active:bg-background cv:data-active:text-foreground cv:dark:data-active:border-input cv:dark:data-active:bg-input/30 cv:dark:data-active:text-foreground",
        "cv:after:absolute cv:after:bg-foreground cv:after:opacity-0 cv:after:transition-opacity cv:group-data-horizontal/tabs:after:inset-x-0 cv:group-data-horizontal/tabs:after:bottom-[-5px] cv:group-data-horizontal/tabs:after:h-0.5 cv:group-data-vertical/tabs:after:inset-y-0 cv:group-data-vertical/tabs:after:-right-1 cv:group-data-vertical/tabs:after:w-0.5 cv:group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("cv:flex-1 cv:text-sm cv:outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
