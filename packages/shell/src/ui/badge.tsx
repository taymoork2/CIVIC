import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "cv:group/badge cv:inline-flex cv:h-5 cv:w-fit cv:shrink-0 cv:items-center cv:justify-center cv:gap-1 cv:overflow-hidden cv:rounded-4xl cv:border cv:border-transparent cv:px-2 cv:py-0.5 cv:text-xs cv:font-medium cv:whitespace-nowrap cv:transition-all cv:focus-visible:border-ring cv:focus-visible:ring-[3px] cv:focus-visible:ring-ring/50 cv:has-data-[icon=inline-end]:pr-1.5 cv:has-data-[icon=inline-start]:pl-1.5 cv:aria-invalid:border-destructive cv:aria-invalid:ring-destructive/20 cv:dark:aria-invalid:ring-destructive/40 cv:[&>svg]:pointer-events-none cv:[&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "cv:bg-primary cv:text-primary-foreground cv:[a]:hover:bg-primary/80",
        secondary:
          "cv:bg-secondary cv:text-secondary-foreground cv:[a]:hover:bg-secondary/80",
        destructive:
          "cv:bg-destructive/10 cv:text-destructive cv:focus-visible:ring-destructive/20 cv:dark:bg-destructive/20 cv:dark:focus-visible:ring-destructive/40 cv:[a]:hover:bg-destructive/20",
        outline:
          "cv:border-border cv:text-foreground cv:[a]:hover:bg-muted cv:[a]:hover:text-muted-foreground",
        ghost:
          "cv:hover:bg-muted cv:hover:text-muted-foreground cv:dark:hover:bg-muted/50",
        link: "cv:text-primary cv:underline-offset-4 cv:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
