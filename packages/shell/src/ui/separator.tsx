import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"
import { cn } from "cn"

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "cv:shrink-0 cv:bg-border cv:data-horizontal:h-px cv:data-horizontal:w-full cv:data-vertical:w-px cv:data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
