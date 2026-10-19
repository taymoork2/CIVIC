import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "cv:h-8 cv:w-full cv:min-w-0 cv:rounded-lg cv:border cv:border-input cv:bg-transparent cv:px-2.5 cv:py-1 cv:text-base cv:transition-colors cv:outline-none cv:file:inline-flex cv:file:h-6 cv:file:border-0 cv:file:bg-transparent cv:file:text-sm cv:file:font-medium cv:file:text-foreground cv:placeholder:text-muted-foreground cv:focus-visible:border-ring cv:focus-visible:ring-3 cv:focus-visible:ring-ring/50 cv:disabled:pointer-events-none cv:disabled:cursor-not-allowed cv:disabled:bg-input/50 cv:disabled:opacity-50 cv:aria-invalid:border-destructive cv:aria-invalid:ring-3 cv:aria-invalid:ring-destructive/20 cv:md:text-sm cv:dark:bg-input/30 cv:dark:disabled:bg-input/80 cv:dark:aria-invalid:border-destructive/50 cv:dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
