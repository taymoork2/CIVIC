import * as React from "react"
import { cn } from "cn"
import { ChevronDownIcon } from "lucide-react"

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default"
}

function NativeSelect({
  className,
  size = "default",
  ...props
}: NativeSelectProps) {
  return (
    <div
      className={cn(
        "cv:group/native-select cv:relative cv:w-fit cv:has-[select:disabled]:opacity-50",
        className
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className="cv:h-8 cv:w-full cv:min-w-0 cv:appearance-none cv:rounded-lg cv:border cv:border-input cv:bg-transparent cv:py-1 cv:pr-8 cv:pl-2.5 cv:text-base cv:md:text-sm cv:transition-colors cv:outline-none cv:select-none cv:selection:bg-primary cv:selection:text-primary-foreground cv:placeholder:text-muted-foreground cv:focus-visible:border-ring cv:focus-visible:ring-3 cv:focus-visible:ring-ring/50 cv:disabled:pointer-events-none cv:disabled:cursor-not-allowed cv:aria-invalid:border-destructive cv:aria-invalid:ring-3 cv:aria-invalid:ring-destructive/20 cv:data-[size=sm]:h-7 cv:data-[size=sm]:rounded-[min(var(--radius-md),10px)] cv:data-[size=sm]:py-0.5 cv:dark:bg-input/30 cv:dark:hover:bg-input/50 cv:dark:aria-invalid:border-destructive/50 cv:dark:aria-invalid:ring-destructive/40"
        {...props}
      />
      <ChevronDownIcon className="cv:pointer-events-none cv:absolute cv:top-1/2 cv:right-2.5 cv:size-4 cv:-translate-y-1/2 cv:text-muted-foreground cv:select-none" aria-hidden="true" data-slot="native-select-icon" />
    </div>
  )
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("cv:bg-[Canvas] cv:text-[CanvasText]", className)}
      {...props}
    />
  )
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("cv:bg-[Canvas] cv:text-[CanvasText]", className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
