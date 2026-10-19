import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "cv:flex cv:field-sizing-content cv:min-h-16 cv:w-full cv:rounded-lg cv:border cv:border-input cv:bg-transparent cv:px-2.5 cv:py-2 cv:text-base cv:transition-colors cv:outline-none cv:placeholder:text-muted-foreground cv:focus-visible:border-ring cv:focus-visible:ring-3 cv:focus-visible:ring-ring/50 cv:disabled:cursor-not-allowed cv:disabled:bg-input/50 cv:disabled:opacity-50 cv:aria-invalid:border-destructive cv:aria-invalid:ring-3 cv:aria-invalid:ring-destructive/20 cv:md:text-sm cv:dark:bg-input/30 cv:dark:disabled:bg-input/80 cv:dark:aria-invalid:border-destructive/50 cv:dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
