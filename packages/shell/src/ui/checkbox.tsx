import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { cn } from "cn"
import { CheckIcon } from "lucide-react"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "cv:peer cv:relative cv:flex cv:size-4 cv:shrink-0 cv:items-center cv:justify-center cv:rounded-[4px] cv:border cv:border-input cv:transition-colors cv:outline-none cv:group-has-disabled/field:opacity-50 cv:group-has-[:focus-visible]/field-label:ring-0 cv:group-has-[:focus-visible]/field-label:not-data-checked:border-input cv:after:absolute cv:after:-inset-x-3 cv:after:-inset-y-2 cv:focus-visible:border-ring cv:focus-visible:ring-3 cv:focus-visible:ring-ring/50 cv:disabled:cursor-not-allowed cv:disabled:opacity-50 cv:aria-invalid:border-destructive cv:aria-invalid:ring-3 cv:aria-invalid:ring-destructive/20 cv:aria-invalid:aria-checked:border-primary cv:dark:bg-input/30 cv:dark:aria-invalid:border-destructive/50 cv:dark:aria-invalid:ring-destructive/40 cv:data-checked:border-primary cv:data-checked:bg-primary cv:data-checked:text-primary-foreground cv:group-has-[:focus-visible]/field-label:data-checked:border-primary cv:dark:data-checked:bg-primary",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="cv:grid cv:place-content-center cv:text-current cv:transition-none cv:[&>svg]:size-3.5"
      >
        <CheckIcon
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
