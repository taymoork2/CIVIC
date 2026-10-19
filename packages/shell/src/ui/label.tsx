import * as React from "react"
import { cn } from "cn"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "cv:flex cv:items-center cv:gap-2 cv:text-sm cv:leading-none cv:font-medium cv:select-none cv:group-data-[disabled=true]:pointer-events-none cv:group-data-[disabled=true]:opacity-50 cv:peer-disabled:cursor-not-allowed cv:peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
