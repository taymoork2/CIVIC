"use client"

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const toggleVariants = cva(
  "cv:group/toggle cv:inline-flex cv:items-center cv:justify-center cv:gap-1 cv:rounded-lg cv:text-sm cv:font-medium cv:whitespace-nowrap cv:transition-all cv:outline-none cv:hover:bg-muted cv:hover:text-foreground cv:focus-visible:border-ring cv:focus-visible:ring-[3px] cv:focus-visible:ring-ring/50 cv:disabled:pointer-events-none cv:disabled:opacity-50 cv:aria-invalid:border-destructive cv:aria-invalid:ring-destructive/20 cv:aria-pressed:bg-muted cv:data-[state=on]:bg-muted cv:dark:aria-invalid:ring-destructive/40 cv:[&_svg]:pointer-events-none cv:[&_svg]:shrink-0 cv:[&_svg:not([class*=size-])]:size-4",
  {
    variants: {
      variant: {
        default: "cv:border cv:border-transparent cv:bg-transparent",
        outline: "cv:border cv:border-input cv:bg-transparent cv:hover:bg-muted",
      },
      size: {
        default:
          "cv:h-8 cv:min-w-8 cv:px-2.5 cv:has-data-[icon=inline-end]:pr-2 cv:has-data-[icon=inline-start]:pl-2",
        sm: "cv:h-7 cv:min-w-7 cv:rounded-[min(var(--radius-md),12px)] cv:px-2.5 cv:text-[0.8rem] cv:has-data-[icon=inline-end]:pr-1.5 cv:has-data-[icon=inline-start]:pl-1.5 cv:[&_svg:not([class*=size-])]:size-3.5",
        lg: "cv:h-9 cv:min-w-9 cv:px-2.5 cv:has-data-[icon=inline-end]:pr-2 cv:has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
