import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const alertVariants = cva(
  "cv:group/alert cv:relative cv:grid cv:w-full cv:gap-0.5 cv:rounded-lg cv:border cv:px-2.5 cv:py-2 cv:text-left cv:text-sm cv:has-data-[slot=alert-action]:relative cv:has-data-[slot=alert-action]:pr-18 cv:has-[>svg]:grid-cols-[auto_1fr] cv:has-[>svg]:gap-x-2 cv:*:[svg]:row-span-2 cv:*:[svg]:translate-y-0.5 cv:*:[svg]:text-current cv:*:[svg:not([class*=size-])]:size-4",
  {
    variants: {
      variant: {
        default: "cv:bg-card cv:text-card-foreground",
        destructive:
          "cv:bg-card cv:text-destructive cv:*:data-[slot=alert-description]:text-destructive/90 cv:*:[svg]:text-current",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "cv:font-medium cv:group-has-[>svg]/alert:col-start-2 cv:[&_a]:underline cv:[&_a]:underline-offset-3 cv:[&_a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "cv:text-sm cv:text-balance cv:text-muted-foreground cv:md:text-pretty cv:[&_a]:underline cv:[&_a]:underline-offset-3 cv:[&_a]:hover:text-foreground cv:[&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("cv:absolute cv:top-2 cv:right-2", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
