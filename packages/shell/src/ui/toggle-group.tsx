import * as React from "react"
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import { type VariantProps } from "class-variance-authority"
import { cn } from "cn"

import { toggleVariants } from "@civic/shell/ui/toggle"

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    orientation?: "horizontal" | "vertical"
  }
>({
  size: "default",
  variant: "default",
  spacing: 2,
  orientation: "horizontal",
})

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = "horizontal",
  children,
  ...props
}: ToggleGroupPrimitive.Props &
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    orientation?: "horizontal" | "vertical"
  }) {
  const value = React.useMemo(() => ({ variant, size, spacing, orientation }), [variant, size, spacing, orientation])
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn(
        "cv:group/toggle-group cv:flex cv:w-fit cv:flex-row cv:items-center cv:gap-[--spacing(var(--gap))] cv:rounded-lg cv:data-[size=sm]:rounded-[min(var(--radius-md),10px)] cv:data-vertical:flex-col cv:data-vertical:items-stretch",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={value}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-civic-control="toggle"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        "cv:shrink-0 cv:group-data-[spacing=0]/toggle-group:rounded-none cv:group-data-[spacing=0]/toggle-group:px-2 cv:focus:z-10 cv:focus-visible:z-10 cv:group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 cv:group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 cv:group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-lg cv:group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-lg cv:group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-lg cv:group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-lg cv:group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 cv:group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 cv:group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l cv:group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t",
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  )
}

export { ToggleGroup, ToggleGroupItem }
