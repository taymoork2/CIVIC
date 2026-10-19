"use client"

import { useMemo } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

import { Label } from "@civic/shell/ui/label"
import { Separator } from "@civic/shell/ui/separator"

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        "cv:flex cv:flex-col cv:gap-4 cv:has-[>[data-slot=checkbox-group]]:gap-3 cv:has-[>[data-slot=radio-group]]:gap-3",
        className
      )}
      {...props}
    />
  )
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "cv:mb-1.5 cv:font-medium cv:data-[variant=label]:text-sm cv:data-[variant=legend]:text-base",
        className
      )}
      {...props}
    />
  )
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "cv:group/field-group cv:@container/field-group cv:flex cv:w-full cv:flex-col cv:gap-5 cv:data-[slot=checkbox-group]:gap-3 cv:*:data-[slot=field-group]:gap-4",
        className
      )}
      {...props}
    />
  )
}

const fieldVariants = cva(
  "cv:group/field cv:flex cv:w-full cv:gap-2 cv:data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: "cv:flex-col cv:*:w-full cv:[&>.sr-only]:w-auto",
        horizontal:
          "cv:flex-row cv:items-center cv:has-[>[data-slot=field-content]]:items-start cv:*:data-[slot=field-label]:flex-auto cv:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        responsive:
          "cv:flex-col cv:*:w-full cv:@md/field-group:flex-row cv:@md/field-group:items-center cv:@md/field-group:*:w-auto cv:@md/field-group:has-[>[data-slot=field-content]]:items-start cv:@md/field-group:*:data-[slot=field-label]:flex-auto cv:[&>.sr-only]:w-auto cv:@md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  }
)

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  )
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn(
        "cv:group/field-content cv:flex cv:flex-1 cv:flex-col cv:gap-0.5 cv:leading-snug",
        className
      )}
      {...props}
    />
  )
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        "cv:group/field-label cv:peer/field-label cv:flex cv:w-fit cv:gap-2 cv:leading-snug cv:group-data-[disabled=true]/field:opacity-50 cv:has-data-checked:border-primary/30 cv:has-data-checked:bg-primary/5 cv:has-[>[data-slot=field]]:rounded-lg cv:has-[>[data-slot=field]]:border cv:has-[>[data-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:bg-muted/50 cv:has-[>[data-slot=field]]:has-[:focus-visible]:border-ring cv:has-[>[data-slot=field]]:has-[:focus-visible]:ring-3 cv:has-[>[data-slot=field]]:has-[:focus-visible]:ring-ring/50 cv:*:data-[slot=field]:p-2.5 cv:dark:has-data-checked:border-primary/20 cv:dark:has-data-checked:bg-primary/10",
        "cv:has-[>[data-slot=field]]:w-full cv:has-[>[data-slot=field]]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "cv:flex cv:w-fit cv:items-center cv:gap-2 cv:text-sm cv:font-medium cv:group-data-[disabled=true]/field:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "cv:text-left cv:text-sm cv:leading-normal cv:font-normal cv:text-muted-foreground cv:group-has-data-horizontal/field:text-balance cv:[[data-variant=legend]+&]:-mt-1.5",
        "cv:last:mt-0 cv:nth-last-2:-mt-1",
        "cv:[&>a]:underline cv:[&>a]:underline-offset-4 cv:[&>a:hover]:text-primary",
        className
      )}
      {...props}
    />
  )
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        "cv:relative cv:-my-2 cv:h-5 cv:text-sm cv:group-data-[variant=outline]/field-group:-mb-2",
        className
      )}
      {...props}
    >
      <Separator className="cv:absolute cv:inset-0 cv:top-1/2" />
      {children && (
        <span
          className="cv:relative cv:mx-auto cv:block cv:w-fit cv:bg-background cv:px-2 cv:text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  )
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>
}) {
  const content = useMemo(() => {
    if (children) {
      return children
    }

    if (!errors?.length) {
      return null
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ]

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message
    }

    return (
      <ul className="cv:ml-4 cv:flex cv:list-disc cv:flex-col cv:gap-1">
        {uniqueErrors.map(
          (error) =>
            error?.message && <li key={error.message}>{error.message}</li>
        )}
      </ul>
    )
  }, [children, errors])

  if (!content) {
    return null
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("cv:text-sm cv:font-normal cv:text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  )
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
}
