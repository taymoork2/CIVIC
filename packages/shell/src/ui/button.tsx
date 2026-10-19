import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "cv:group/button cv:inline-flex cv:shrink-0 cv:items-center cv:justify-center cv:rounded-lg cv:border cv:border-transparent cv:bg-clip-padding cv:text-sm cv:font-medium cv:whitespace-nowrap cv:transition-all cv:outline-none cv:select-none cv:focus-visible:border-ring cv:focus-visible:ring-3 cv:focus-visible:ring-ring/50 cv:active:not-aria-[haspopup]:translate-y-px cv:disabled:pointer-events-none cv:disabled:opacity-50 cv:aria-invalid:border-destructive cv:aria-invalid:ring-3 cv:aria-invalid:ring-destructive/20 cv:dark:aria-invalid:border-destructive/50 cv:dark:aria-invalid:ring-destructive/40 cv:[&_svg]:pointer-events-none cv:[&_svg]:shrink-0 cv:[&_svg:not([class*=size-])]:size-4",
  {
    variants: {
      variant: {
        default: "cv:bg-primary cv:text-primary-foreground cv:hover:bg-primary/80",
        outline:
          "cv:border-border cv:bg-background cv:hover:bg-muted cv:hover:text-foreground cv:aria-expanded:bg-muted cv:aria-expanded:text-foreground cv:dark:border-input cv:dark:bg-input/30 cv:dark:hover:bg-input/50",
        secondary:
          "cv:bg-secondary cv:text-secondary-foreground cv:hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] cv:aria-expanded:bg-secondary cv:aria-expanded:text-secondary-foreground",
        ghost:
          "cv:bg-transparent cv:hover:bg-muted cv:hover:text-foreground cv:aria-expanded:bg-muted cv:aria-expanded:text-foreground cv:dark:hover:bg-muted/50",
        destructive:
          "cv:bg-destructive/10 cv:text-destructive cv:hover:bg-destructive/20 cv:focus-visible:border-destructive/40 cv:focus-visible:ring-destructive/20 cv:dark:bg-destructive/20 cv:dark:hover:bg-destructive/30 cv:dark:focus-visible:ring-destructive/40",
        link: "cv:text-primary cv:underline-offset-4 cv:hover:underline",
      },
      size: {
        default:
          "cv:h-9 cv:gap-1.5 cv:px-2.5 cv:has-data-[icon=inline-end]:pr-2 cv:has-data-[icon=inline-start]:pl-2",
        xs: "cv:h-6 cv:gap-1 cv:rounded-[min(var(--radius-md),10px)] cv:px-2 cv:text-xs cv:in-data-[slot=button-group]:rounded-lg cv:has-data-[icon=inline-end]:pr-1.5 cv:has-data-[icon=inline-start]:pl-1.5 cv:[&_svg:not([class*=size-])]:size-3",
        sm: "cv:h-7 cv:gap-1 cv:rounded-[min(var(--radius-md),12px)] cv:px-2.5 cv:text-[0.8rem] cv:in-data-[slot=button-group]:rounded-lg cv:has-data-[icon=inline-end]:pr-1.5 cv:has-data-[icon=inline-start]:pl-1.5 cv:[&_svg:not([class*=size-])]:size-3.5",
        lg: "cv:h-9 cv:gap-1.5 cv:px-2.5 cv:has-data-[icon=inline-end]:pr-2 cv:has-data-[icon=inline-start]:pl-2",
        icon: "cv:size-9",
        "icon-xs":
          "cv:size-6 cv:rounded-[min(var(--radius-md),10px)] cv:in-data-[slot=button-group]:rounded-lg cv:[&_svg:not([class*=size-])]:size-3",
        "icon-sm":
          "cv:size-7 cv:rounded-[min(var(--radius-md),12px)] cv:in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "cv:size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-civic-control="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
