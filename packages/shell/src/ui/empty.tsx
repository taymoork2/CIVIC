import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "cv:flex cv:w-full cv:min-w-0 cv:flex-1 cv:flex-col cv:items-center cv:justify-center cv:gap-4 cv:rounded-xl cv:border-dashed cv:p-6 cv:text-center cv:text-balance",
        className
      )}
      {...props}
    />
  )
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn("cv:flex cv:max-w-sm cv:flex-col cv:items-center cv:gap-2", className)}
      {...props}
    />
  )
}

const emptyMediaVariants = cva(
  "cv:mb-2 cv:flex cv:shrink-0 cv:items-center cv:justify-center cv:[&_svg]:pointer-events-none cv:[&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "cv:bg-transparent",
        icon: "cv:flex cv:size-8 cv:shrink-0 cv:items-center cv:justify-center cv:rounded-lg cv:bg-muted cv:text-foreground cv:[&_svg:not([class*=size-])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn(
        "cv:text-sm cv:font-medium cv:tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "cv:text-sm/relaxed cv:text-muted-foreground cv:[&>a]:underline cv:[&>a]:underline-offset-4 cv:[&>a:hover]:text-primary",
        className
      )}
      {...props}
    />
  )
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "cv:flex cv:w-full cv:max-w-sm cv:min-w-0 cv:flex-col cv:items-center cv:gap-2.5 cv:text-sm cv:text-balance",
        className
      )}
      {...props}
    />
  )
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
}
