import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

import { Button } from "@civic/shell/ui/button"
import { Input } from "@civic/shell/ui/input"
import { Textarea } from "@civic/shell/ui/textarea"

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        "cv:group/input-group cv:relative cv:flex cv:h-8 cv:w-full cv:min-w-0 cv:items-center cv:rounded-lg cv:border cv:border-input cv:transition-colors cv:outline-none cv:in-data-[slot=combobox-content]:focus-within:border-inherit cv:in-data-[slot=combobox-content]:focus-within:ring-0 cv:has-disabled:bg-input/50 cv:has-disabled:opacity-50 cv:has-[[data-slot=input-group-control]:focus-visible]:border-ring cv:has-[[data-slot=input-group-control]:focus-visible]:ring-3 cv:has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 cv:has-[[data-slot][aria-invalid=true]]:border-destructive cv:has-[[data-slot][aria-invalid=true]]:ring-3 cv:has-[[data-slot][aria-invalid=true]]:ring-destructive/20 cv:has-[>[data-align=block-end]]:h-auto cv:has-[>[data-align=block-end]]:flex-col cv:has-[>[data-align=block-start]]:h-auto cv:has-[>[data-align=block-start]]:flex-col cv:has-[>textarea]:h-auto cv:dark:bg-input/30 cv:dark:has-disabled:bg-input/80 cv:dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40 cv:has-[>[data-align=block-end]]:[&>input]:pt-3 cv:has-[>[data-align=block-start]]:[&>input]:pb-3 cv:has-[>[data-align=inline-end]]:[&>input]:pr-1.5 cv:has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
        className
      )}
      {...props}
    />
  )
}

const inputGroupAddonVariants = cva(
  "cv:flex cv:h-auto cv:cursor-text cv:items-center cv:justify-center cv:gap-2 cv:py-1.5 cv:text-sm cv:font-medium cv:text-muted-foreground cv:select-none cv:group-data-[disabled=true]/input-group:opacity-50 cv:[&>kbd]:rounded-[calc(var(--radius)-5px)] cv:[&>svg:not([class*=size-])]:size-4",
  {
    variants: {
      align: {
        "inline-start":
          "cv:order-first cv:pl-2 cv:has-[>button]:ml-[-0.3rem] cv:has-[>kbd]:ml-[-0.15rem]",
        "inline-end":
          "cv:order-last cv:pr-2 cv:has-[>button]:mr-[-0.3rem] cv:has-[>kbd]:mr-[-0.15rem]",
        "block-start":
          "cv:order-first cv:w-full cv:justify-start cv:px-2.5 cv:pt-2 cv:group-has-[>input]/input-group:pt-2 cv:[.border-b]:pb-2",
        "block-end":
          "cv:order-last cv:w-full cv:justify-start cv:px-2.5 cv:pb-2 cv:group-has-[>input]/input-group:pb-2 cv:[.border-t]:pt-2",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  }
)

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) {
          return
        }
        e.currentTarget.parentElement?.querySelector("input")?.focus()
      }}
      {...props}
    />
  )
}

const inputGroupButtonVariants = cva(
  "cv:flex cv:items-center cv:gap-2 cv:text-sm cv:shadow-none",
  {
    variants: {
      size: {
        xs: "cv:h-6 cv:gap-1 cv:rounded-[calc(var(--radius)-3px)] cv:px-1.5 cv:[&>svg:not([class*=size-])]:size-3.5",
        sm: "cv:",
        "icon-xs":
          "cv:size-6 cv:rounded-[calc(var(--radius)-3px)] cv:p-0 cv:has-[>svg]:p-0",
        "icon-sm": "cv:size-8 cv:p-0 cv:has-[>svg]:p-0",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  }
)

function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size" | "type"> &
  VariantProps<typeof inputGroupButtonVariants> & {
    type?: "button" | "submit" | "reset"
  }) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  )
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "cv:flex cv:items-center cv:gap-2 cv:text-sm cv:text-muted-foreground cv:[&_svg]:pointer-events-none cv:[&_svg:not([class*=size-])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        "cv:flex-1 cv:rounded-none cv:border-0 cv:bg-transparent cv:shadow-none cv:ring-0 cv:focus-visible:ring-0 cv:disabled:bg-transparent cv:aria-invalid:ring-0 cv:dark:bg-transparent cv:dark:disabled:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        "cv:flex-1 cv:resize-none cv:rounded-none cv:border-0 cv:bg-transparent cv:py-2 cv:shadow-none cv:ring-0 cv:focus-visible:ring-0 cv:disabled:bg-transparent cv:aria-invalid:ring-0 cv:dark:bg-transparent cv:dark:disabled:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
}
